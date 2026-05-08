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

export interface AgentTurnInput {
  apiKey: string;
  userMessage: string;
  history: ChatMessage[];
  modelSnapshot?: LogicModel;
}

export interface AgentTurnResult {
  reply: string;
  questionIntent: AgentQuestionIntent;
  modelPatch: Partial<LogicModel> | null;
  confidence?: number;
  evidenceRefs?: string[];
}
