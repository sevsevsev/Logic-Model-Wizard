import { promises as fs } from "node:fs";
import path from "node:path";

interface IncidentCollectionFile {
  generatedAt?: string;
  counts?: {
    incidents?: number;
    threads?: number;
    byClass?: Record<string, number>;
  };
  incidents?: Array<{
    id: string;
    failureClass: string;
    severity: "high" | "medium" | "low";
    summary: string;
    confidence: "high" | "medium" | "low";
  }>;
}

interface CandidatePackFile {
  generatedAt?: string;
  generatedCandidateCount?: number;
  candidates?: Array<{ id: string; expectedFailureClass: string; sourceIncidentId: string }>;
}

interface CandidateRunFile {
  generatedAt?: string;
  summary?: { total: number; passed: number; failed: number };
  results?: Array<{ id: string; expectedFailureClass: string; failures: string[] }>;
}

interface UnattendedFile {
  generatedAt?: string;
  budget?: number;
  finalDecision?: string;
  iterations?: Array<{
    iteration: number;
    highSeverityFailures: number;
    totalIncidents: number;
    generatedCandidates: number;
    candidateFailedScenarios?: number;
    stopDecision?: { reason: string };
  }>;
}

async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(path.resolve(filePath), "utf8");
    return JSON.parse(raw.replace(/^\uFEFF/, "")) as T;
  } catch {
    return null;
  }
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

function buildMarkdown(payload: {
  generatedAt: string;
  incidents: IncidentCollectionFile | null;
  candidates: CandidatePackFile | null;
  candidateRun: CandidateRunFile | null;
  unattended: UnattendedFile | null;
}): string {
  const lines: string[] = [];

  const incidentCount = payload.incidents?.counts?.incidents ?? 0;
  const threadCount = payload.incidents?.counts?.threads ?? 0;
  const highSeverityCount =
    payload.incidents?.incidents?.filter((incident) => incident.severity === "high").length ?? 0;
  const candidateCount = payload.candidates?.generatedCandidateCount ?? 0;
  const candidateRunFailed = payload.candidateRun?.summary?.failed ?? 0;
  const candidateRunPassed = payload.candidateRun?.summary?.passed ?? 0;
  const finalDecision = payload.unattended?.finalDecision ?? "unknown";

  lines.push("# Autonomous QA Dashboard");
  lines.push("");
  lines.push(`Generated: ${payload.generatedAt}`);
  lines.push("");

  lines.push("## Snapshot");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---:|");
  lines.push(`| Incidents | ${incidentCount} |`);
  lines.push(`| Incident threads | ${threadCount} |`);
  lines.push(`| High-severity incidents | ${highSeverityCount} |`);
  lines.push(`| Generated candidates | ${candidateCount} |`);
  lines.push(`| Candidate run pass | ${candidateRunPassed} |`);
  lines.push(`| Candidate run fail | ${candidateRunFailed} |`);
  lines.push(`| Unattended final decision | ${finalDecision} |`);

  lines.push("");
  lines.push("## Flagged Bugs");
  lines.push("");
  const flagged = (payload.incidents?.incidents ?? [])
    .filter((incident) => incident.severity === "high")
    .slice(0, 10);

  if (flagged.length === 0) {
    lines.push("No high-severity incidents were flagged in the latest collection.");
  } else {
    lines.push("| Incident | Class | Confidence | Summary |");
    lines.push("|---|---|---|---|");
    flagged.forEach((incident) => {
      lines.push(
        `| ${incident.id} | ${incident.failureClass} | ${incident.confidence} | ${incident.summary.replace(/\|/g, "\\|")} |`
      );
    });
  }

  lines.push("");
  lines.push("## Candidate Status");
  lines.push("");
  if ((payload.candidateRun?.results ?? []).length === 0) {
    lines.push("No candidate run results found.");
  } else {
    lines.push("| Candidate | Expected class | Status | Failures |");
    lines.push("|---|---|---|---:|");
    (payload.candidateRun?.results ?? []).forEach((result) => {
      lines.push(
        `| ${result.id} | ${result.expectedFailureClass} | ${result.failures.length === 0 ? "PASS" : "FAIL"} | ${result.failures.length} |`
      );
    });
  }

  lines.push("");
  lines.push("## Unattended Iteration Trend");
  lines.push("");
  const iterations = payload.unattended?.iterations ?? [];
  if (iterations.length === 0) {
    lines.push("No unattended iteration history found.");
  } else {
    lines.push("| Iteration | High severity | Incidents | Candidates | Candidate fails | Decision |");
    lines.push("|---|---:|---:|---:|---:|---|");
    iterations.forEach((item) => {
      lines.push(
        `| ${item.iteration} | ${item.highSeverityFailures} | ${item.totalIncidents} | ${item.generatedCandidates} | ${item.candidateFailedScenarios ?? 0} | ${item.stopDecision?.reason ?? "continue"} |`
      );
    });
  }

  lines.push("");
  lines.push("## Suggested Next Actions");
  lines.push("");
  if (candidateRunFailed > 0) {
    lines.push("1. Prioritize fixing failed candidate scenarios before adding new candidates.");
  } else if (highSeverityCount > 0) {
    lines.push("1. Generate additional candidate coverage for remaining high-severity incidents.");
  } else {
    lines.push("1. Promote stable candidate scenarios into the permanent regression suite.");
  }

  return lines.join("\n");
}

async function main(): Promise<void> {
  const incidents = await readJsonSafe<IncidentCollectionFile>(
    "docs/regression-reports/incident-collection-latest.json"
  );
  const candidates = await readJsonSafe<CandidatePackFile>(
    "docs/regression-reports/candidate-pack-latest.json"
  );
  const candidateRun = await readJsonSafe<CandidateRunFile>(
    "docs/regression-reports/candidate-run-latest.json"
  );
  const unattended = await readJsonSafe<UnattendedFile>(
    "docs/regression-reports/unattended-loop-latest.json"
  );

  const generatedAt = new Date().toISOString();
  const payload = {
    generatedAt,
    incidents,
    candidates,
    candidateRun,
    unattended,
  };

  const outDir = path.resolve("docs/regression-reports");
  await ensureDir(outDir);
  const stamp = generatedAt.replace(/[:.]/g, "-");

  const jsonPath = path.join(outDir, `qa-dashboard-${stamp}.json`);
  const latestJsonPath = path.join(outDir, "qa-dashboard-latest.json");
  await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  await fs.writeFile(latestJsonPath, JSON.stringify(payload, null, 2), "utf8");

  const markdown = buildMarkdown(payload);
  const mdPath = path.join(outDir, `qa-dashboard-${stamp}.md`);
  const latestMdPath = path.join(outDir, "qa-dashboard-latest.md");
  await fs.writeFile(mdPath, markdown, "utf8");
  await fs.writeFile(latestMdPath, markdown, "utf8");

  console.log("QA dashboard generated.");
  console.log(`- ${latestJsonPath}`);
  console.log(`- ${latestMdPath}`);
}

main().catch((error) => {
  console.error("QA dashboard generation failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
