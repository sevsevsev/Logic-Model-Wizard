import type { LogicModel } from "@/store/useLogicModelStore";

export type GuardrailIntent =
  | "impact_specificity"
  | "impact_statement"
  | "impact_population_facet"
  | "impact_geography_facet"
  | "impact_outcome_facet"
  | "impact_aspiration"
  | "impact_change_type"
  | "impact_review"
  | "geography"
  | "population_focus"
  | "resources"
  | "activities"
  | "outputs_metrics"
  | "quality_evidence"
  | "outcomes_review"
  | "section_refine"
  | "long_term_help" | "none";

export interface ImpactFacetState {
  draftText: string;
  hasImpactDraft: boolean;
  populationKnown: boolean;
  geographyKnown: boolean;
  concreteOutcomeKnown: boolean;
  needsImpactReview: boolean;
}

export function looksSpecificPopulation(text: string): boolean {
  if (!text.trim()) return false;

  // Grade / age / developmental stage specificity
  const gradeOrAgeSpecific = /\b(k\s*[-–]\s*\d+|\d+(?:st|nd|rd|th)\s+grad(?:e|ers?)?|(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\s+grad(?:e|ers?)?|elementary(?:\s+school)?|middle\s+school|high\s+school|grades?\s+\d|\d+(?:[-–]\d+)?[-\s]year[-\s]olds?|ages?\s+\d|early\s+childhood|preschool|kindergarten)\b/i.test(text);
  if (gradeOrAgeSpecific) return true;

  // Named population groups that are always specific enough on their own
  const namedGroup = /\b(veterans?|military\s+(?:families|spouses|members|veterans?)|returning\s+(?:citizens?|veterans?|residents?)|formerly\s+incarcerated|ex[-\s]offenders?|reentry|seniors?|elderly|older\s+adults?|refugees?|asylum\s+seekers?|undocumented\s+(?:immigrants?|residents?)|english\s+language\s+learners?|ELL|ESOL|LGBTQ\+?|BIPOC|people\s+experiencing\s+homelessness|unhoused|adults?\s+in\s+recovery|people\s+in\s+recovery)\b/i.test(text);
  if (namedGroup) return true;

  // Population noun + qualifier combinations
  const hasPopulationNoun = /\b(students?|youth|young\s+adults?|adults?|children|kids?|teens?|adolescents?|participants?|families|parents?|caregivers?|guardians?|residents?|individuals?|people|clients?|women|men|girls?|boys?|community\s+members?)\b/i.test(text);
  const hasQualifier = /\b(low[-\s]?income|first[-\s]?generation|justice[-\s]?involved|court[-\s]?involved|english\s+learners?|newcomer|immigrant|foster|homeless|unhoused|unemployed|underemployed|pregnant|parenting|teen\s+parents?|disabled?|with\s+disabilit|rural|tribal|at[-\s]?risk|underserved|marginalized|under-resourced|economically\s+disadvantaged|public\s+housing|in\s+recovery|recovering|formerly\s+incarcerated|returning|reentry|vulnerable|high[-\s]?need|special\s+needs?|chronic(?:ally)?\s+absent|dual[-\s]?language|bilingual|minority|under-represented)\b/i.test(text);
  if (hasPopulationNoun && hasQualifier) return true;

  // Fallback: any non-trivial description already stored in the model field (4+ distinct words)
  // trusts that the LLM extracted something meaningful rather than a generic placeholder
  const wordCount = text.trim().split(/\s+/).length;
  const isPlaceholder = /^(people|community|everyone|anyone|participants|clients|users|individuals)$/i.test(text.trim());
  if (wordCount >= 4 && !isPlaceholder) return true;

  return false;
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
  if (/\b(north|south|east|west|citywide|neighborhoods?|region|district|zip|borough|county|school\s+district|campus|site|statewide)\b/i.test(text)) {
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

  // Named schools: "Bethune Elementary School", "Roosevelt Middle School", etc.
  // Avoid treating generic phrases like "middle school students" as geography.
  if (/\b(?:[a-z][\w'&.-]*\s+){1,3}(?:elementary|middle|high)\s+school\b/i.test(text)) {
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

  // Always-accept: unambiguous one-word or short affirmatives
  if (/^(yes|yep|yup|yeah|correct|perfect|exactly|approved|confirmed|ok|okay)[\.!]?$/.test(normalized)) return true;

  // Phrase-level acceptance
  if (/(that captures it|this captures it|looks right|that works|sounds right|that's right|that is right|i approve|looks good|sounds good|that's good|that is good|that's accurate|that is accurate|that's correct|that is correct|that's it|that's perfect|looks perfect|yes[,! ]|let'?s move on|move on|next section|proceed|continue to|looks great|that's great|nailed it|spot on)/.test(normalized)) return true;

  // Short affirmative response (under 80 chars) that starts with yes/yep/correct/right
  if (normalized.length < 80 && /^(yes|yep|yup|correct|right|exactly|perfect|agreed|sure|absolutely)/.test(normalized)) return true;

  return false;
}

export function buildCompiledStatement(population: string, geography: string, longTermGoal: string): string | undefined {
  const p = population.trim();
  const g = geography.trim();
  if (!p || !g || !longTermGoal.trim()) return undefined;

  // Normalize the goal so it reads as a clean verb phrase after "will":
  // 1. Strip trailing punctuation.
  // 2. Strip a leading subject pronoun/noun so we don't get "will Students read…"
  // 3. If the first word is a gerund (ends in -ing), insert "be" → "will be reading…"
  let l = longTermGoal
    .trim()
    .replace(/[.!?]+$/, "")
    .trim();

  // Strip leading subject like "Students", "Youth", "Participants", "They", "We", "Clients", "Residents"
  l = l.replace(/^(?:students?|youth|participants?|clients?|residents?|they|we)\s+/i, "").trim();

  // Strip a leading auxiliary that duplicates "will"
  l = l.replace(/^(?:will|should|can)\s+/i, "").trim();

  // If the goal starts with a present participle, insert "be" to get "will be <gerund>"
  if (/^\w+ing\b/i.test(l)) {
    l = `be ${l}`;
  }

  // Normalize sentence casing for display quality.
  if (/^[A-Z][a-z]/.test(l)) {
    l = l.charAt(0).toLowerCase() + l.slice(1);
  }

  const statement = `${p} in ${g} will ${l}`.replace(/\s+/g, " ").trim();
  return statement.charAt(0).toUpperCase() + statement.slice(1);
}

function hasAnchoredGeographyInImpactDraft(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;

  const geographyMatch = normalized.match(/\bin\s+(.+?)\s+will\b/i);
  if (!geographyMatch) return false;

  return looksSpecificGeography(geographyMatch[1]);
}

export function deriveImpactFacetState(model: LogicModel | undefined): ImpactFacetState {
  const impact = model?.intended_impact;
  if (!impact) {
    return {
      draftText: "",
      hasImpactDraft: false,
      populationKnown: false,
      geographyKnown: false,
      concreteOutcomeKnown: false,
      needsImpactReview: false,
    };
  }

  const compiledStatement = impact.compiled_statement.trim();
  const synthesizedStatement = buildCompiledStatement(
    impact.population,
    impact.geography,
    impact.long_term_goal
  );
  const draftText = compiledStatement || synthesizedStatement || impact.long_term_goal.trim();
  const populationKnown =
    looksSpecificPopulation(impact.population) || looksSpecificPopulation(draftText);
  const geographyKnown =
    looksSpecificGeography(impact.geography) || hasAnchoredGeographyInImpactDraft(draftText);
  const concreteOutcomeKnown = hasConcreteImpactMarker(impact.long_term_goal || draftText);
  const hasImpactDraft = draftText.trim().length > 0;
  const needsImpactReview =
    populationKnown && geographyKnown && concreteOutcomeKnown && !compiledStatement;

  return {
    draftText,
    hasImpactDraft,
    populationKnown,
    geographyKnown,
    concreteOutcomeKnown,
    needsImpactReview,
  };
}

export function inferNextRequiredIntent(model: LogicModel | undefined): GuardrailIntent | undefined {
  if (!model) return undefined;

  const impactState = deriveImpactFacetState(model);

  if (!impactState.populationKnown) {
    return "population_focus";
  }

  const resources = model.implementation.resources;
  const hasResources =
    resources.human.length > 0 ||
    resources.material.length > 0 ||
    resources.financial.length > 0 ||
    resources.knowledge.length > 0;

  const activities = model.implementation.activities;
  const hasImplementationProgress = hasResources || activities.length > 0;

  if (!impactState.geographyKnown && !hasImplementationProgress) {
    return "geography";
  }

  if (!impactState.concreteOutcomeKnown) {
    // Also accept any substantive statement (15+ chars) even without specific outcome vocabulary.
    // The LLM can coach toward specificity at impact_review rather than blocking advancement.
    if (!impactState.draftText || impactState.draftText.trim().length < 15) {
      return "impact_specificity";
    }
  }

  // All three inputs are present and concrete — but the user has not yet confirmed the
  // synthesized statement. Hold at impact_review until compiled_statement is populated.
  if (impactState.needsImpactReview) {
    return "impact_review";
  }

  if (!hasResources) {
    return "resources";
  }

  if (activities.length === 0) {
    return "activities";
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
