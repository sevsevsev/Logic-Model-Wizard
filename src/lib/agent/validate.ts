import type { LogicModel } from "@/store/useLogicModelStore";
import {
  hasConcreteImpactMarker,
  looksSpecificGeography,
  looksSpecificPopulation,
} from "@/lib/chat/guardrails";
import type {
  AgentContradictionFlag,
  AgentTurnResult,
} from "@/lib/agent/types";
import type { AgentTurnBrief } from "@/lib/agent/turnBrief";

function sameNormalized(a: string | undefined, b: string | undefined): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

function phaseRank(intent: string | undefined): number {
  switch (intent) {
    case "population_focus":
      return 1;
    case "geography":
      return 2;
    case "impact_specificity":
      return 3;
    case "impact_review":
      return 4;
    case "resources":
      return 5;
    case "activities":
      return 6;
    case "outputs_metrics":
      return 7;
    case "quality_evidence":
      return 8;
    case "outcomes_review":
      return 9;
    case "section_refine":
      return 10;
    default:
      return 0;
  }
}

export function sanitizeAgentTurnResult(
  result: AgentTurnResult,
  input: {
    modelSnapshot?: LogicModel;
    userMessage: string;
    turnBrief: AgentTurnBrief;
  }
): AgentTurnResult {
  const contradictionFlags = new Set<AgentContradictionFlag>(result.contradictionFlags ?? []);
  const snapshot = input.modelSnapshot;
  const sanitizedPatch = result.modelPatch ? structuredClone(result.modelPatch) : null;
  const message = input.userMessage;

  if (snapshot && sanitizedPatch?.intended_impact) {
    const impactPatch = sanitizedPatch.intended_impact as Partial<LogicModel["intended_impact"]>;
    const snapshotImpact = snapshot.intended_impact;

    if (
      impactPatch.population &&
      looksSpecificPopulation(snapshotImpact.population) &&
      !sameNormalized(impactPatch.population, snapshotImpact.population) &&
      !looksSpecificPopulation(message)
    ) {
      delete impactPatch.population;
      contradictionFlags.add("known_fact_overwrite");
    }

    if (
      impactPatch.geography &&
      looksSpecificGeography(snapshotImpact.geography) &&
      !sameNormalized(impactPatch.geography, snapshotImpact.geography) &&
      !looksSpecificGeography(message)
    ) {
      delete impactPatch.geography;
      contradictionFlags.add("known_fact_overwrite");
    }

    if (
      impactPatch.long_term_goal &&
      hasConcreteImpactMarker(snapshotImpact.long_term_goal || snapshotImpact.compiled_statement) &&
      !sameNormalized(impactPatch.long_term_goal, snapshotImpact.long_term_goal) &&
      !hasConcreteImpactMarker(message)
    ) {
      delete impactPatch.long_term_goal;
      contradictionFlags.add("known_fact_overwrite");
    }

    if (Object.keys(impactPatch).length === 0) {
      delete sanitizedPatch.intended_impact;
    }
  }

  let questionIntent = result.questionIntent;
  if (snapshot) {
    if (questionIntent === "population_focus" && looksSpecificPopulation(snapshot.intended_impact.population)) {
      questionIntent = "none";
      contradictionFlags.add("asks_for_known_information");
    }

    if (questionIntent === "geography" && looksSpecificGeography(snapshot.intended_impact.geography)) {
      questionIntent = "none";
      contradictionFlags.add("asks_for_known_information");
    }

    if (
      questionIntent === "impact_specificity" &&
      hasConcreteImpactMarker(snapshot.intended_impact.long_term_goal || snapshot.intended_impact.compiled_statement) &&
      !input.turnBrief.missingFields.includes("long_term_goal")
    ) {
      questionIntent = "none";
      contradictionFlags.add("asks_for_known_information");
    }
  }

  const currentPhaseRank = phaseRank(input.turnBrief.currentPhase);
  const plannedPhaseRank = phaseRank(questionIntent);
  if (currentPhaseRank > 0 && plannedPhaseRank > 0 && plannedPhaseRank + 1 < currentPhaseRank) {
    contradictionFlags.add("phase_regression");
  }

  const stateAssessment = result.stateAssessment ?? {
    currentPhase: input.turnBrief.currentPhase,
    knownFacts: input.turnBrief.confirmedFacts,
    missingFields: input.turnBrief.missingFields,
  };

  return {
    ...result,
    questionIntent,
    modelPatch: sanitizedPatch && Object.keys(sanitizedPatch).length > 0 ? sanitizedPatch : null,
    contradictionFlags: [...contradictionFlags],
    stateAssessment,
  };
}