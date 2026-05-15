export type IncidentSource = "scenario" | "debug";

export type FailureClass =
  | "intent_misclassification"
  | "missing_patch_writeback"
  | "repeated_question_loop"
  | "phase_regression"
  | "extraction_gap"
  | "retrieval_mismatch"
  | "contradiction_handling_failure"
  | "acceptance_gate_failure"
  | "runtime_transport_failure"
  | "unknown";

export type Confidence = "high" | "medium" | "low";

export interface NormalizedIncident {
  id: string;
  source: IncidentSource;
  timestampIso: string;
  scenarioId?: string;
  scenarioTurn?: number;
  userId?: string;
  failureClass: FailureClass;
  confidence: Confidence;
  severity: "high" | "medium" | "low";
  summary: string;
  rationale: string;
  fingerprint: string;
  evidence: Record<string, unknown>;
}

export interface IncidentThread {
  fingerprint: string;
  failureClass: FailureClass;
  confidence: Confidence;
  severity: "high" | "medium" | "low";
  summary: string;
  firstSeenIso: string;
  lastSeenIso: string;
  occurrences: number;
  incidentIds: string[];
}

interface ScenarioTurnResult {
  turn?: number;
  finalIntent?: string | null;
  stateIntent?: string | null;
  patchSource?: string | null;
  responseDomain?: string | null;
  effectiveResponseDomain?: string | null;
  failures?: string[];
}

interface ScenarioResult {
  id?: string;
  description?: string;
  failures?: string[];
  turnResults?: ScenarioTurnResult[];
}

export interface ScenarioReport {
  generatedAt?: string;
  results?: ScenarioResult[];
}

export interface DebugSnapshotRecord {
  id: string;
  userId: string;
  createdAt: string;
  capture?: {
    feedbackReport?: {
      description?: string;
    };
    model?: {
      intended_impact?: {
        compiled_statement?: string;
      };
    };
    messages?: Array<{ role?: string; content?: string }>;
    llm?: {
      recentCalls?: Array<{
        trace?: {
          finalIntent?: string | null;
          stateIntent?: string | null;
          patchSource?: string | null;
          responseDomain?: string | null;
          effectiveResponseDomain?: string | null;
          contradictionFlags?: string[];
          retrieval?: {
            mode?: string;
            reason?: string;
          };
        };
      }>;
    };
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[0-9]+/g, "#")
    .replace(/["'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function createFingerprint(parts: Array<string | undefined>): string {
  return parts
    .filter((part): part is string => isNonEmptyString(part))
    .map((part) => normalizeText(part))
    .join("|");
}

function parseIntentFailure(message: string): { expected: string[]; actual: string } | null {
  const match = message.match(/finalIntent expected one of \[(.+?)\], got '(.+?)'/i);
  if (!match) return null;
  const expected = match[1]
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return { expected, actual: match[2].trim() };
}

function classifyScenarioFailure(
  failure: string,
  turn: ScenarioTurnResult | undefined
): Pick<NormalizedIncident, "failureClass" | "confidence" | "severity" | "summary" | "rationale"> {
  const normalized = failure.toLowerCase();

  if (normalized.includes("request failed") || normalized.includes("http ")) {
    return {
      failureClass: "runtime_transport_failure",
      confidence: "high",
      severity: "high",
      summary: "Scenario turn failed due to transport/runtime error",
      rationale: "Turn-level failure indicates request execution failure, not conversational logic.",
    };
  }

  if (normalized.includes("modelpatch missing required path")) {
    return {
      failureClass: "missing_patch_writeback",
      confidence: "high",
      severity: "high",
      summary: "Expected model patch writeback path missing",
      rationale: "Assertion explicitly checks for required model patch paths.",
    };
  }

  if (normalized.includes("reply matched forbidden pattern")) {
    return {
      failureClass: "repeated_question_loop",
      confidence: "high",
      severity: "high",
      summary: "Assistant repeated forbidden or looping question pattern",
      rationale: "Negative assertion detected a known loop anti-pattern in assistant reply.",
    };
  }

  const intentFailure = parseIntentFailure(failure);
  if (intentFailure) {
    const { expected, actual } = intentFailure;
    const expectedImpactLike = expected.some((intent) => intent.startsWith("impact"));
    const isPhaseShift = expectedImpactLike && ["resources", "activities", "outcomes", "outputs_metrics"].includes(actual);
    return {
      failureClass: isPhaseShift ? "phase_regression" : "intent_misclassification",
      confidence: "high",
      severity: "high",
      summary: isPhaseShift
        ? `Agent shifted to '${actual}' before completing expected impact phase`
        : `Agent classified intent as '${actual}' outside expected intent set`,
      rationale: "Intent assertion mismatch was raised directly by scenario expectation.",
    };
  }

  if (normalized.includes("not captured") || normalized.includes("missing or empty")) {
    return {
      failureClass: "extraction_gap",
      confidence: "high",
      severity: "medium",
      summary: "Expected extracted values were not present in final model state",
      rationale: "Final model check indicates extraction or merge gaps for required fields.",
    };
  }

  const contradictionFlags = turn && Array.isArray((turn as Record<string, unknown>).contradictionFlags)
    ? ((turn as Record<string, unknown>).contradictionFlags as string[])
    : [];
  if (contradictionFlags.length > 0) {
    return {
      failureClass: "contradiction_handling_failure",
      confidence: "medium",
      severity: "medium",
      summary: "Contradiction flags present during failing turn",
      rationale: "Contradiction markers suggest unresolved conflicting facts affected turn behavior.",
    };
  }

  return {
    failureClass: "unknown",
    confidence: "low",
    severity: "low",
    summary: "Unclassified scenario failure",
    rationale: "Failure signature did not match deterministic taxonomy rules.",
  };
}

function classifyDebugRecord(record: DebugSnapshotRecord): Array<Pick<NormalizedIncident, "failureClass" | "confidence" | "severity" | "summary" | "rationale" | "evidence">> {
  const incidents: Array<Pick<NormalizedIncident, "failureClass" | "confidence" | "severity" | "summary" | "rationale" | "evidence">> = [];

  const description = String(record.capture?.feedbackReport?.description ?? "");
  const descriptionLc = description.toLowerCase();

  const latestCall = record.capture?.llm?.recentCalls?.[0];
  const trace = latestCall?.trace;
  const retrievalMode = trace?.retrieval?.mode?.toLowerCase();
  const retrievalReason = trace?.retrieval?.reason?.toLowerCase();

  const hasImpactDraft = Boolean(record.capture?.model?.intended_impact?.compiled_statement?.trim());
  const assistantMessages = (record.capture?.messages ?? [])
    .filter((message) => message.role === "assistant" && isNonEmptyString(message.content))
    .map((message) => String(message.content));
  const lastAssistant = assistantMessages.length > 0 ? assistantMessages[assistantMessages.length - 1] : "";
  const asksPopulationQuestion = /specific population|community your program is designed to serve|who is this.*about/i.test(lastAssistant);

  const mentionsApproval = /(approved|confirmed)/i.test(descriptionLc);
  const mentionsImpactStatement = /(impact|statement)/i.test(descriptionLc);
  const mentionsWritebackFailure = /(not|failed).*(write|written|persist|saved|save|model|template)/i.test(descriptionLc);

  if (mentionsApproval && mentionsImpactStatement && mentionsWritebackFailure) {
    incidents.push({
      failureClass: "acceptance_gate_failure",
      confidence: "high",
      severity: "high",
      summary: "Impact statement approval was not persisted",
      rationale: "Feedback description explicitly reports approval-without-writeback behavior.",
      evidence: { description },
    });
  }

  if (hasImpactDraft && asksPopulationQuestion) {
    incidents.push({
      failureClass: "phase_regression",
      confidence: "high",
      severity: "high",
      summary: "Assistant asked baseline impact question despite existing impact draft",
      rationale: "Snapshot contains compiled impact statement while latest assistant question restarts impact elicitation.",
      evidence: { lastAssistant, hasImpactDraft },
    });
  }

  if (isNonEmptyString(retrievalReason) && retrievalReason !== "vector_success") {
    incidents.push({
      failureClass: "retrieval_mismatch",
      confidence: "medium",
      severity: "medium",
      summary: "Retrieval reason indicates non-ideal retrieval path",
      rationale: "Trace metadata marks retrieval path as fallback or degraded from vector success.",
      evidence: { retrievalMode, retrievalReason },
    });
  }

  if (Array.isArray(trace?.contradictionFlags) && trace.contradictionFlags.length > 0) {
    incidents.push({
      failureClass: "contradiction_handling_failure",
      confidence: "medium",
      severity: "medium",
      summary: "Contradiction flags present in debug trace",
      rationale: "Trace indicates conflicting facts were detected and may not be fully resolved.",
      evidence: { contradictionFlags: trace.contradictionFlags },
    });
  }

  if (incidents.length === 0 && isNonEmptyString(description)) {
    incidents.push({
      failureClass: "unknown",
      confidence: "low",
      severity: "low",
      summary: "Debug report captured but did not match current taxonomy",
      rationale: "Feedback text exists but deterministic rules could not classify it.",
      evidence: { description },
    });
  }

  return incidents;
}

export function normalizeScenarioReport(report: ScenarioReport): NormalizedIncident[] {
  const generatedAt = isNonEmptyString(report.generatedAt) ? report.generatedAt : new Date().toISOString();
  const incidents: NormalizedIncident[] = [];

  for (const scenario of report.results ?? []) {
    const scenarioId = isNonEmptyString(scenario.id) ? scenario.id : "unknown-scenario";

    const scenarioFailures = scenario.failures ?? [];
    scenarioFailures.forEach((failure, index) => {
      const turnMatch = failure.match(/^turn\s+(\d+):\s*/i);
      const turnNumber = turnMatch ? Number(turnMatch[1]) : undefined;
      const message = failure.replace(/^turn\s+\d+:\s*/i, "").replace(/^final:\s*/i, "").trim();

      const turn = (scenario.turnResults ?? []).find((item) => item.turn === turnNumber);
      const classification = classifyScenarioFailure(message, turn);
      incidents.push({
        id: `scenario:${scenarioId}:failure:${index + 1}`,
        source: "scenario",
        timestampIso: generatedAt,
        scenarioId,
        scenarioTurn: turnNumber,
        failureClass: classification.failureClass,
        confidence: classification.confidence,
        severity: classification.severity,
        summary: classification.summary,
        rationale: classification.rationale,
        fingerprint: createFingerprint([
          "scenario",
          scenarioId,
          String(turnNumber ?? "final"),
          classification.failureClass,
          message,
        ]),
        evidence: {
          rawFailure: failure,
          turnTrace: turn ?? null,
        },
      });
    });
  }

  return incidents;
}

export function normalizeDebugSnapshots(records: DebugSnapshotRecord[]): NormalizedIncident[] {
  const incidents: NormalizedIncident[] = [];

  for (const record of records) {
    const classifications = classifyDebugRecord(record);
    classifications.forEach((classification, index) => {
      incidents.push({
        id: `debug:${record.id}:${index + 1}`,
        source: "debug",
        timestampIso: isNonEmptyString(record.createdAt) ? record.createdAt : new Date().toISOString(),
        userId: record.userId,
        failureClass: classification.failureClass,
        confidence: classification.confidence,
        severity: classification.severity,
        summary: classification.summary,
        rationale: classification.rationale,
        fingerprint: createFingerprint([
          "debug",
          record.userId,
          classification.failureClass,
          String((classification.evidence as { description?: string } | undefined)?.description ?? ""),
          String((classification.evidence as { retrievalReason?: string } | undefined)?.retrievalReason ?? ""),
        ]),
        evidence: {
          snapshotId: record.id,
          ...classification.evidence,
        },
      });
    });
  }

  return incidents;
}

export function collapseIncidentThreads(
  incidents: NormalizedIncident[],
  recencyWindowHours = 24
): IncidentThread[] {
  const windowMs = Math.max(1, recencyWindowHours) * 60 * 60 * 1000;
  const sorted = [...incidents].sort((a, b) => (a.timestampIso < b.timestampIso ? -1 : 1));

  const threadsByFingerprint = new Map<string, IncidentThread>();
  const lastSeenByFingerprint = new Map<string, number>();

  for (const incident of sorted) {
    const ts = Date.parse(incident.timestampIso);
    const lastSeen = lastSeenByFingerprint.get(incident.fingerprint);
    if (typeof lastSeen === "number" && Number.isFinite(ts) && ts - lastSeen > windowMs) {
      const agedFingerprint = `${incident.fingerprint}|window:${Math.floor(ts / windowMs)}`;
      incident.fingerprint = agedFingerprint;
    }

    const existing = threadsByFingerprint.get(incident.fingerprint);
    if (!existing) {
      threadsByFingerprint.set(incident.fingerprint, {
        fingerprint: incident.fingerprint,
        failureClass: incident.failureClass,
        confidence: incident.confidence,
        severity: incident.severity,
        summary: incident.summary,
        firstSeenIso: incident.timestampIso,
        lastSeenIso: incident.timestampIso,
        occurrences: 1,
        incidentIds: [incident.id],
      });
      lastSeenByFingerprint.set(incident.fingerprint, ts);
      continue;
    }

    existing.occurrences += 1;
    existing.lastSeenIso = incident.timestampIso;
    existing.incidentIds.push(incident.id);
    if (existing.confidence === "low" && incident.confidence !== "low") {
      existing.confidence = incident.confidence;
    }
    if (existing.severity === "low" && incident.severity !== "low") {
      existing.severity = incident.severity;
    }
    lastSeenByFingerprint.set(incident.fingerprint, ts);
  }

  return [...threadsByFingerprint.values()].sort((a, b) => {
    if (a.severity !== b.severity) {
      const rank = { high: 3, medium: 2, low: 1 };
      return rank[b.severity] - rank[a.severity];
    }
    return a.lastSeenIso < b.lastSeenIso ? 1 : -1;
  });
}

export function summarizeFailureClassCounts(incidents: NormalizedIncident[]): Record<FailureClass, number> {
  const seed: Record<FailureClass, number> = {
    intent_misclassification: 0,
    missing_patch_writeback: 0,
    repeated_question_loop: 0,
    phase_regression: 0,
    extraction_gap: 0,
    retrieval_mismatch: 0,
    contradiction_handling_failure: 0,
    acceptance_gate_failure: 0,
    runtime_transport_failure: 0,
    unknown: 0,
  };

  for (const incident of incidents) {
    seed[incident.failureClass] += 1;
  }

  return seed;
}
