import { promises as fs } from "node:fs";
import path from "node:path";
import type { CandidateScenarioDraft } from "@/lib/regression/candidates";

type MessageRole = "user" | "assistant";

type ChatMessage = {
  role: MessageRole;
  content: string;
};

type ResourceBuckets = {
  human: string[];
  material: string[];
  financial: string[];
  knowledge: string[];
};

type LogicModel = {
  intended_impact: {
    population: string;
    geography: string;
    long_term_goal: string;
    compiled_statement: string;
  };
  stakeholders: Array<Record<string, unknown>>;
  implementation: {
    resources: ResourceBuckets;
    activities: Array<Record<string, unknown>>;
    quality_fidelity: {
      fidelity: string[];
      quality: string[];
    };
  };
  outcomes: {
    short_term: Array<Record<string, unknown>>;
    medium_term: Array<Record<string, unknown>>;
    long_term: Array<Record<string, unknown>>;
  };
};

type ApiResponse = {
  reply?: string;
  modelPatch?: Partial<LogicModel> | null;
  llmMeta?: {
    trace?: {
      finalIntent?: string | null;
      stateIntent?: string | null;
      patchSource?: string | null;
      responseDomain?: string | null;
      effectiveResponseDomain?: string | null;
    };
  };
};

interface CandidatePackFile {
  candidates?: CandidateScenarioDraft[];
}

interface CandidateTurnResult {
  turn: number;
  user: string;
  reply: string;
  finalIntent: string | null;
  failures: string[];
}

interface CandidateScenarioResult {
  id: string;
  expectedFailureClass: string;
  sourceIncidentId: string;
  failures: string[];
  turnResults: CandidateTurnResult[];
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

function createEmptyModel(): LogicModel {
  return {
    intended_impact: {
      population: "",
      geography: "",
      long_term_goal: "",
      compiled_statement: "",
    },
    stakeholders: [],
    implementation: {
      resources: {
        human: [],
        material: [],
        financial: [],
        knowledge: [],
      },
      activities: [],
      quality_fidelity: {
        fidelity: [],
        quality: [],
      },
    },
    outcomes: {
      short_term: [],
      medium_term: [],
      long_term: [],
    },
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function mergeModel(model: LogicModel, patch: Partial<LogicModel> | null | undefined): LogicModel {
  if (!patch) return model;

  if (patch.intended_impact) {
    for (const key of ["population", "geography", "long_term_goal", "compiled_statement"] as const) {
      const value = patch.intended_impact[key];
      if (isNonEmptyString(value)) {
        model.intended_impact[key] = value;
      }
    }
  }

  if (patch.implementation?.resources) {
    for (const key of ["human", "material", "financial", "knowledge"] as const) {
      const nextValues = patch.implementation.resources[key];
      if (Array.isArray(nextValues) && nextValues.length > 0) {
        model.implementation.resources[key] = nextValues.filter(isNonEmptyString);
      }
    }
  }

  if (Array.isArray(patch.implementation?.activities) && patch.implementation.activities.length > 0) {
    model.implementation.activities = patch.implementation.activities;
  }

  if (patch.implementation?.quality_fidelity) {
    const fidelity = patch.implementation.quality_fidelity.fidelity;
    if (Array.isArray(fidelity) && fidelity.length > 0) {
      model.implementation.quality_fidelity.fidelity = fidelity.filter(isNonEmptyString);
    }
    const quality = patch.implementation.quality_fidelity.quality;
    if (Array.isArray(quality) && quality.length > 0) {
      model.implementation.quality_fidelity.quality = quality.filter(isNonEmptyString);
    }
  }

  if (patch.outcomes) {
    for (const key of ["short_term", "medium_term", "long_term"] as const) {
      const arr = patch.outcomes[key];
      if (Array.isArray(arr) && arr.length > 0) {
        model.outcomes[key] = arr;
      }
    }
  }

  return model;
}

function getPathValue(obj: unknown, pathKey: string): unknown {
  return pathKey.split(".").reduce<unknown>((acc, segment) => {
    if (!acc || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[segment];
  }, obj);
}

function resourceBucketCount(resources: unknown): number {
  if (!resources || typeof resources !== "object") return 0;
  const r = resources as Record<string, unknown>;
  let count = 0;
  for (const key of ["human", "material", "financial", "knowledge"]) {
    const values = r[key];
    if (Array.isArray(values) && values.some((v) => isNonEmptyString(v))) count += 1;
  }
  return count;
}

function evaluateCandidateExpectation(expect: CandidateScenarioDraft["turns"][number]["expect"], response: ApiResponse): string[] {
  if (!expect) return [];

  const failures: string[] = [];
  const finalIntent = response.llmMeta?.trace?.finalIntent ?? null;
  const reply = String(response.reply ?? "").toLowerCase();

  if (expect.finalIntentOneOf && !expect.finalIntentOneOf.includes(String(finalIntent))) {
    failures.push(`finalIntent expected one of [${expect.finalIntentOneOf.join(", ")}], got '${String(finalIntent)}'`);
  }

  if (expect.modelPatchMustHavePath) {
    for (const p of expect.modelPatchMustHavePath) {
      const value = getPathValue(response.modelPatch, p);
      const exists = Array.isArray(value)
        ? value.length > 0
        : typeof value === "object"
          ? value !== null && Object.keys(value as Record<string, unknown>).length > 0
          : Boolean(value);
      if (!exists) failures.push(`modelPatch missing required path '${p}'`);
    }
  }

  if (typeof expect.modelPatchResourceBucketsAtLeast === "number") {
    const count = resourceBucketCount(getPathValue(response.modelPatch, "implementation.resources"));
    if (count < expect.modelPatchResourceBucketsAtLeast) {
      failures.push(`expected at least ${expect.modelPatchResourceBucketsAtLeast} resource buckets, got ${count}`);
    }
  }

  if (expect.replyMustNotMatch) {
    for (const forbidden of expect.replyMustNotMatch) {
      if (reply.includes(forbidden.toLowerCase())) {
        failures.push(`reply matched forbidden pattern '${forbidden}'`);
      }
    }
  }

  return failures;
}

async function postChat(apiUrl: string, body: { message: string; history: ChatMessage[]; model: LogicModel; userId: string }): Promise<ApiResponse> {
  const timeoutRaw = Number(readArg("--request-timeout-ms") ?? process.env.CANDIDATE_REQUEST_TIMEOUT_MS ?? "120000");
  const timeoutMs = Number.isFinite(timeoutRaw) ? Math.max(10000, Math.floor(timeoutRaw)) : 120000;
  const retriesRaw = Number(readArg("--request-retries") ?? process.env.CANDIDATE_REQUEST_RETRIES ?? "1");
  const maxRetries = Number.isFinite(retriesRaw) ? Math.max(0, Math.floor(retriesRaw)) : 1;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": body.userId,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      }

      return (await res.json()) as ApiResponse;
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) {
        break;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function runCandidate(apiUrl: string, candidate: CandidateScenarioDraft): Promise<CandidateScenarioResult> {
  const history: ChatMessage[] = [...(candidate.seedHistory ?? [])];
  const model = createEmptyModel();
  if (candidate.seedModel && typeof candidate.seedModel === "object") {
    mergeModel(model, candidate.seedModel as Partial<LogicModel>);
  }
  const failures: string[] = [];
  const turnResults: CandidateTurnResult[] = [];

  for (let index = 0; index < candidate.turns.length; index++) {
    const turn = candidate.turns[index];
    let response: ApiResponse;

    try {
      response = await postChat(apiUrl, {
        message: turn.user,
        history,
        model,
        userId: `candidate-regression-${candidate.id}`,
      });
    } catch (error) {
      failures.push(`turn ${index + 1}: request failed: ${error instanceof Error ? error.message : String(error)}`);
      break;
    }

    mergeModel(model, response.modelPatch ?? null);
    history.push({ role: "user", content: turn.user });
    history.push({ role: "assistant", content: String(response.reply ?? "") });

    const turnFailures = evaluateCandidateExpectation(turn.expect, response);
    turnFailures.forEach((failure) => failures.push(`turn ${index + 1}: ${failure}`));

    turnResults.push({
      turn: index + 1,
      user: turn.user,
      reply: String(response.reply ?? ""),
      finalIntent: (response.llmMeta?.trace?.finalIntent as string | null) ?? null,
      failures: turnFailures,
    });
  }

  return {
    id: candidate.id,
    expectedFailureClass: candidate.expectedFailureClass,
    sourceIncidentId: candidate.sourceIncidentId,
    failures,
    turnResults,
  };
}

function toMarkdown(payload: {
  generatedAt: string;
  apiUrl: string;
  summary: { total: number; passed: number; failed: number };
  results: CandidateScenarioResult[];
}): string {
  const lines: string[] = [];
  lines.push("# Candidate Scenario Run Report");
  lines.push("");
  lines.push(`Generated: ${payload.generatedAt}`);
  lines.push(`API: ${payload.apiUrl}`);
  lines.push(`Summary: ${payload.summary.passed}/${payload.summary.total} passed.`);
  lines.push("");
  lines.push("| Candidate | Expected class | Status | Failures |");
  lines.push("|---|---|---|---:|");
  payload.results.forEach((result) => {
    lines.push(
      `| ${result.id} | ${result.expectedFailureClass} | ${result.failures.length === 0 ? "PASS" : "FAIL"} | ${result.failures.length} |`
    );
  });

  payload.results
    .filter((result) => result.failures.length > 0)
    .forEach((result) => {
      lines.push("");
      lines.push(`## ${result.id}`);
      lines.push("");
      lines.push("Failures:");
      result.failures.forEach((failure) => lines.push(`- ${failure}`));
    });

  return lines.join("\n");
}

async function main(): Promise<void> {
  const packPath = readArg("--pack") ?? "docs/regression-reports/candidate-pack-latest.json";
  const apiUrl = readArg("--api-url") ?? process.env.CHAT_API_URL ?? "http://localhost:3100/api/chat";

  const parsed = await readJsonFile<CandidatePackFile>(packPath);
  const candidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];

  const results: CandidateScenarioResult[] = [];
  for (const candidate of candidates) {
    const result = await runCandidate(apiUrl, candidate);
    results.push(result);
  }

  const failed = results.filter((result) => result.failures.length > 0).length;
  const payload = {
    generatedAt: new Date().toISOString(),
    apiUrl,
    summary: {
      total: results.length,
      passed: results.length - failed,
      failed,
    },
    results,
  };

  const outDir = path.resolve("docs/regression-reports");
  await ensureDir(outDir);
  const stamp = payload.generatedAt.replace(/[:.]/g, "-");

  const jsonPath = path.join(outDir, `candidate-run-${stamp}.json`);
  const latestJsonPath = path.join(outDir, "candidate-run-latest.json");
  await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  await fs.writeFile(latestJsonPath, JSON.stringify(payload, null, 2), "utf8");

  const markdown = toMarkdown(payload);
  const mdPath = path.join(outDir, `candidate-run-${stamp}.md`);
  const latestMdPath = path.join(outDir, "candidate-run-latest.md");
  await fs.writeFile(mdPath, markdown, "utf8");
  await fs.writeFile(latestMdPath, markdown, "utf8");

  console.log("Candidate run complete.");
  console.log(`- ${latestJsonPath}`);
  console.log(`- ${latestMdPath}`);
  console.log(`- Passed: ${payload.summary.passed}/${payload.summary.total}`);

  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error("Candidate run failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
