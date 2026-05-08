import type { LogicModel } from "@/store/useLogicModelStore";

export type GuardrailIntent =
  | "impact_specificity"
  | "impact_review"
  | "geography"
  | "population_focus"
  | "resources"
  | "activities"
  | "outputs_metrics"
  | "quality_evidence"
  | "outcomes_review"
  | "section_refine";

export function looksSpecificPopulation(text: string): boolean {
  const gradeOrAgeSpecific = /\b(k\s*[-–]\s*\d+|\d+(?:st|nd|rd|th)\s+grad(?:e|ers?)?|(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\s+grad(?:e|ers?)?|elementary(?:\s+school)?|middle\s+school|high\s+school|grades?\s+\d|\d+(?:[-–]\d+)?[-\s]year[-\s]olds?|ages?\s+\d|early\s+childhood|preschool|kindergarten)\b/i.test(
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
  // Common place names and neighborhood shorthand users provide directly.
  if (
    /\b(philadelphia|center\s+city|kensington|fishtown|germantown|south\s+philly|north\s+philly|west\s+philly|northeast\s+philadelphia|northwest\s+philadelphia)\b/i.test(
      text
    )
  ) {
    return true;
  }

  // Administrative / directional geography terms
  if (/\b(north|south|east|west|citywide|neighborhood|region|district|zip|borough|county|school\s+district|campus|site|statewide)\b/i.test(text)) {
    return true;
  }

  // City/state shorthand like "Philadelphia, PA".
  if (/\b[a-z]+(?:\s+[a-z]+){0,2},\s*[a-z]{2}\b/i.test(text)) {
    return true;
  }

  // ZIP-code specificity.
  if (/\b(?:zip(?:\s+code)?\s*)?\d{5}(?:-\d{4})?\b/i.test(text)) {
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

  // All three inputs are present and concrete — but the user has not yet confirmed the
  // synthesized statement. Hold at impact_review until compiled_statement is populated.
  if (!model.intended_impact.compiled_statement?.trim()) {
    return "impact_review";
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

  return "section_refine";
}