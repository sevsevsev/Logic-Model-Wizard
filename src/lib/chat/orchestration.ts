import type { ChatMessage, LogicModel } from "@/store/useLogicModelStore";

export type LogicSection =
  | "impact"
  | "resources"
  | "activities"
  | "outputs_metrics"
  | "quality_fidelity"
  | "outcomes"
  | "stakeholders";

export type EvidenceStatus = "proposed" | "committed" | "superseded";
export type EvidenceProvenance = "user_stated" | "assistant_inferred" | "retrieved_guidance";

export type ClaimStatus = "proposed" | "confirmed" | "conflicted" | "superseded";

export interface ClaimRecord {
  id: string;
  turnIndex: number;
  section: LogicSection;
  fieldPath: string;
  value: string;
  normalizedValue: string;
  confidence: number;
  provenance: EvidenceProvenance;
  status: ClaimStatus;
  sourceText: string;
}

export interface ClaimConflict {
  id: string;
  fieldPath: string;
  section: LogicSection;
  existingValue: string;
  incomingValue: string;
  status: "open" | "resolved";
  createdTurnIndex: number;
  resolvedTurnIndex?: number;
}

export interface RetentionQuestion {
  id: string;
  section: LogicSection;
  prompt: string;
  reason: "conflict" | "confirmation";
  status: "open" | "resolved";
  conflictId?: string;
  createdTurnIndex: number;
  resolvedTurnIndex?: number;
}

export interface ClaimMemoryState {
  claims: ClaimRecord[];
  conflicts: ClaimConflict[];
  questions: RetentionQuestion[];
  lastUpdatedTurnIndex: number;
}

export interface EvidenceEntry {
  id: string;
  turnIndex: number;
  turnRole: "user" | "assistant";
  text: string;
  candidateSections: LogicSection[];
  confidence: number;
  status: EvidenceStatus;
  provenance: EvidenceProvenance;
}

export interface EvidenceLedger {
  entries: EvidenceEntry[];
}

export interface SectionReadiness {
  impact: number;
  resources: number;
  activities: number;
  outputs_metrics: number;
  quality_fidelity: number;
  outcomes: number;
  stakeholders: number;
}

export interface ReadinessSummary {
  scores: SectionReadiness;
  nextSection: LogicSection;
}

export type ContextConflictFlag =
  | "asks_for_known_information"
  | "ungrounded_capture_claim"
  | "repeated_prompt_risk";

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizeClaimValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const SINGLETON_FIELD_PATHS = new Set<string>([
  "intended_impact.population",
  "intended_impact.geography",
  "intended_impact.long_term_goal",
  "intended_impact.compiled_statement",
]);

export function createEmptyClaimMemory(): ClaimMemoryState {
  return {
    claims: [],
    conflicts: [],
    questions: [],
    lastUpdatedTurnIndex: 0,
  };
}

export function isClaimMemoryState(value: unknown): value is ClaimMemoryState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;

  if (!Array.isArray(v.claims) || !Array.isArray(v.conflicts) || !Array.isArray(v.questions)) {
    return false;
  }

  const claimsAreValid = v.claims.every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const e = entry as Record<string, unknown>;
    return (
      typeof e.id === "string" &&
      typeof e.turnIndex === "number" &&
      typeof e.section === "string" &&
      typeof e.fieldPath === "string" &&
      typeof e.value === "string" &&
      typeof e.normalizedValue === "string" &&
      typeof e.confidence === "number" &&
      (e.provenance === "user_stated" || e.provenance === "assistant_inferred" || e.provenance === "retrieved_guidance") &&
      (e.status === "proposed" || e.status === "confirmed" || e.status === "conflicted" || e.status === "superseded") &&
      typeof e.sourceText === "string"
    );
  });

  const conflictsAreValid = v.conflicts.every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const e = entry as Record<string, unknown>;
    return (
      typeof e.id === "string" &&
      typeof e.fieldPath === "string" &&
      typeof e.section === "string" &&
      typeof e.existingValue === "string" &&
      typeof e.incomingValue === "string" &&
      (e.status === "open" || e.status === "resolved") &&
      typeof e.createdTurnIndex === "number" &&
      (e.resolvedTurnIndex === undefined || typeof e.resolvedTurnIndex === "number")
    );
  });

  const questionsAreValid = v.questions.every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const e = entry as Record<string, unknown>;
    return (
      typeof e.id === "string" &&
      typeof e.section === "string" &&
      typeof e.prompt === "string" &&
      (e.reason === "conflict" || e.reason === "confirmation") &&
      (e.status === "open" || e.status === "resolved") &&
      (e.conflictId === undefined || typeof e.conflictId === "string") &&
      typeof e.createdTurnIndex === "number" &&
      (e.resolvedTurnIndex === undefined || typeof e.resolvedTurnIndex === "number")
    );
  });

  return claimsAreValid && conflictsAreValid && questionsAreValid && typeof v.lastUpdatedTurnIndex === "number";
}

function sectionPromptForConflict(section: LogicSection, first: string, second: string): string {
  switch (section) {
    case "impact":
      return `I have two different impact details for the same field: "${first}" and "${second}". Which one should we keep?`;
    case "resources":
      return `I have two conflicting resource values for the same field: "${first}" and "${second}". Which one is correct?`;
    case "activities":
      return `I found a conflict in the activity record: "${first}" vs "${second}". Which version should we keep?`;
    case "outputs_metrics":
      return `I found conflicting output metric wording: "${first}" and "${second}". Which metric phrasing is correct?`;
    case "quality_fidelity":
      return `I found two different quality/fidelity entries for one field: "${first}" and "${second}". Which one should we keep?`;
    case "outcomes":
      return `I have two different outcome statements for the same field: "${first}" and "${second}". Which is the intended one?`;
    case "stakeholders":
      return `I captured two different stakeholder labels for the same field: "${first}" and "${second}". Which should we use?`;
    default:
      return `I found conflicting values: "${first}" and "${second}". Which one should I keep?`;
  }
}

function buildClaimsFromPatch(args: {
  modelPatch: Partial<LogicModel> | null;
  sourceText: string;
  turnIndex: number;
}): ClaimRecord[] {
  const { modelPatch, sourceText, turnIndex } = args;
  if (!modelPatch) return [];

  const claims: ClaimRecord[] = [];
  const pushClaim = (section: LogicSection, fieldPath: string, value: string, confidence = 0.85) => {
    if (!isNonEmptyString(value)) return;
    claims.push({
      id: `${turnIndex}-${fieldPath}-${claims.length + 1}`,
      turnIndex,
      section,
      fieldPath,
      value: value.trim(),
      normalizedValue: normalizeClaimValue(value),
      confidence,
      provenance: "user_stated",
      status: confidence >= 0.8 ? "confirmed" : "proposed",
      sourceText,
    });
  };

  pushClaim("impact", "intended_impact.population", modelPatch.intended_impact?.population ?? "");
  pushClaim("impact", "intended_impact.geography", modelPatch.intended_impact?.geography ?? "");
  pushClaim("impact", "intended_impact.long_term_goal", modelPatch.intended_impact?.long_term_goal ?? "", 0.8);
  pushClaim("impact", "intended_impact.compiled_statement", modelPatch.intended_impact?.compiled_statement ?? "", 0.75);

  for (const s of modelPatch.stakeholders ?? []) {
    if (!s) continue;
    if (typeof s === "string") {
      pushClaim("stakeholders", "stakeholders.label", s, 0.8);
      continue;
    }
    if (typeof s === "object" && isNonEmptyString((s as { label?: unknown }).label)) {
      pushClaim("stakeholders", "stakeholders.label", (s as { label: string }).label, 0.8);
    }
  }

  const resources = modelPatch.implementation?.resources;
  for (const field of ["human", "material", "financial", "knowledge"] as const) {
    for (const value of resources?.[field] ?? []) {
      pushClaim("resources", `implementation.resources.${field}`, value, 0.85);
    }
  }

  for (const metric of modelPatch.implementation?.outputs_metrics ?? []) {
    pushClaim("outputs_metrics", "implementation.outputs_metrics", metric, 0.8);
  }

  for (const entry of modelPatch.implementation?.quality_fidelity?.quality ?? []) {
    pushClaim("quality_fidelity", "implementation.quality_fidelity.quality", entry, 0.8);
  }
  for (const entry of modelPatch.implementation?.quality_fidelity?.fidelity ?? []) {
    pushClaim("quality_fidelity", "implementation.quality_fidelity.fidelity", entry, 0.8);
  }

  for (const activity of modelPatch.implementation?.activities ?? []) {
    for (const action of activity.actions ?? []) {
      pushClaim("activities", "implementation.activities.action", action, 0.85);
    }
    for (const output of activity.outputs ?? []) {
      pushClaim("outputs_metrics", "implementation.activities.output", output.text ?? "", 0.75);
    }
  }

  for (const entry of modelPatch.outcomes?.short_term ?? []) {
    pushClaim("outcomes", "outcomes.short_term", entry.statement ?? "", 0.8);
  }
  for (const entry of modelPatch.outcomes?.medium_term ?? []) {
    pushClaim("outcomes", "outcomes.medium_term", entry.statement ?? "", 0.8);
  }
  for (const entry of modelPatch.outcomes?.long_term ?? []) {
    pushClaim("outcomes", "outcomes.long_term", entry.statement ?? "", 0.8);
  }

  return claims;
}

function resolveOpenConflictWithClaim(memory: ClaimMemoryState, claim: ClaimRecord): void {
  for (const conflict of memory.conflicts) {
    if (conflict.status !== "open") continue;
    if (conflict.fieldPath !== claim.fieldPath) continue;

    const normalizedIncoming = normalizeClaimValue(conflict.incomingValue);
    const normalizedExisting = normalizeClaimValue(conflict.existingValue);
    if (claim.normalizedValue !== normalizedIncoming && claim.normalizedValue !== normalizedExisting) continue;

    conflict.status = "resolved";
    conflict.resolvedTurnIndex = claim.turnIndex;
    for (const question of memory.questions) {
      if (question.conflictId !== conflict.id || question.status !== "open") continue;
      question.status = "resolved";
      question.resolvedTurnIndex = claim.turnIndex;
    }
  }
}

export function updateClaimMemoryFromTurn(args: {
  previous?: ClaimMemoryState;
  userMessage: string;
  modelPatch: Partial<LogicModel> | null;
  turnIndex: number;
}): ClaimMemoryState {
  const base = args.previous && isClaimMemoryState(args.previous)
    ? structuredClone(args.previous)
    : createEmptyClaimMemory();

  const incomingClaims = buildClaimsFromPatch({
    modelPatch: args.modelPatch,
    sourceText: args.userMessage,
    turnIndex: args.turnIndex,
  });

  for (const claim of incomingClaims) {
    const activeSameField = base.claims.filter(
      (entry) =>
        entry.fieldPath === claim.fieldPath &&
        (entry.status === "proposed" || entry.status === "confirmed")
    );

    if (activeSameField.some((entry) => entry.normalizedValue === claim.normalizedValue)) {
      if (claim.status !== "conflicted") {
        resolveOpenConflictWithClaim(base, claim);
      }
      continue;
    }

    if (SINGLETON_FIELD_PATHS.has(claim.fieldPath) && activeSameField.length > 0) {
      for (const prior of activeSameField) {
        prior.status = "conflicted";
      }
      claim.status = "conflicted";

      const latestPrior = activeSameField[activeSameField.length - 1];
      const conflictId = `conflict-${claim.turnIndex}-${claim.fieldPath}-${base.conflicts.length + 1}`;
      const conflict: ClaimConflict = {
        id: conflictId,
        fieldPath: claim.fieldPath,
        section: claim.section,
        existingValue: latestPrior.value,
        incomingValue: claim.value,
        status: "open",
        createdTurnIndex: claim.turnIndex,
      };
      base.conflicts.push(conflict);

      const existingOpenQuestion = base.questions.find(
        (q) => q.status === "open" && q.conflictId === conflict.id
      );
      if (!existingOpenQuestion) {
        base.questions.push({
          id: `question-${base.questions.length + 1}`,
          section: conflict.section,
          prompt: sectionPromptForConflict(conflict.section, conflict.existingValue, conflict.incomingValue),
          reason: "conflict",
          status: "open",
          conflictId: conflict.id,
          createdTurnIndex: claim.turnIndex,
        });
      }
    }

    base.claims.push(claim);
    if (claim.status !== "conflicted") {
      resolveOpenConflictWithClaim(base, claim);
    }
  }

  base.lastUpdatedTurnIndex = args.turnIndex;
  return base;
}

export function buildSectionScopedMemoryContext(memory: ClaimMemoryState | undefined, section: LogicSection): string {
  if (!memory || !isClaimMemoryState(memory)) return "";

  const confirmed = memory.claims
    .filter((claim) => claim.section === section && claim.status === "confirmed")
    .slice(-5)
    .map((claim) => `- ${claim.fieldPath}: ${claim.value}`);
  const proposed = memory.claims
    .filter((claim) => claim.section === section && claim.status === "proposed")
    .slice(-3)
    .map((claim) => `- ${claim.fieldPath}: ${claim.value}`);
  const openQuestions = memory.questions
    .filter((question) => question.section === section && question.status === "open")
    .slice(-2)
    .map((question) => `- ${question.prompt}`);

  const lines: string[] = [];
  if (confirmed.length > 0) {
    lines.push("Confirmed retained facts:", ...confirmed);
  }
  if (proposed.length > 0) {
    lines.push("Proposed retained facts:", ...proposed);
  }
  if (openQuestions.length > 0) {
    lines.push("Open clarifications:", ...openQuestions);
  }

  return lines.join("\n");
}

export function buildConflictClarificationPrompt(
  memory: ClaimMemoryState | undefined,
  preferredSection?: LogicSection
): string | undefined {
  if (!memory || !isClaimMemoryState(memory)) return undefined;

  const sectionMatch = preferredSection
    ? memory.questions.find((q) => q.status === "open" && q.reason === "conflict" && q.section === preferredSection)
    : undefined;
  const fallback = memory.questions.find((q) => q.status === "open" && q.reason === "conflict");
  return sectionMatch?.prompt ?? fallback?.prompt;
}

function pushUniqueSection(list: LogicSection[], section: LogicSection) {
  if (!list.includes(section)) list.push(section);
}

function inferSectionsFromText(text: string): LogicSection[] {
  const out: LogicSection[] = [];
  const normalized = text.trim();
  if (!normalized) return out;

  if (/\b(students?|youth|participants?|serve|north|south|east|west|philadelphia|impact|long[-\s]?term)\b/i.test(normalized)) {
    pushUniqueSection(out, "impact");
  }
  if (/\b(staff|volunteers?|budget|funding|curriculum|materials?|expertise|resources?)\b/i.test(normalized)) {
    pushUniqueSection(out, "resources");
  }
  if (/\b(workshops?|sessions?|mentoring|tutoring|activities|we\s+(run|provide|hold|deliver))\b/i.test(normalized)) {
    pushUniqueSection(out, "activities");
  }
  if (/\b(outputs?|metrics?|attendance|completion|number\s+of|count\s+of|targets?)\b/i.test(normalized)) {
    pushUniqueSection(out, "outputs_metrics");
  }
  if (/\b(quality|fidelity|monitoring|checklist|rubric|adherence)\b/i.test(normalized)) {
    pushUniqueSection(out, "quality_fidelity");
  }
  if (/\b(outcomes?|short\s*term|medium\s*term|long\s*term|change|improve|graduate|employment)\b/i.test(normalized)) {
    pushUniqueSection(out, "outcomes");
  }
  if (/\b(stakeholders?|teachers?|famil(y|ies)|community|partners?)\b/i.test(normalized)) {
    pushUniqueSection(out, "stakeholders");
  }

  return out;
}

function inferSectionsFromPatch(patch: Partial<LogicModel> | null): LogicSection[] {
  const out: LogicSection[] = [];
  if (!patch) return out;

  if (patch.intended_impact) pushUniqueSection(out, "impact");
  if (patch.stakeholders?.length) pushUniqueSection(out, "stakeholders");

  const implementation = patch.implementation;
  const hasResourcePatch = Boolean(
    implementation?.resources &&
      ((implementation.resources.human?.length ?? 0) > 0 ||
        (implementation.resources.material?.length ?? 0) > 0 ||
        (implementation.resources.financial?.length ?? 0) > 0 ||
        (implementation.resources.knowledge?.length ?? 0) > 0)
  );
  if (hasResourcePatch) pushUniqueSection(out, "resources");
  if ((implementation?.activities?.length ?? 0) > 0) pushUniqueSection(out, "activities");
  if ((implementation?.outputs_metrics?.length ?? 0) > 0) pushUniqueSection(out, "outputs_metrics");
  if (
    (implementation?.quality_fidelity?.quality?.length ?? 0) > 0 ||
    (implementation?.quality_fidelity?.fidelity?.length ?? 0) > 0
  ) {
    pushUniqueSection(out, "quality_fidelity");
  }

  if (
    (patch.outcomes?.short_term?.length ?? 0) > 0 ||
    (patch.outcomes?.medium_term?.length ?? 0) > 0 ||
    (patch.outcomes?.long_term?.length ?? 0) > 0
  ) {
    pushUniqueSection(out, "outcomes");
  }

  return out;
}

export function buildEvidenceLedgerFromTurn(args: {
  userMessage: string;
  modelPatch: Partial<LogicModel> | null;
  historyLength: number;
}): EvidenceLedger {
  const textSections = inferSectionsFromText(args.userMessage);
  const patchSections = inferSectionsFromPatch(args.modelPatch);
  const candidateSections = Array.from(new Set([...patchSections, ...textSections]));

  const confidence =
    patchSections.length > 0
      ? 0.85
      : textSections.length > 0
        ? 0.65
        : 0.25;

  return {
    entries: [
      {
        id: `turn-${args.historyLength + 1}`,
        turnIndex: args.historyLength + 1,
        turnRole: "user",
        text: args.userMessage,
        candidateSections,
        confidence,
        status: patchSections.length > 0 ? "committed" : "proposed",
        provenance: "user_stated",
      },
    ],
  };
}

export function computeSectionReadiness(
  model: LogicModel | undefined,
  ledger?: EvidenceLedger
): ReadinessSummary {
  if (!model) {
    return {
      scores: {
        impact: 0,
        resources: 0,
        activities: 0,
        outputs_metrics: 0,
        quality_fidelity: 0,
        outcomes: 0,
        stakeholders: 0,
      },
      nextSection: "impact",
    };
  }

  const impactBits = [
    model.intended_impact.population.trim().length > 0 ? 1 : 0,
    model.intended_impact.geography.trim().length > 0 ? 1 : 0,
    model.intended_impact.long_term_goal.trim().length > 0 ? 1 : 0,
  ];
  const impact = impactBits.reduce((a, b) => a + b, 0) / impactBits.length;

  const res = model.implementation.resources;
  const resourceBits = [
    res.human.length > 0 ? 1 : 0,
    res.material.length > 0 ? 1 : 0,
    res.financial.length > 0 ? 1 : 0,
    res.knowledge.length > 0 ? 1 : 0,
  ];
  const resources = resourceBits.reduce((a, b) => a + b, 0) / resourceBits.length;

  const activities = model.implementation.activities.length > 0 ? 1 : 0;
  const outputs_metrics = (model.implementation.outputs_metrics?.length ?? 0) > 0 ? 1 : 0;
  const quality_fidelity =
    (model.implementation.quality_fidelity.quality.length > 0 ||
      model.implementation.quality_fidelity.fidelity.length > 0)
      ? 1
      : 0;

  const outcomesBits = [
    model.outcomes.short_term.length > 0 ? 1 : 0,
    model.outcomes.medium_term.length > 0 ? 1 : 0,
    model.outcomes.long_term.length > 0 ? 1 : 0,
  ];
  const outcomes = outcomesBits.reduce((a, b) => a + b, 0) / outcomesBits.length;

  const stakeholders = model.stakeholders.length > 0 ? 1 : 0;

  const scores: SectionReadiness = {
    impact: clamp01(impact),
    resources: clamp01(resources),
    activities: clamp01(activities),
    outputs_metrics: clamp01(outputs_metrics),
    quality_fidelity: clamp01(quality_fidelity),
    outcomes: clamp01(outcomes),
    stakeholders: clamp01(stakeholders),
  };

  const defaultOrder: LogicSection[] = [
    "impact",
    "resources",
    "activities",
    "outputs_metrics",
    "quality_fidelity",
    "outcomes",
    "stakeholders",
  ];

  const momentumSections = (ledger?.entries ?? [])
    .flatMap((entry) => entry.candidateSections)
    .filter((section, idx, arr) => arr.indexOf(section) === idx);

  const momentumCandidate = momentumSections.find((section) => scores[section] < 1);
  const nextSection = momentumCandidate ?? defaultOrder.find((section) => scores[section] < 1) ?? "outcomes";

  return { scores, nextSection };
}

function hasActivities(patch: Partial<LogicModel> | null): boolean {
  return (patch?.implementation?.activities?.length ?? 0) > 0;
}

function hasOutcomes(patch: Partial<LogicModel> | null): boolean {
  return Boolean(
    (patch?.outcomes?.short_term?.length ?? 0) > 0 ||
      (patch?.outcomes?.medium_term?.length ?? 0) > 0 ||
      (patch?.outcomes?.long_term?.length ?? 0) > 0
  );
}

export function detectContextConflicts(args: {
  history: ChatMessage[];
  userMessage: string;
  reply: string;
  modelPatch: Partial<LogicModel> | null;
  mergedModel?: LogicModel;
}): ContextConflictFlag[] {
  const flags: ContextConflictFlag[] = [];
  const normalizedReply = args.reply.toLowerCase();

  if (/captured that activity|captured those activities/.test(normalizedReply) && !hasActivities(args.modelPatch)) {
    flags.push("ungrounded_capture_claim");
  }

  if (/captured those outcomes|captured that outcome/.test(normalizedReply) && !hasOutcomes(args.modelPatch)) {
    flags.push("ungrounded_capture_claim");
  }

  const merged = args.mergedModel;
  const asksGeography = /what (city|geography|location)|where (are|is) (your|the) (program|work)/i.test(args.reply);
  if (asksGeography && merged?.intended_impact.geography?.trim()) {
    flags.push("asks_for_known_information");
  }

  const lastAssistant = [...args.history].reverse().find((msg) => msg.role === "assistant")?.content ?? "";
  if (lastAssistant && lastAssistant.trim().toLowerCase() === args.reply.trim().toLowerCase()) {
    flags.push("repeated_prompt_risk");
  }

  return Array.from(new Set(flags));
}

export function applyGroundedReplyFallback(args: {
  reply: string;
  modelPatch: Partial<LogicModel> | null;
  nextSection: LogicSection;
}): string {
  const normalized = args.reply.toLowerCase();

  if (/captured that activity|captured those activities/.test(normalized) && !hasActivities(args.modelPatch)) {
    return "Thanks, that helps. Before we move on, what is one concrete activity your team delivers (for example, mentoring sessions, workshops, or tutoring)?";
  }

  if (/captured those outcomes|captured that outcome/.test(normalized) && !hasOutcomes(args.modelPatch)) {
    return "Thanks. Could you share one concrete short-term outcome you expect to see first?";
  }

  if (args.nextSection === "outputs_metrics" && /nested under activity records/i.test(args.reply)) {
    return "Thanks. What outputs or metrics will you track to know the work is being delivered as intended?";
  }

  return args.reply;
}
