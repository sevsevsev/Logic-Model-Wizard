import type { ChatMessage, LogicModel } from "@/store/useLogicModelStore";
import { buildContextCoverageSummary } from "@/lib/chat/agenticContext";
import {
  deriveImpactFacetState,
  hasConcreteImpactMarker,
  inferNextRequiredIntent,
  looksSpecificGeography,
  looksSpecificPopulation,
  type GuardrailIntent,
} from "@/lib/chat/guardrails";

export interface AgentTurnBrief {
  currentPhase: GuardrailIntent | "complete" | "unknown";
  lastAssistantQuestion: string | null;
  confirmedFacts: string[];
  missingFields: string[];
  latestUserSignals: string[];
  avoidAskingFor: string[];
}

function getLastAssistantQuestion(history: ChatMessage[]): string | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message.role !== "assistant") continue;
    if (!message.content.includes("?")) continue;
    return message.content.trim();
  }

  return null;
}

function buildConfirmedFacts(modelSnapshot: LogicModel | undefined): string[] {
  if (!modelSnapshot) return [];

  const facts: string[] = [];
  const impact = modelSnapshot.intended_impact;

  if (looksSpecificPopulation(impact.population)) {
    facts.push(`Population already confirmed: ${impact.population}`);
  }
  if (looksSpecificGeography(impact.geography)) {
    facts.push(`Geography already confirmed: ${impact.geography}`);
  }
  if (hasConcreteImpactMarker(impact.long_term_goal || impact.compiled_statement)) {
    facts.push(`Long-term change already confirmed: ${impact.long_term_goal || impact.compiled_statement}`);
  }
  if (impact.compiled_statement.trim()) {
    facts.push(`Compiled impact statement already accepted: ${impact.compiled_statement}`);
  }

  const resources = modelSnapshot.implementation.resources;
  const capturedBuckets: string[] = [];
  if (resources.human.length > 0) capturedBuckets.push(`people: ${resources.human.join(", ")}`);
  if (resources.material.length > 0) capturedBuckets.push(`materials: ${resources.material.join(", ")}`);
  if (resources.financial.length > 0) capturedBuckets.push(`funding: ${resources.financial.join(", ")}`);
  if (resources.knowledge.length > 0) capturedBuckets.push(`expertise: ${resources.knowledge.join(", ")}`);
  if (capturedBuckets.length > 0) {
    facts.push(`Resources already captured — ${capturedBuckets.join("; ")}. Do not ask for these again; ask only about missing buckets.`);
  }

  if (modelSnapshot.implementation.activities.length > 0) {
    facts.push("At least one activity is already captured.");
  }

  if (
    modelSnapshot.outcomes.short_term.length > 0 ||
    modelSnapshot.outcomes.medium_term.length > 0 ||
    modelSnapshot.outcomes.long_term.length > 0
  ) {
    facts.push("At least one outcome is already captured.");
  }

  return facts;
}

function buildMissingFields(modelSnapshot: LogicModel | undefined): string[] {
  if (!modelSnapshot) {
    return ["impact_statement", "population", "geography", "long_term_goal"];
  }

  const impact = modelSnapshot.intended_impact;
  const impactState = deriveImpactFacetState(modelSnapshot);
  const missing: string[] = [];

  if (!impactState.hasImpactDraft) {
    missing.push("impact_statement");
  }
  if (!impactState.populationKnown) {
    missing.push(impactState.hasImpactDraft ? "impact_population_facet" : "population");
  }
  if (!impactState.geographyKnown) {
    missing.push(impactState.hasImpactDraft ? "impact_geography_facet" : "geography");
  }
  if (!impactState.concreteOutcomeKnown) {
    missing.push(impactState.hasImpactDraft ? "impact_outcome_facet" : "long_term_goal");
  }
  if (impactState.needsImpactReview) {
    missing.push("impact_review_confirmation");
  }

  const nextIntent = inferNextRequiredIntent(modelSnapshot);
  switch (nextIntent) {
    case "resources": {
      // Report which specific resource buckets are still missing
      const res = modelSnapshot.implementation.resources;
      const missingBuckets: string[] = [];
      if (!res.human.length) missingBuckets.push("people/roles");
      if (!res.material.length) missingBuckets.push("materials/equipment");
      if (!res.financial.length) missingBuckets.push("funding");
      if (!res.knowledge.length) missingBuckets.push("expertise/training");
      // Only add resources to missing if at least one bucket is still empty
      if (missingBuckets.length > 0) {
        missing.push(`resources (missing: ${missingBuckets.join(", ")})`);
      }
      break;
    }
    case "activities":
      missing.push("activities");
      break;
    case "outputs_metrics":
      missing.push("outputs_metrics");
      break;
    case "quality_evidence":
      missing.push("quality_evidence");
      break;
    case "outcomes_review":
      missing.push("outcomes");
      break;
    default:
      break;
  }

  return [...new Set(missing)];
}

function buildLatestUserSignals(userMessage: string): string[] {
  const summary = buildContextCoverageSummary(userMessage, null);
  const signals: string[] = [];

  if (summary.user.hasPopulationCue) signals.push("latest user message contains a population cue");
  if (summary.user.hasGeographyCue) signals.push("latest user message contains a geography cue");
  if (summary.user.hasResourceCue) signals.push("latest user message contains a resource cue");
  if (summary.user.hasActivityCue) signals.push("latest user message contains an activity cue");
  if (summary.user.hasOutcomeCue) signals.push("latest user message contains an outcome cue");

  return signals;
}

function buildAvoidAskingFor(modelSnapshot: LogicModel | undefined): string[] {
  if (!modelSnapshot) return [];

  const avoid: string[] = [];
  const impact = modelSnapshot.intended_impact;
  const impactState = deriveImpactFacetState(modelSnapshot);

  if (impactState.populationKnown) avoid.push("Do not ask again for the primary population unless the user explicitly revises it.");
  if (impactState.geographyKnown) avoid.push("Do not ask again for geography unless the user explicitly revises it.");
  if (impactState.concreteOutcomeKnown) {
    avoid.push("Do not ask again for the long-term change unless the user explicitly revises it.");
  }

  // Avoid asking for specific resource buckets that are already captured
  const res = modelSnapshot.implementation.resources;
  if (res.human.length > 0) avoid.push(`Do not ask again for people/roles — already captured: ${res.human.join(", ")}.`);
  if (res.material.length > 0) avoid.push(`Do not ask again for materials — already captured: ${res.material.join(", ")}.`);
  if (res.financial.length > 0) avoid.push(`Do not ask again for funding — already captured: ${res.financial.join(", ")}.`);
  if (res.knowledge.length > 0) avoid.push(`Do not ask again for expertise — already captured: ${res.knowledge.join(", ")}.`);

  return avoid;
}

export function buildAgentTurnBrief(input: {
  userMessage: string;
  history: ChatMessage[];
  modelSnapshot?: LogicModel;
}): AgentTurnBrief {
  const nextIntent = inferNextRequiredIntent(input.modelSnapshot);

  return {
    currentPhase: nextIntent ?? (input.modelSnapshot ? "complete" : "unknown"),
    lastAssistantQuestion: getLastAssistantQuestion(input.history),
    confirmedFacts: buildConfirmedFacts(input.modelSnapshot),
    missingFields: buildMissingFields(input.modelSnapshot),
    latestUserSignals: buildLatestUserSignals(input.userMessage),
    avoidAskingFor: buildAvoidAskingFor(input.modelSnapshot),
  };
}

export function formatAgentTurnBrief(brief: AgentTurnBrief): string {
  return JSON.stringify(
    {
      current_phase: brief.currentPhase,
      last_assistant_question: brief.lastAssistantQuestion,
      confirmed_facts: brief.confirmedFacts,
      missing_fields: brief.missingFields,
      latest_user_signals: brief.latestUserSignals,
      avoid_asking_for: brief.avoidAskingFor,
    },
    null,
    2
  );
}