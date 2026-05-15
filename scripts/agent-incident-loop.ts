import { promises as fs } from "node:fs";
import path from "node:path";
import {
  collapseIncidentThreads,
  normalizeDebugSnapshots,
  normalizeScenarioReport,
  summarizeFailureClassCounts,
  type DebugSnapshotRecord,
  type ScenarioReport,
} from "@/lib/regression/incidents";

interface CliArgs {
  mode: "collect";
  scenarioReportPath: string;
  debugSource: "api" | "file" | "none";
  debugApiUrl: string;
  debugFallbackFile: string;
  debugLimit: number;
  debugUserId?: string;
  recencyHours: number;
}

function readArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function parseArgs(): CliArgs {
  const mode = (readArg("--mode") ?? "collect").toLowerCase();
  if (mode !== "collect") {
    throw new Error(`Unsupported mode '${mode}'. Supported modes: collect`);
  }

  const scenarioReportPath = readArg("--scenario-report") ?? "docs/regression-reports/agent-scenarios-latest.json";
  const debugSource = (readArg("--debug-source") ?? "api").toLowerCase();
  if (!["api", "file", "none"].includes(debugSource)) {
    throw new Error("--debug-source must be one of: api, file, none");
  }

  const debugApiUrl = readArg("--debug-api") ?? "http://localhost:3100/api/feedback/debug";
  const debugFallbackFile = readArg("--debug-file") ?? "latest_debug_report.json";
  const debugLimitRaw = Number(readArg("--debug-limit") ?? "30");
  const debugLimit = Number.isFinite(debugLimitRaw) ? Math.max(1, Math.floor(debugLimitRaw)) : 30;
  const debugUserId = readArg("--debug-user-id");
  const recencyRaw = Number(readArg("--recency-hours") ?? "24");
  const recencyHours = Number.isFinite(recencyRaw) ? Math.max(1, Math.floor(recencyRaw)) : 24;

  if (hasFlag("--no-debug")) {
    return {
      mode: "collect",
      scenarioReportPath,
      debugSource: "none",
      debugApiUrl,
      debugFallbackFile,
      debugLimit,
      debugUserId,
      recencyHours,
    };
  }

  return {
    mode: "collect",
    scenarioReportPath,
    debugSource: debugSource as CliArgs["debugSource"],
    debugApiUrl,
    debugFallbackFile,
    debugLimit,
    debugUserId,
    recencyHours,
  };
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const resolved = path.resolve(filePath);
  const raw = await fs.readFile(resolved, "utf8");
  const sanitized = raw.replace(/^\uFEFF/, "");
  return JSON.parse(sanitized) as T;
}

async function loadDebugSnapshotsFromApi(args: CliArgs): Promise<DebugSnapshotRecord[]> {
  const url = new URL(args.debugApiUrl);
  url.searchParams.set("limit", String(args.debugLimit));
  if (args.debugUserId) {
    url.searchParams.set("userId", args.debugUserId);
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Debug API request failed with status ${response.status}`);
  }

  const body = (await response.json()) as { snapshots?: DebugSnapshotRecord[] };
  return Array.isArray(body.snapshots) ? body.snapshots : [];
}

async function loadDebugSnapshots(args: CliArgs): Promise<{ source: string; snapshots: DebugSnapshotRecord[] }> {
  if (args.debugSource === "none") {
    return { source: "none", snapshots: [] };
  }

  if (args.debugSource === "file") {
    const fromFile = await readJsonFile<{ snapshots?: DebugSnapshotRecord[] }>(args.debugFallbackFile);
    return {
      source: `file:${path.resolve(args.debugFallbackFile)}`,
      snapshots: Array.isArray(fromFile.snapshots) ? fromFile.snapshots : [],
    };
  }

  try {
    const fromApi = await loadDebugSnapshotsFromApi(args);
    return { source: `api:${args.debugApiUrl}`, snapshots: fromApi };
  } catch (error) {
    console.warn(
      `Debug API unavailable (${error instanceof Error ? error.message : String(error)}). Falling back to file.`
    );
    const fromFile = await readJsonFile<{ snapshots?: DebugSnapshotRecord[] }>(args.debugFallbackFile);
    return {
      source: `fallback-file:${path.resolve(args.debugFallbackFile)}`,
      snapshots: Array.isArray(fromFile.snapshots) ? fromFile.snapshots : [],
    };
  }
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

function buildMarkdownSummary(input: {
  generatedAtIso: string;
  scenarioPath: string;
  debugSource: string;
  scenarioIncidentCount: number;
  debugIncidentCount: number;
  classCounts: Record<string, number>;
  threadCount: number;
  topThreads: Array<{ summary: string; failureClass: string; severity: string; confidence: string; occurrences: number }>;
}): string {
  const lines: string[] = [];
  lines.push("# Incident Collection Summary");
  lines.push("");
  lines.push(`Generated: ${input.generatedAtIso}`);
  lines.push(`Scenario report: ${input.scenarioPath}`);
  lines.push(`Debug source: ${input.debugSource}`);
  lines.push("");
  lines.push("## Counts");
  lines.push("");
  lines.push(`- Scenario incidents: ${input.scenarioIncidentCount}`);
  lines.push(`- Debug incidents: ${input.debugIncidentCount}`);
  lines.push(`- Total incident threads: ${input.threadCount}`);
  lines.push("");
  lines.push("## Failure Class Totals");
  lines.push("");
  lines.push("| Failure class | Count |");
  lines.push("|---|---:|");
  Object.entries(input.classCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([failureClass, count]) => {
      lines.push(`| ${failureClass} | ${count} |`);
    });

  lines.push("");
  lines.push("## Top Threads");
  lines.push("");
  lines.push("| Summary | Class | Severity | Confidence | Occurrences |");
  lines.push("|---|---|---|---|---:|");
  input.topThreads.forEach((thread) => {
    lines.push(
      `| ${thread.summary.replace(/\|/g, "\\|")} | ${thread.failureClass} | ${thread.severity} | ${thread.confidence} | ${thread.occurrences} |`
    );
  });

  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = parseArgs();
  const generatedAtIso = new Date().toISOString();

  console.log("Collecting incidents from scenario report and debug snapshots...");
  const scenarioReport = await readJsonFile<ScenarioReport>(args.scenarioReportPath);
  const scenarioIncidents = normalizeScenarioReport(scenarioReport);

  const debug = await loadDebugSnapshots(args);
  const debugIncidents = normalizeDebugSnapshots(debug.snapshots);

  const allIncidents = [...scenarioIncidents, ...debugIncidents];
  const incidentThreads = collapseIncidentThreads(allIncidents, args.recencyHours);
  const classCounts = summarizeFailureClassCounts(allIncidents);

  const payload = {
    generatedAt: generatedAtIso,
    mode: args.mode,
    inputs: {
      scenarioReportPath: path.resolve(args.scenarioReportPath),
      debugSource: debug.source,
      debugCount: debug.snapshots.length,
      recencyHours: args.recencyHours,
    },
    counts: {
      incidents: allIncidents.length,
      threads: incidentThreads.length,
      byClass: classCounts,
      bySource: {
        scenario: scenarioIncidents.length,
        debug: debugIncidents.length,
      },
    },
    incidents: allIncidents,
    threads: incidentThreads,
  };

  const outDir = path.resolve("docs/regression-reports");
  await ensureDir(outDir);
  const stamp = generatedAtIso.replace(/[:.]/g, "-");

  const jsonPath = path.join(outDir, `incident-collection-${stamp}.json`);
  const latestJsonPath = path.join(outDir, "incident-collection-latest.json");
  await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  await fs.writeFile(latestJsonPath, JSON.stringify(payload, null, 2), "utf8");

  const markdown = buildMarkdownSummary({
    generatedAtIso,
    scenarioPath: path.resolve(args.scenarioReportPath),
    debugSource: debug.source,
    scenarioIncidentCount: scenarioIncidents.length,
    debugIncidentCount: debugIncidents.length,
    classCounts,
    threadCount: incidentThreads.length,
    topThreads: incidentThreads.slice(0, 15).map((thread) => ({
      summary: thread.summary,
      failureClass: thread.failureClass,
      severity: thread.severity,
      confidence: thread.confidence,
      occurrences: thread.occurrences,
    })),
  });

  const mdPath = path.join(outDir, `incident-collection-${stamp}.md`);
  const latestMdPath = path.join(outDir, "incident-collection-latest.md");
  await fs.writeFile(mdPath, markdown, "utf8");
  await fs.writeFile(latestMdPath, markdown, "utf8");

  console.log("Incident collection complete.");
  console.log(`- ${latestJsonPath}`);
  console.log(`- ${latestMdPath}`);
  console.log(`- Total incidents: ${allIncidents.length}`);
  console.log(`- Total threads: ${incidentThreads.length}`);
}

main().catch((error) => {
  console.error("Incident collection failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
