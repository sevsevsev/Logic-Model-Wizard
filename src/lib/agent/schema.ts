import type { LogicModel } from "@/store/useLogicModelStore";
import type {
  AgentContradictionFlag,
  AgentPatchProvenance,
  AgentQuestionIntent,
  AgentStateAssessment,
} from "@/lib/agent/types";

const ALLOWED_INTENTS: Set<AgentQuestionIntent> = new Set([
  "impact_aspiration",
  "impact_change_type",
  "impact_specificity",
  "impact_review",
  "long_term_help",
  "geography",
  "population_focus",
  "resources",
  "activities",
  "outputs_metrics",
  "quality_evidence",
  "outcomes_review",
  "section_refine",
  "none",
]);

export interface AgentStructuredOutput {
  assistant_reply: string;
  question_intent: AgentQuestionIntent;
  model_patch?: Partial<LogicModel>;
  confidence?: number;
  evidence_refs?: string[];
  decision_summary?: string;
  state_assessment?: AgentStateAssessment;
  contradiction_flags?: AgentContradictionFlag[];
  patch_provenance?: AgentPatchProvenance[];
}

const INTENT_ALIASES: Record<string, AgentQuestionIntent> = {
  aspiration: "impact_aspiration",
  impact: "impact_aspiration",
  impact_change: "impact_change_type",
  impact_change_type: "impact_change_type",
  impact_specificity: "impact_specificity",
  specificity: "impact_specificity",
  impact_review: "impact_review",
  review: "impact_review",
  help_long_term: "long_term_help",
  long_term_help: "long_term_help",
  geography: "geography",
  population: "population_focus",
  population_focus: "population_focus",
  resources: "resources",
  activities: "activities",
  outputs: "outputs_metrics",
  outputs_metrics: "outputs_metrics",
  quality: "quality_evidence",
  quality_evidence: "quality_evidence",
  outcomes: "outcomes_review",
  outcomes_review: "outcomes_review",
  refine: "section_refine",
  section_refine: "section_refine",
  none: "none",
};

function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractJsonObjectCandidate(text: string): string {
  const cleaned = stripCodeFences(text);
  if (!cleaned) return "";

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return cleaned.slice(firstBrace, lastBrace + 1).trim();
  }

  return cleaned;
}

function normalizeIntent(rawIntent: unknown): AgentQuestionIntent {
  if (typeof rawIntent !== "string") return "none";
  const normalized = rawIntent.trim().toLowerCase();
  if (!normalized) return "none";
  if (ALLOWED_INTENTS.has(normalized as AgentQuestionIntent)) {
    return normalized as AgentQuestionIntent;
  }
  return INTENT_ALIASES[normalized] ?? "none";
}

function parseJsonWithLooseRecovery(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const recovered = text.replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(recovered);
  }
}

function toObjectOrNull(raw: unknown): Record<string, unknown> | null {
  if (isPlainObject(raw)) return raw;
  if (typeof raw !== "string") return null;

  const extracted = extractJsonObjectCandidate(raw);
  if (!extracted) return null;

  try {
    const parsed = parseJsonWithLooseRecovery(extracted);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const ALLOWED_CONTRADICTIONS: Set<AgentContradictionFlag> = new Set([
  "asks_for_known_information",
  "known_fact_overwrite",
  "phase_regression",
  "unsupported_patch",
]);

const ALLOWED_PROVENANCE: Set<AgentPatchProvenance> = new Set([
  "user_stated",
  "retrieved_guidance",
  "assistant_inferred",
]);

export function parseAgentStructuredOutput(rawText: string): AgentStructuredOutput | null {
  const cleaned = extractJsonObjectCandidate(rawText);
  if (!cleaned) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }

  if (!isPlainObject(parsed)) return null;
  const reply = parsed.assistant_reply;
  const intent = parsed.question_intent;

  if (typeof reply !== "string" || reply.trim().length === 0) return null;
  if (typeof intent !== "string" || !ALLOWED_INTENTS.has(intent as AgentQuestionIntent)) return null;

  const output: AgentStructuredOutput = {
    assistant_reply: reply.trim(),
    question_intent: intent as AgentQuestionIntent,
  };

  if (isPlainObject(parsed.model_patch)) {
    output.model_patch = parsed.model_patch as Partial<LogicModel>;
  }

  if (typeof parsed.confidence === "number") {
    output.confidence = Math.max(0, Math.min(1, parsed.confidence));
  }

  if (Array.isArray(parsed.evidence_refs)) {
    output.evidence_refs = parsed.evidence_refs.filter((v): v is string => typeof v === "string");
  }

  if (typeof parsed.decision_summary === "string") {
    output.decision_summary = parsed.decision_summary;
  }

  if (isPlainObject(parsed.state_assessment)) {
    const stateAssessment: AgentStateAssessment = {};
    if (typeof parsed.state_assessment.currentPhase === "string") {
      stateAssessment.currentPhase = parsed.state_assessment.currentPhase;
    }
    if (Array.isArray(parsed.state_assessment.knownFacts)) {
      stateAssessment.knownFacts = parsed.state_assessment.knownFacts.filter(
        (v): v is string => typeof v === "string"
      );
    }
    if (Array.isArray(parsed.state_assessment.missingFields)) {
      stateAssessment.missingFields = parsed.state_assessment.missingFields.filter(
        (v): v is string => typeof v === "string"
      );
    }
    if (Object.keys(stateAssessment).length > 0) {
      output.state_assessment = stateAssessment;
    }
  }

  if (Array.isArray(parsed.contradiction_flags)) {
    output.contradiction_flags = parsed.contradiction_flags.filter(
      (value): value is AgentContradictionFlag =>
        typeof value === "string" && ALLOWED_CONTRADICTIONS.has(value as AgentContradictionFlag)
    );
  }

  if (Array.isArray(parsed.patch_provenance)) {
    output.patch_provenance = parsed.patch_provenance.filter(
      (value): value is AgentPatchProvenance =>
        typeof value === "string" && ALLOWED_PROVENANCE.has(value as AgentPatchProvenance)
    );
  }

  return output;
}

export function salvageAgentStructuredOutput(rawText: string): AgentStructuredOutput | null {
  const object = toObjectOrNull(rawText);
  if (!object) return null;

  const rawReply =
    (typeof object.assistant_reply === "string" && object.assistant_reply) ||
    (typeof object.reply === "string" && object.reply) ||
    (typeof object.assistantReply === "string" && object.assistantReply) ||
    "";

  const assistantReply = rawReply.trim();
  if (!assistantReply) return null;

  const output: AgentStructuredOutput = {
    assistant_reply: assistantReply,
    question_intent: normalizeIntent(
      object.question_intent ?? object.questionIntent ?? object.intent ?? "none"
    ),
  };

  const patchCandidate =
    object.model_patch ?? object.modelPatch ?? object.patch ?? null;
  if (isPlainObject(patchCandidate)) {
    output.model_patch = patchCandidate as Partial<LogicModel>;
  }

  if (typeof object.confidence === "number") {
    output.confidence = Math.max(0, Math.min(1, object.confidence));
  }

  if (Array.isArray(object.evidence_refs)) {
    output.evidence_refs = object.evidence_refs.filter((v): v is string => typeof v === "string");
  }

  if (typeof object.decision_summary === "string") {
    output.decision_summary = object.decision_summary;
  }

  if (isPlainObject(object.state_assessment)) {
    const stateAssessment: AgentStateAssessment = {};
    if (typeof object.state_assessment.currentPhase === "string") {
      stateAssessment.currentPhase = object.state_assessment.currentPhase;
    }
    if (Array.isArray(object.state_assessment.knownFacts)) {
      stateAssessment.knownFacts = object.state_assessment.knownFacts.filter(
        (v): v is string => typeof v === "string"
      );
    }
    if (Array.isArray(object.state_assessment.missingFields)) {
      stateAssessment.missingFields = object.state_assessment.missingFields.filter(
        (v): v is string => typeof v === "string"
      );
    }
    if (Object.keys(stateAssessment).length > 0) {
      output.state_assessment = stateAssessment;
    }
  }

  if (Array.isArray(object.contradiction_flags)) {
    output.contradiction_flags = object.contradiction_flags.filter(
      (value): value is AgentContradictionFlag =>
        typeof value === "string" && ALLOWED_CONTRADICTIONS.has(value as AgentContradictionFlag)
    );
  }

  if (Array.isArray(object.patch_provenance)) {
    output.patch_provenance = object.patch_provenance.filter(
      (value): value is AgentPatchProvenance =>
        typeof value === "string" && ALLOWED_PROVENANCE.has(value as AgentPatchProvenance)
    );
  }

  return output;
}
