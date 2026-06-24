import type { LogicModel } from "@/store/useLogicModelStore";
import type { ChatMessage } from "@/store/useLogicModelStore";

export type GuardrailIntent =
  | "impact_specificity"
  | "geography"
  | "population_focus"
  | "resources"
  | "activities"
  | "outputs_metrics"
  | "quality_evidence"
  | "outcomes_review"
  | "causal_review"
  | "section_refine";

type ImpactMissingIntent = "population_focus" | "geography" | "impact_specificity";

export interface ImpactDraftReadiness {
  ready: boolean;
  populationKnown: boolean;
  geographyKnown: boolean;
  concreteOutcomeKnown: boolean;
  missingIntent?: ImpactMissingIntent;
  bypassed?: boolean;
}

const IMPACT_GATING_ATTEMPT_PATTERNS: Record<ImpactMissingIntent, RegExp> = {
  population_focus:
    /(who exactly is the primary population|who exactly do you serve|which students specifically|particular subset|specific group)/i,
  geography:
    /(what specific geography|where do you serve|citywide|neighborhoods|zip codes|specific schools)/i,
  impact_specificity:
    /(what exact long-term difference|point to in 10 years|concrete long-term change|make that impact statement more specific)/i,
};

function isNonEmpty(value: string | undefined | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function countRecentAssistantAttempts(
  safeHistory: ChatMessage[],
  missingIntent: ImpactMissingIntent,
  lookbackTurns = 10
): number {
  const pattern = IMPACT_GATING_ATTEMPT_PATTERNS[missingIntent];
  if (!pattern) return 0;

  return safeHistory
    .slice(-lookbackTurns)
    .filter((msg) => msg.role === "assistant")
    .map((msg) => msg.content)
    .filter((text) => pattern.test(text)).length;
}

export function looksSpecificPopulation(text: string): boolean {
  const gradeOrAgeSpecific = /\b(k\s*[-–]\s*\d+|\d+(?:st|nd|rd|th)\s+grad(?:e|ers?)?|elementary(?:\s+school)?|middle\s+school|high\s+school|grades?\s+\d|\d+(?:[-–]\d+)?[-\s]year[-\s]olds?|ages?\s+\d|early\s+childhood|preschool|kindergarten)\b/i.test(
    text
  );

  if (gradeOrAgeSpecific) return true;

  const hasPopulationNoun = /\b(students?|youth|young\s+adults?|adults?|participants?)\b/i.test(text);
  const hasQualifier = /\b(low[-\s]?income|first[-\s]?generation|justice[-\s]?involved|court[-\s]?involved|english\s+learners?|newcomer|immigrant|foster|homeless|unemployed|pregnant|parenting|disabled|with\s+disabilities|rural|tribal)\b/i.test(
    text
  );

  return hasPopulationNoun && hasQualifier;
}

export function looksSpecificGeography(text: string): boolean {
  // Administrative / directional geography terms
  if (/\b(north|south|east|west|citywide|neighborhood|region|district|zip|borough|county|school\s+district|campus|site|statewide)\b/i.test(text)) {
    return true;
  }
  // Named schools: "Bethune Elementary", "Roosevelt Middle School", etc.
  if (/\b\w[\w\s]*(?:elementary|middle|high)\s*(?:school)?\b/i.test(text)) {
    return true;
  }
  // Explicit school-list phrasing: "in these schools: …", "at these schools: …"
  if (/\b(?:in|at|across)\s+(?:these\s+)?schools?\b/i.test(text)) {
    return true;
  }
  return false;
}

export function hasConcreteImpactMarker(text: string): boolean {
  return /(graduate|graduation|postsecondary|college|credential|employment|job|wage|income|housing|homeless|justice|incarcer|arrest|violence|safety|health|mental health|attendance|absenteeism|reading level|grade level)/i.test(
    text
  );
}

export function isExplicitImpactAcceptance(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;

  return /(yes[, ]|yes\.|that captures it|this captures it|looks right|that works|sounds right|i approve|approved|confirmed)/i.test(
    normalized
  );
}

export function buildCompiledStatement(population: string, geography: string, longTermGoal: string): string | undefined {
  const p = population.trim();
  const g = geography.trim();
  const l = longTermGoal.trim();
  if (!p || !g || !l) return undefined;
  return `${p} in ${g} will ${l}`;
}

export function inferImpactDraftReadiness(
  modelSnapshot: LogicModel | undefined,
  safeHistory: ChatMessage[],
  latestUserMessage: string
): ImpactDraftReadiness {
  const latestMessage = latestUserMessage.trim();
  const historyUserText = safeHistory
    .filter((msg) => msg.role === "user")
    .map((msg) => msg.content)
    .join("\n");

  const contextText = `${historyUserText}\n${latestMessage}`;
  const modelPopulation = modelSnapshot?.intended_impact.population ?? "";
  const modelGeography = modelSnapshot?.intended_impact.geography ?? "";
  const modelOutcome = `${modelSnapshot?.intended_impact.long_term_goal ?? ""} ${
    modelSnapshot?.intended_impact.compiled_statement ?? ""
  }`;

  const populationKnown =
    (isNonEmpty(modelPopulation) && looksSpecificPopulation(modelPopulation)) ||
    looksSpecificPopulation(contextText);
  const geographyKnown =
    (isNonEmpty(modelGeography) && looksSpecificGeography(modelGeography)) ||
    looksSpecificGeography(contextText);
  const concreteOutcomeKnown =
    hasConcreteImpactMarker(modelOutcome) || hasConcreteImpactMarker(contextText);

  const ready = populationKnown && geographyKnown && concreteOutcomeKnown;

  if (ready) {
    return { ready, populationKnown, geographyKnown, concreteOutcomeKnown, bypassed: false };
  }

  const missingIntent: ImpactMissingIntent = !populationKnown
    ? "population_focus"
    : !geographyKnown
      ? "geography"
      : "impact_specificity";

  const attempts = countRecentAssistantAttempts(safeHistory, missingIntent);
  if (attempts > 0) {
    return {
      ready: true,
      populationKnown,
      geographyKnown,
      concreteOutcomeKnown,
      missingIntent,
      bypassed: true,
    };
  }

  return {
    ready,
    populationKnown,
    geographyKnown,
    concreteOutcomeKnown,
    missingIntent,
    bypassed: false,
  };
}

export function inferNextRequiredIntent(model: LogicModel | undefined): GuardrailIntent | undefined {
  if (!model) return undefined;

  if (!looksSpecificPopulation(model.intended_impact.population)) {
    return "population_focus";
  }

  if (!looksSpecificGeography(model.intended_impact.geography)) {
    return "geography";
  }

  const impactMarker = model.intended_impact.long_term_goal || model.intended_impact.compiled_statement;
  if (!hasConcreteImpactMarker(impactMarker)) {
    return "impact_specificity";
  }

  const resources = model.implementation.resources;
  const hasResources =
    resources.human.length > 0 ||
    resources.material.length > 0 ||
    resources.financial.length > 0 ||
    resources.knowledge.length > 0;
  if (!hasResources) {
    return "resources";
  }

  const activities = model.implementation.activities;
  if (activities.length === 0) {
    return "activities";
  }

  const hasOutputs = activities.some((activity) => Array.isArray(activity.outputs) && activity.outputs.length > 0);
  if (!hasOutputs) {
    return "outputs_metrics";
  }

  const qualityFidelity = model.implementation.quality_fidelity ?? {
    fidelity: [],
    quality: [],
  };
  const hasQualityEvidence =
    qualityFidelity.fidelity.length > 0 ||
    qualityFidelity.quality.length > 0;
  if (!hasQualityEvidence) {
    return "quality_evidence";
  }

  const hasOutcomes =
    model.outcomes.short_term.length > 0 ||
    model.outcomes.medium_term.length > 0 ||
    model.outcomes.long_term.length > 0;

  if (!hasOutcomes) {
    return "outcomes_review";
  }

  const hasIntendedImpactEntry = [
    model.intended_impact.population,
    model.intended_impact.geography,
    model.intended_impact.long_term_goal,
    model.intended_impact.compiled_statement,
  ].some((value) => isNonEmpty(value));

  const structurallyComplete = hasIntendedImpactEntry && activities.length > 0 && hasOutcomes;
  if (structurallyComplete) {
    return "causal_review";
  }

  return "section_refine";
}