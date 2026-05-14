import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { embedText } from "@/lib/rag/embeddings";
import { countVectorChunks, upsertVectorChunk } from "@/lib/rag/vectorStore";
import { ensureGeoReferenceSchema, upsertSchoolReference } from "@/lib/geo/referenceStore";
import type { KnowledgeChunk } from "@/lib/rag/types";

function loadEnvFromFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    if (!key || process.env[key]) continue;
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFromFile(path.join(process.cwd(), ".env.local"));
loadEnvFromFile(path.join(process.cwd(), ".env"));

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  fields.push(current.trim());
  return fields;
}

function parseCsv(content: string): Array<Record<string, string>> {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (cols[j] ?? "").trim();
    }
    rows.push(row);
  }

  return rows;
}

function normalizeAlias(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildAliases(row: Record<string, string>): string[] {
  const rawAliases = [
    row["School Name (ULCS)"],
    row["Publication Name"],
    row["Publication Name Alpha List"],
    row["Abbreviated Name"],
  ];

  const seen = new Set<string>();
  const aliases: string[] = [];

  for (const raw of rawAliases) {
    if (!raw) continue;
    const alias = normalizeAlias(raw);
    if (!alias) continue;
    const key = alias.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    aliases.push(alias);
  }

  return aliases;
}

function makeChunkId(row: Record<string, string>, index: number): string {
  const srcId = row["SRC School ID"];
  const ulcs = row["ULCS Code"];
  const key = (srcId || ulcs || `row-${index + 1}`).toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return `school-ref-${key}`;
}

function makeChunk(row: Record<string, string>, index: number): KnowledgeChunk | null {
  const schoolName = row["School Name (ULCS)"] || row["Publication Name"];
  if (!schoolName) return null;

  const aliases = buildAliases(row);
  const city = row["City"];
  const state = row["State"];
  const zipCode = row["Zip Code"];
  const street = row["Street Address"];
  const level = row["School Level"];
  const admission = row["Admission Type"];
  const governance = row["Governance"];
  const management = row["Management Organization"];
  const gradeSpan = row["Current Grade Span Served"];
  const network = row["Learning Network"];
  const council = row["City Council District"];
  const gps = row["GPS Location"];
  const category = row["School Reporting Category"];

  const aliasText = aliases.length > 0 ? aliases.join("; ") : "None listed";

  const text = [
    `School reference record for ${schoolName}.`,
    `Aliases and alternate naming conventions: ${aliasText}.`,
    `Address: ${street || "N/A"}, ${city || "N/A"}, ${state || "N/A"} ${zipCode || "N/A"}.`,
    `School level: ${level || "N/A"}. Admission type: ${admission || "N/A"}.`,
    `Grade span served: ${gradeSpan || "N/A"}.`,
    `Governance: ${governance || "N/A"}. Management organization: ${management || "N/A"}.`,
    `Reporting category: ${category || "N/A"}. Learning network: ${network || "N/A"}.`,
    `City council district: ${council || "N/A"}. GPS location: ${gps || "N/A"}.`,
    `Use this record to resolve school-name references, abbreviations, and neighborhood-adjacent geography in Philadelphia.`
  ].join(" ");

  const tags = [
    "school",
    "geography",
    "philadelphia",
    "school-reference",
    level?.toLowerCase(),
    admission?.toLowerCase(),
    governance?.toLowerCase(),
    network?.toLowerCase(),
    zipCode ? `zip-${zipCode}` : "",
    council ? `district-${council}` : "",
    ...aliases.slice(0, 5).map((a) => a.toLowerCase()),
  ]
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .filter((value, idx, arr) => arr.indexOf(value) === idx);

  return {
    id: makeChunkId(row, index),
    title: schoolName,
    text,
    tags,
    source: "knowledge-base",
    topic: "geography",
  };
}

function findDefaultCsvPath(): string | null {
  const files = readdirSync(process.cwd());
  const match = files
    .filter((name) => /master school list/i.test(name) && name.toLowerCase().endsWith(".csv"))
    .sort()
    .reverse()[0];
  return match ? path.join(process.cwd(), match) : null;
}

async function main(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.error("GEMINI_API_KEY is required.");
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }

  const csvPath = process.argv[2] ?? findDefaultCsvPath();
  if (!csvPath) {
    console.error("No school master list CSV found. Pass a CSV file path as the first argument.");
    process.exit(1);
  }
  if (!existsSync(csvPath)) {
    console.error(`CSV file not found: ${csvPath}`);
    process.exit(1);
  }

  const csvText = readFileSync(csvPath, "utf8");
  const rows = parseCsv(csvText);
  console.log(`Loaded ${rows.length} school rows from ${path.basename(csvPath)}`);

  await ensureGeoReferenceSchema();

  let inserted = 0;
  let relationalUpserts = 0;
  let skipped = 0;
  let failedEmbeddings = 0;
  let failedUpserts = 0;
  let failedRelational = 0;

  for (let i = 0; i < rows.length; i++) {
    const chunk = makeChunk(rows[i], i);
    if (!chunk) {
      skipped += 1;
      continue;
    }

    const aliases = buildAliases(rows[i]).map((alias) => ({
      alias,
      aliasType: "name-variant",
    }));

    if (!aliases.some((a) => a.alias.toLowerCase() === chunk.title.toLowerCase())) {
      aliases.unshift({ alias: chunk.title, aliasType: "canonical" });
    }

    try {
      await upsertSchoolReference({
        schoolKey: chunk.id.replace(/^school-ref-/, ""),
        ulcsCode: rows[i]["ULCS Code"] || undefined,
        srcSchoolId: rows[i]["SRC School ID"] || undefined,
        schoolName: chunk.title,
        publicationName: rows[i]["Publication Name"] || undefined,
        publicationNameAlpha: rows[i]["Publication Name Alpha List"] || undefined,
        abbreviatedName: rows[i]["Abbreviated Name"] || undefined,
        schoolLevel: rows[i]["School Level"] || undefined,
        admissionType: rows[i]["Admission Type"] || undefined,
        gradeSpan: rows[i]["Current Grade Span Served"] || undefined,
        governance: rows[i]["Governance"] || undefined,
        managementOrganization: rows[i]["Management Organization"] || undefined,
        reportingCategory: rows[i]["School Reporting Category"] || undefined,
        cityCouncilDistrict: rows[i]["City Council District"] || undefined,
        streetAddress: rows[i]["Street Address"] || undefined,
        city: rows[i]["City"] || undefined,
        state: rows[i]["State"] || undefined,
        zipCode: rows[i]["Zip Code"] || undefined,
        learningNetwork: rows[i]["Learning Network"] || undefined,
        gpsLocation: rows[i]["GPS Location"] || undefined,
        aliases,
      });
      relationalUpserts += 1;
    } catch (err) {
      failedRelational += 1;
      console.warn(
        `[${i + 1}/${rows.length}] Relational upsert failed for ${chunk.id}: ${err instanceof Error ? err.message : err}`
      );
    }

    let embedding: number[] | null = null;
    try {
      embedding = await embedText(apiKey, `${chunk.title}\n${chunk.text}`);
    } catch (err) {
      failedEmbeddings += 1;
      console.warn(
        `[${i + 1}/${rows.length}] Embedding failed for ${chunk.id}: ${err instanceof Error ? err.message : err}`
      );
      continue;
    }

    if (!embedding || embedding.length === 0) {
      skipped += 1;
      continue;
    }

    try {
      await upsertVectorChunk(chunk, embedding);
      inserted += 1;
      if (inserted % 25 === 0) {
        console.log(`  Progress: ${inserted} upserted (${i + 1}/${rows.length} processed)`);
      }
    } catch (err) {
      failedUpserts += 1;
      console.warn(
        `[${i + 1}/${rows.length}] Upsert failed for ${chunk.id}: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  const total = await countVectorChunks();

  console.log("\n-- School CSV ingest complete ---------------------------------");
  console.log(`  School rows:           ${rows.length}`);
  console.log(`  Relational upserts:    ${relationalUpserts}`);
  console.log(`  Relational failures:   ${failedRelational}`);
  console.log(`  Successfully upserted: ${inserted}`);
  console.log(`  Failed embeddings:     ${failedEmbeddings}`);
  console.log(`  Failed upserts:        ${failedUpserts}`);
  console.log(`  Skipped:               ${skipped}`);
  console.log(`  Total chunks in DB:    ${total}`);
}

main().catch((err) => {
  console.error("Ingest failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
