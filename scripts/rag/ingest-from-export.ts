/**
 * Ingests chunks from a vector export JSON file into the Postgres vector store.
 *
 * The export format (from the external pipeline) differs from the app's KnowledgeChunk
 * schema. This script normalises the fields, fixes UTF-8 encoding corruption, maps
 * canonicalDomain to the app's topic taxonomy, and embeds + upserts each chunk.
 *
 * Usage:
 *   npm run rag:ingest-export
 * or explicitly:
 *   tsx --env-file .env.local scripts/rag/ingest-from-export.ts [path/to/export.json]
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// ── env loading (same pattern as other rag scripts) ──────────────────────────

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

// ── imports (after env is loaded) ────────────────────────────────────────────

import { embedText } from "@/lib/rag/embeddings";
import { upsertVectorChunk, countVectorChunks } from "@/lib/rag/vectorStore";
import type { KnowledgeChunk, KnowledgeChunkTopic, KnowledgeSource } from "@/lib/rag/types";

// ── types for the export format ───────────────────────────────────────────────

interface ExportChunkMetadata {
  qualityScore?: number;
  summary?: string;
  keywords?: string[];
  stakeholderTags?: string[];
  pageReference?: string;
  inferredLinks?: string;
  canonicalDomain?: string;
  qaPairs?: { question: string; answer: string }[];
}

interface ExportChunk {
  id: string;
  documentId: string;
  text: string;
  metadata: ExportChunkMetadata;
}

// ── encoding fix ──────────────────────────────────────────────────────────────
// The export has UTF-8 bytes that were mis-decoded as Latin-1 (mojibake).
// This table maps the common corrupt sequences back to the correct Unicode characters.

const ENCODING_FIXES: [RegExp, string][] = [
  [/â€™/g, "\u2019"],  // right single quotation mark '
  [/â€˜/g, "\u2018"],  // left single quotation mark '
  [/â€œ/g, "\u201C"],  // left double quotation mark "
  [/â€/g, "\u201D"],   // right double quotation mark " (must come after â€œ)
  [/â€"/g, "\u2013"],  // en dash –
  [/â€"/g, "\u2014"],  // em dash — (same bytes, context-dependent; en dash covers most cases)
  [/Ã©/g, "\u00E9"],   // é
  [/Ã /g, "\u00E0"],   // à
  [/Ã¨/g, "\u00E8"],   // è
  [/Ã®/g, "\u00EE"],   // î
  [/Ã´/g, "\u00F4"],   // ô
  [/Ã¹/g, "\u00F9"],   // ù
  [/Ã»/g, "\u00FB"],   // û
  [/Ãª/g, "\u00EA"],   // ê
  [/Â /g, " "],         // non-breaking space rendered as Â + space
];

function fixEncoding(text: string): string {
  let result = text;
  for (const [pattern, replacement] of ENCODING_FIXES) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ── canonicalDomain → topic mapping ──────────────────────────────────────────

const DOMAIN_TO_TOPIC: Record<string, KnowledgeChunkTopic> = {
  "Strategic Context": "framework-foundation",
  "Intended Impact": "intended-impact",
  "Resources (Inputs)": "resources",
  "Activities": "activities",
  "Outputs": "outputs",
  "Outcomes": "outcomes",
  "External Factors": "framework-foundation",
  "Other": "framework-foundation",
};

function mapTopic(canonicalDomain?: string): KnowledgeChunkTopic {
  if (!canonicalDomain) return "framework-foundation";
  return DOMAIN_TO_TOPIC[canonicalDomain] ?? "framework-foundation";
}

// ── title derivation ──────────────────────────────────────────────────────────

function deriveTitle(chunk: ExportChunk): string {
  const ref = chunk.metadata.pageReference?.trim();
  const summary = chunk.metadata.summary?.trim();

  // Use pageReference if it's a meaningful short string
  if (ref && ref.length > 0 && ref.length <= 80) return ref;

  // Otherwise truncate the summary to ~60 chars at a word boundary
  if (summary) {
    if (summary.length <= 60) return summary;
    const truncated = summary.slice(0, 60);
    const lastSpace = truncated.lastIndexOf(" ");
    return (lastSpace > 30 ? truncated.slice(0, lastSpace) : truncated) + "…";
  }

  // Final fallback
  return chunk.id;
}

// ── tags derivation ───────────────────────────────────────────────────────────

function deriveTags(chunk: ExportChunk): string[] {
  const keywords = (chunk.metadata.keywords ?? []).map((k) => k.toLowerCase().trim());
  const stakeholderTags = (chunk.metadata.stakeholderTags ?? []).map((t) => t.toLowerCase().trim());
  const combined = [...new Set([...keywords, ...stakeholderTags])];
  return combined.filter((t) => t.length > 0);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
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

  // Resolve export file path: first CLI arg, otherwise find by glob in project root
  const exportPath: string =
    process.argv[2] ??
    (() => {
      const cwd = process.cwd();
      const files = readdirSync(cwd)
        .filter((f) => f.startsWith("vector-export-") && f.endsWith(".json"))
        .sort()
        .reverse();
      if (files.length === 0) {
        console.error("No vector-export-*.json found in project root. Pass the path as an argument.");
        process.exit(1);
      }
      const chosen = path.join(cwd, files[0]);
      console.log(`Auto-detected export file: ${files[0]}`);
      return chosen;
    })();

  if (!existsSync(exportPath)) {
    console.error(`Export file not found: ${exportPath}`);
    process.exit(1);
  }

  const raw = readFileSync(exportPath, "utf8");
  const chunks: ExportChunk[] = JSON.parse(raw);
  console.log(`Loaded ${chunks.length} chunks from ${path.basename(exportPath)}`);

  let inserted = 0;
  let failedEmbeddings = 0;
  let failedUpserts = 0;
  let skippedEmpty = 0;

  for (let i = 0; i < chunks.length; i++) {
    const raw = chunks[i];
    const text = fixEncoding(raw.text ?? "").trim();
    if (!text) {
      skippedEmpty += 1;
      continue;
    }

    const title = fixEncoding(deriveTitle(raw));
    const tags = deriveTags(raw);
    const topic = mapTopic(raw.metadata.canonicalDomain);
    const source: KnowledgeSource = "knowledge-base";

    const chunk: KnowledgeChunk = {
      id: raw.id,
      title,
      text,
      tags,
      source,
      topic,
    };

    // Embed using title + text (same pattern as ingest-knowledge.ts)
    let embedding: number[] | null;
    try {
      embedding = await embedText(apiKey, `${title}\n${text}`);
    } catch (err) {
      console.warn(`[${i + 1}/${chunks.length}] Embedding failed for "${chunk.id}": ${err instanceof Error ? err.message : err}`);
      failedEmbeddings += 1;
      continue;
    }

    if (!embedding || embedding.length === 0) {
      skippedEmpty += 1;
      continue;
    }

    try {
      await upsertVectorChunk(chunk, embedding);
      inserted += 1;
      if (inserted % 25 === 0) {
        console.log(`  Progress: ${inserted} upserted (${i + 1}/${chunks.length} processed)…`);
      }
    } catch (err) {
      console.warn(`[${i + 1}/${chunks.length}] Upsert failed for "${chunk.id}": ${err instanceof Error ? err.message : err}`);
      failedUpserts += 1;
    }
  }

  const total = await countVectorChunks();

  console.log("\n── Ingest complete ──────────────────────────────────────");
  console.log(`  Chunks in export:       ${chunks.length}`);
  console.log(`  Successfully upserted:  ${inserted}`);
  console.log(`  Failed embeddings:      ${failedEmbeddings}`);
  console.log(`  Failed upserts:         ${failedUpserts}`);
  console.log(`  Skipped (empty):        ${skippedEmpty}`);
  console.log(`  Total in DB now:        ${total}`);
}

main().catch((err) => {
  console.error("Ingest failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
