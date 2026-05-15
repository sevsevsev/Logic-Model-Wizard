import { promises as fs } from "node:fs";
import path from "node:path";
import {
  generateCandidatePack,
  type CandidatePack,
  type CandidatePackInputIncident,
} from "@/lib/regression/candidates";

interface IncidentCollectionFile {
  incidents?: CandidatePackInputIncident[];
}

function readArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(path.resolve(filePath), "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/, "")) as T;
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

function toMarkdown(pack: CandidatePack, incidentInputPath: string): string {
  const lines: string[] = [];
  lines.push("# Candidate Scenario Pack (Propose-Only)");
  lines.push("");
  lines.push(`Generated: ${pack.generatedAt}`);
  lines.push(`Incident source: ${incidentInputPath}`);
  lines.push(`Source incidents: ${pack.sourceIncidentCount}`);
  lines.push(`Generated candidates: ${pack.generatedCandidateCount}`);
  lines.push("");

  lines.push("## By Failure Class");
  lines.push("");
  lines.push("| Failure class | Candidates |");
  lines.push("|---|---:|");
  Object.entries(pack.byFailureClass)
    .sort((a, b) => b[1] - a[1])
    .forEach(([klass, count]) => {
      lines.push(`| ${klass} | ${count} |`);
    });

  lines.push("");
  lines.push("## Candidates");

  for (const candidate of pack.candidates) {
    lines.push("");
    lines.push(`### ${candidate.id}`);
    lines.push("");
    lines.push(`- Expected class: ${candidate.expectedFailureClass}`);
    lines.push(`- Edge family: ${candidate.edgeFamily}`);
    lines.push(`- Source incident: ${candidate.sourceIncidentId}`);
    lines.push(`- Description: ${candidate.description}`);
    lines.push(`- Rationale: ${candidate.rationale}`);
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(candidate, null, 2));
    lines.push("```");
  }

  return lines.join("\n");
}

async function main(): Promise<void> {
  const incidentPath = readArg("--incidents") ?? "docs/regression-reports/incident-collection-latest.json";
  const maxPerClassRaw = Number(readArg("--max-per-class") ?? "2");
  const maxPerClass = Number.isFinite(maxPerClassRaw) ? Math.max(1, Math.floor(maxPerClassRaw)) : 2;

  const parsed = await readJsonFile<IncidentCollectionFile>(incidentPath);
  const incidents = Array.isArray(parsed.incidents) ? parsed.incidents : [];

  const pack = generateCandidatePack(incidents, { maxPerClass });

  const outDir = path.resolve("docs/regression-reports");
  await ensureDir(outDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const jsonPath = path.join(outDir, `candidate-pack-${stamp}.json`);
  const latestJsonPath = path.join(outDir, "candidate-pack-latest.json");
  await fs.writeFile(jsonPath, JSON.stringify(pack, null, 2), "utf8");
  await fs.writeFile(latestJsonPath, JSON.stringify(pack, null, 2), "utf8");

  const markdown = toMarkdown(pack, path.resolve(incidentPath));
  const mdPath = path.join(outDir, `candidate-pack-${stamp}.md`);
  const latestMdPath = path.join(outDir, "candidate-pack-latest.md");
  await fs.writeFile(mdPath, markdown, "utf8");
  await fs.writeFile(latestMdPath, markdown, "utf8");

  console.log("Candidate generation complete.");
  console.log(`- ${latestJsonPath}`);
  console.log(`- ${latestMdPath}`);
  console.log(`- Candidates: ${pack.generatedCandidateCount}`);
}

main().catch((error) => {
  console.error("Candidate generation failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
