import type { LogicModel } from "@/store/useLogicModelStore";

export type SuggestionPath =
  | "stakeholders"
  | "intended_impact.population"
  | "intended_impact.geography"
  | "intended_impact.long_term_goal"
  | "intended_impact.compiled_statement"
  | "implementation.resources.human"
  | "implementation.resources.material"
  | "implementation.resources.financial"
  | "implementation.resources.knowledge"
  | "implementation.activities"
  | "outcomes.short_term"
  | "outcomes.medium_term"
  | "outcomes.long_term";

export interface BootstrapSuggestion {
  id: string;
  label: string;
  path: SuggestionPath;
  value:
    | string
    | string[]
    | Array<{
        category: string;
        actions: string[];
        outputs: Array<string | { text: string; subcategory?: string }>;
        subcategory?: string;
        stakeholderIds?: string[];
        stakeholderLabels?: string[];
      }>
    | Array<{
        statement: string;
        stakeholderIds?: string[];
        stakeholderLabels?: string[];
      }>;
  confidence: number;
  rationale: string;
  evidence: string;
  sourceFile?: string;
}

export interface BootstrapExtractionResponse {
  suggestions: BootstrapSuggestion[];
  summary: string;
}

export function getNextGapQuestion(model: LogicModel): string {
  if (!model.intended_impact.population) {
    return "Who, specifically, does your program exist to serve?";
  }
  if (!model.intended_impact.geography) {
    return "Where does your program primarily operate?";
  }
  if (!model.intended_impact.long_term_goal) {
    return "If your program succeeds in 10 years, what will be different in participants' lives?";
  }
  if (
    model.implementation.resources.human.length === 0 &&
    model.implementation.resources.material.length === 0 &&
    model.implementation.resources.financial.length === 0 &&
    model.implementation.resources.knowledge.length === 0
  ) {
    return "What are the most important resources your program relies on (people, materials, funding, or expertise)?";
  }
  if (model.implementation.activities.length === 0) {
    return "What are the 1-3 main activities your team actually does each week?";
  }
  if (
    model.outcomes.short_term.length === 0 ||
    model.outcomes.medium_term.length === 0 ||
    model.outcomes.long_term.length === 0
  ) {
    return "What short-term knowledge change, medium-term behavior change, and long-term condition change do you expect?";
  }
  return "Which section would you like to refine next: activities, outputs, or outcomes?";
}
