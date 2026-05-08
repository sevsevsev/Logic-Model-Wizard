import type { LogicModel, ChatMessage } from "@/store/useLogicModelStore";

export type AgentQuestionIntent =
  | "impact_aspiration"
  | "impact_change_type"
  | "impact_specificity"
  | "impact_review"
  | "long_term_help"
  | "geography"
  | "population_focus"
  | "resources"
  | "activities"
  | "outputs_metrics"
  | "quality_evidence"
  | "outcomes_review"
  | "section_refine"
  | "none";

export type AgentContradictionFlag =
  | "asks_for_known_information"
  | "known_fact_overwrite"
  | "phase_regression"
  | "unsupported_patch";

export type AgentPatchProvenance =
  | "user_stated"
  | "retrieved_guidance"
  | "assistant_inferred";

export interface AgentStateAssessment {
  currentPhase?: string;
  knownFacts?: string[];
  missingFields?: string[];
}

export interface AgentTurnInput {
  apiKey: string;
  userMessage: string;
  history: ChatMessage[];
  modelSnapshot?: LogicModel;
  userId?: string;
}

export interface AgentTurnResult {
  reply: string;
  questionIntent: AgentQuestionIntent;
  modelPatch: Partial<LogicModel> | null;
  confidence?: number;
  evidenceRefs?: string[];
  stateAssessment?: AgentStateAssessment;
  contradictionFlags?: AgentContradictionFlag[];
  patchProvenance?: AgentPatchProvenance[];
  decisionSummary?: string;
}
