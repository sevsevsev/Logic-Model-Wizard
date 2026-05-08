import type { LogicModel } from "@/store/useLogicModelStore";
import type { AgentQuestionIntent } from "@/lib/agent/types";

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
}

function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseAgentStructuredOutput(rawText: string): AgentStructuredOutput | null {
  const cleaned = stripCodeFences(rawText);
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

  return output;
}
