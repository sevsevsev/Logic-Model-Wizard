import type { LogicModel } from "@/store/useLogicModelStore";
import { deriveImpactFacetState } from "@/lib/chat/guardrails";

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
  qualityRating?: "Strong" | "Adequate" | "Weak";
  critique?: string;
}

export interface BootstrapExtractionResponse {
  suggestions: BootstrapSuggestion[];
  summary: string;
}

export interface BootstrapStartOption {
  label: string;
  value: string;
}

export type BootstrapStartSection = "impact" | "implementation" | "outcomes";

export interface BootstrapStartRecommendation {
  section: BootstrapStartSection;
  label: string;
  prompt: string;
}

function toStartSection(path: SuggestionPath): BootstrapStartSection {
  if (path.startsWith("intended_impact.")) return "impact";
  if (path.startsWith("implementation.")) return "implementation";
  if (path.startsWith("outcomes.")) return "outcomes";
  return "implementation";
}

function sectionLabel(section: BootstrapStartSection): string {
  if (section === "impact") return "Intended Impact";
  if (section === "implementation") return "Implementation";
  return "Outcomes";
}

function baseStartRecommendation(model: LogicModel): BootstrapStartRecommendation {
  const impactState = deriveImpactFacetState(model);
  if (
    !impactState.hasImpactDraft ||
    !impactState.populationKnown ||
    !impactState.geographyKnown ||
    !impactState.concreteOutcomeKnown ||
    impactState.needsImpactReview
  ) {
    return {
      section: "impact",
      label: "Intended Impact",
      prompt:
        "I recommend starting with Intended Impact so we anchor the rest of the model to a clear long-term target.",
    };
  }

  const hasResourcesData =
    model.implementation.resources.human.length > 0 ||
    model.implementation.resources.material.length > 0 ||
    model.implementation.resources.financial.length > 0 ||
    model.implementation.resources.knowledge.length > 0;
  const hasActivitiesData = model.implementation.activities.length > 0;
  if (!hasResourcesData || !hasActivitiesData) {
    return {
      section: "implementation",
      label: "Implementation",
      prompt:
        "I recommend starting with Implementation so we can tighten what the program does and what it needs to run well.",
    };
  }

  const hasShort = model.outcomes.short_term.length > 0;
  const hasMedium = model.outcomes.medium_term.length > 0;
  const hasLong = model.outcomes.long_term.length > 0;
  if (!hasShort || !hasMedium || !hasLong) {
    return {
      section: "outcomes",
      label: "Outcomes",
      prompt:
        "I recommend starting with Outcomes so we can confirm the short-, medium-, and long-term changes your work should drive.",
    };
  }

  return {
    section: "impact",
    label: "Intended Impact",
    prompt:
      "I recommend starting with Intended Impact to confirm the model's north star before we refine details.",
  };
}

export function getBootstrapStartRecommendation(
  model: LogicModel,
  suggestions: BootstrapSuggestion[] = []
): BootstrapStartRecommendation {
  const baseRecommendation = baseStartRecommendation(model);
  const impactState = deriveImpactFacetState(model);

  // If impact still needs anchoring, keep it as the start regardless of extraction uncertainty.
  if (
    !impactState.hasImpactDraft ||
    !impactState.populationKnown ||
    !impactState.geographyKnown ||
    !impactState.concreteOutcomeKnown ||
    impactState.needsImpactReview
  ) {
    return baseRecommendation;
  }

  const uncertainSuggestions = suggestions.filter(
    (suggestion) => suggestion.qualityRating === "Weak" || suggestion.confidence < 0.45
  );
  if (uncertainSuggestions.length === 0) {
    return baseRecommendation;
  }

  const sectionCounts = new Map<BootstrapStartSection, number>();
  for (const suggestion of uncertainSuggestions) {
    const section = toStartSection(suggestion.path);
    sectionCounts.set(section, (sectionCounts.get(section) ?? 0) + 1);
  }

  const sortedCounts = Array.from(sectionCounts.entries()).sort((a, b) => b[1] - a[1]);
  const top = sortedCounts[0];
  if (!top) {
    return baseRecommendation;
  }

  const broadUncertainty = sortedCounts.length >= 2 && uncertainSuggestions.length >= 4;
  if (broadUncertainty) {
    return {
      ...baseRecommendation,
      prompt:
        "I recommend starting with " +
        `${baseRecommendation.label} so we keep this manageable and improve the model one section at a time.`,
    };
  }

  const [topSection, topCount] = top;
  if (topCount >= 2 || topCount / uncertainSuggestions.length >= 0.5) {
    const label = sectionLabel(topSection);
    return {
      section: topSection,
      label,
      prompt:
        `I recommend starting with ${label} because that section likely needs the most clarification from the uploaded material.`,
    };
  }

  return baseRecommendation;
}

export function getBootstrapStartOptions(
  model: LogicModel,
  suggestions: BootstrapSuggestion[] = []
): BootstrapStartOption[] | null {
  const impactState = deriveImpactFacetState(model);
  const hasImpactData = impactState.hasImpactDraft;

  const hasResourcesData =
    model.implementation.resources.human.length > 0 ||
    model.implementation.resources.material.length > 0 ||
    model.implementation.resources.financial.length > 0 ||
    model.implementation.resources.knowledge.length > 0;
  const hasActivitiesData = model.implementation.activities.length > 0;
  const hasImplementationData = hasResourcesData || hasActivitiesData;

  const hasOutcomesData =
    model.outcomes.short_term.length > 0 ||
    model.outcomes.medium_term.length > 0 ||
    model.outcomes.long_term.length > 0;

  const populatedPartCount = [hasImpactData, hasImplementationData, hasOutcomesData].filter(Boolean)
    .length;

  // Offer choice only when uploaded content has already populated multiple parts.
  if (populatedPartCount < 2) return null;

  const recommendation = getBootstrapStartRecommendation(model, suggestions);

  return [
    {
      label: "Intended Impact",
      value: "Let's begin with intended impact.",
    },
    {
      label: "Implementation",
      value: "Let's begin with implementation (resources, activities, and outputs).",
    },
    {
      label: "Outcomes",
      value: "Let's begin with outcomes.",
    },
    {
      label: `Use recommended start (${recommendation.label})`,
      value: `Let's begin with ${recommendation.label.toLowerCase()}.`,
    },
  ];
}

export function getNextGapQuestion(model: LogicModel): string {
  const impactState = deriveImpactFacetState(model);

  if (!impactState.hasImpactDraft) {
    return "What one-sentence intended impact statement best captures the long-term change your program is working toward?";
  }
  if (!impactState.populationKnown) {
    return "I can see a draft intended impact statement, but it still needs a clearer population anchor. Who is this impact statement really about?";
  }
  if (!impactState.geographyKnown) {
    return "I can see the draft intended impact statement, but it still needs a place anchor. What place should this statement be anchored to?";
  }
  if (!impactState.concreteOutcomeKnown) {
    return "I can see the draft intended impact statement, but it still needs a more concrete long-term outcome. What exact long-term difference should it point to in participants' lives?";
  }
  if (impactState.needsImpactReview) {
    return "I can see the draft intended impact statement. Does it capture the long-term change you want to anchor the model around, or should we tighten the population, geography, or outcome?";
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
