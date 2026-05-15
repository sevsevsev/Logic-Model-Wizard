import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { evaluateStopCondition } from "@/lib/regression/unattended";

interface IncidentCollectionFile {
  incidents?: Array<{ severity?: "high" | "medium" | "low" }>;
  counts?: {
    incidents?: number;
    byClass?: Record<string, number>;
  };
}

interface CandidatePackFile {
  generatedCandidateCount?: number;
}

interface CandidateRunFile {
  summary?: {
    total?: number;
    passed?: number;
    failed?: number;
  };
}

interface IterationRecord {
  iteration: number;
  baselineExitCode: number;
  baselineCommand: string;
  collectionCommand: string;
  candidateCommand: string;
  candidateRunCommand: string;
  candidateRunExitCode: number;
  highSeverityFailures: number;
  totalIncidents: number;
  generatedCandidates: number;
  candidatePassedScenarios: number;
  candidateFailedScenarios: number;
  stopDecision: {
    shouldStop: boolean;
    reason: string;
  };
}

function readArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

function runCommand(command: string): { exitCode: number; stdout: string; stderr: string } {
  const result = spawnSync(command, {
    shell: true,
    encoding: "utf8",
    stdio: "pipe",
  });

  return {
    exitCode: typeof result.status === "number" ? result.status : 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(path.resolve(filePath), "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/, "")) as T;
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

function toMarkdown(payload: {
  generatedAt: string;
  budget: number;
  noImprovementWindow: number;
  destabilizationThreshold: number;
  iterations: IterationRecord[];
  finalDecision: string;
}): string {
  const lines: string[] = [];
  lines.push("# Unattended Loop Run");
  lines.push("");
  lines.push(`Generated: ${payload.generatedAt}`);
  lines.push(`Budget: ${payload.budget}`);
  lines.push(`No-improvement window: ${payload.noImprovementWindow}`);
  lines.push(`Destabilization threshold: ${payload.destabilizationThreshold}`);
  lines.push(`Final decision: ${payload.finalDecision}`);
  lines.push("");
  lines.push("## Iterations");
  lines.push("");
  lines.push("| Iteration | Baseline exit | Candidate run exit | High severity | Incidents | Candidates | Candidate fail | Decision |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---|");
  payload.iterations.forEach((record) => {
    lines.push(
      `| ${record.iteration} | ${record.baselineExitCode} | ${record.candidateRunExitCode} | ${record.highSeverityFailures} | ${record.totalIncidents} | ${record.generatedCandidates} | ${record.candidateFailedScenarios} | ${record.stopDecision.reason} |`
    );
  });
  return lines.join("\n");
}

async function main(): Promise<void> {
  const budgetRaw = Number(readArg("--budget") ?? "6");
  const budget = Number.isFinite(budgetRaw) ? Math.max(1, Math.floor(budgetRaw)) : 6;

  const noImprovementRaw = Number(readArg("--no-improvement-window") ?? "2");
  const noImprovementWindow = Number.isFinite(noImprovementRaw)
    ? Math.max(1, Math.floor(noImprovementRaw))
    : 2;

  const destabilizationRaw = Number(readArg("--destabilization-threshold") ?? "1");
  const destabilizationThreshold = Number.isFinite(destabilizationRaw)
    ? Math.max(0, Math.floor(destabilizationRaw))
    : 1;

  const debugSource = readArg("--debug-source") ?? "none";
  const debugFile = readArg("--debug-file") ?? "latest_debug_report.json";

  const iterations: IterationRecord[] = [];
  let finalDecision = "budget_exhausted";

  for (let iteration = 1; iteration <= budget; iteration++) {
    const baselineCommand = "npm run -s test:agent-scenarios";
    const baseline = runCommand(baselineCommand);

    const collectionCommand =
      debugSource === "none"
        ? "npm run -s collect:incidents -- --no-debug"
        : `npm run -s collect:incidents -- --debug-source ${debugSource} --debug-file ${debugFile}`;
    const collection = runCommand(collectionCommand);
    if (collection.exitCode !== 0) {
      throw new Error(`Incident collection failed on iteration ${iteration}: ${collection.stderr || collection.stdout}`);
    }

    const candidateCommand =
      "npm run -s generate:candidates -- --incidents docs/regression-reports/incident-collection-latest.json --max-per-class 2";
    const candidate = runCommand(candidateCommand);
    if (candidate.exitCode !== 0) {
      throw new Error(`Candidate generation failed on iteration ${iteration}: ${candidate.stderr || candidate.stdout}`);
    }

    const candidateRunCommand =
      "npm run -s run:candidates -- --pack docs/regression-reports/candidate-pack-latest.json";
    const candidateRun = runCommand(candidateRunCommand);

    const incidentFile = await readJsonFile<IncidentCollectionFile>(
      "docs/regression-reports/incident-collection-latest.json"
    );
    const candidateFile = await readJsonFile<CandidatePackFile>(
      "docs/regression-reports/candidate-pack-latest.json"
    );
    const candidateRunFile = await readJsonFile<CandidateRunFile>(
      "docs/regression-reports/candidate-run-latest.json"
    );

    const incidents = Array.isArray(incidentFile.incidents) ? incidentFile.incidents : [];
    const incidentHighSeverity = incidents.filter((incident) => incident.severity === "high").length;
    const candidateFailedScenarios = Number(candidateRunFile.summary?.failed ?? 0);
    const candidatePassedScenarios = Number(candidateRunFile.summary?.passed ?? 0);
    const highSeverityFailures = incidentHighSeverity + candidateFailedScenarios;

    const record: IterationRecord = {
      iteration,
      baselineExitCode: baseline.exitCode,
      baselineCommand,
      collectionCommand,
      candidateCommand,
      candidateRunCommand,
      candidateRunExitCode: candidateRun.exitCode,
      highSeverityFailures,
      totalIncidents: incidents.length,
      generatedCandidates: Number(candidateFile.generatedCandidateCount ?? 0),
      candidatePassedScenarios,
      candidateFailedScenarios,
      stopDecision: { shouldStop: false, reason: "continue" },
    };

    const stop = evaluateStopCondition({
      history: iterations
        .map((item) => ({ iteration: item.iteration, highSeverityFailures: item.highSeverityFailures }))
        .concat({ iteration, highSeverityFailures }),
      noImprovementWindow,
      destabilizationThreshold,
      maxIterations: budget,
    });

    record.stopDecision = stop;
    iterations.push(record);

    if (stop.shouldStop) {
      finalDecision = stop.reason;
      break;
    }
  }

  if (iterations.length === budget && finalDecision === "budget_exhausted") {
    finalDecision = "budget_exhausted";
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    budget,
    noImprovementWindow,
    destabilizationThreshold,
    iterations,
    finalDecision,
  };

  const outDir = path.resolve("docs/regression-reports");
  await ensureDir(outDir);
  const stamp = payload.generatedAt.replace(/[:.]/g, "-");

  const jsonPath = path.join(outDir, `unattended-loop-${stamp}.json`);
  const latestJsonPath = path.join(outDir, "unattended-loop-latest.json");
  await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  await fs.writeFile(latestJsonPath, JSON.stringify(payload, null, 2), "utf8");

  const markdown = toMarkdown(payload);
  const mdPath = path.join(outDir, `unattended-loop-${stamp}.md`);
  const latestMdPath = path.join(outDir, "unattended-loop-latest.md");
  await fs.writeFile(mdPath, markdown, "utf8");
  await fs.writeFile(latestMdPath, markdown, "utf8");

  const dashboardCommand = "npm run -s qa:dashboard";
  const dashboard = runCommand(dashboardCommand);
  if (dashboard.exitCode !== 0) {
    throw new Error(`Dashboard generation failed: ${dashboard.stderr || dashboard.stdout}`);
  }

  console.log("Unattended loop complete.");
  console.log(`- ${latestJsonPath}`);
  console.log(`- ${latestMdPath}`);
  console.log("- docs/regression-reports/qa-dashboard-latest.md");
  console.log(`- Iterations executed: ${iterations.length}`);
  console.log(`- Final decision: ${finalDecision}`);
}

main().catch((error) => {
  console.error("Unattended loop failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
