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

function isBlank(value: string | undefined): boolean {
  return (value ?? "").trim().length === 0;
}

const REVISION_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "our",
  "the",
  "their",
  "to",
  "we",
  "with",
]);

function normalizeForRevision(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !REVISION_STOP_WORDS.has(token));
}

function isCloseEnoughForRevision(userMessage: string, revisedText: string): boolean {
  const userTokens = normalizeForRevision(userMessage);
  const revisedTokens = normalizeForRevision(revisedText);

  if (userTokens.length === 0 || revisedTokens.length === 0) return false;
  if (revisedText.trim().length < 12) return false;

  const userTokenSet = new Set(userTokens);
  const revisedTokenSet = new Set(revisedTokens);
  let sharedTokens = 0;
  for (const token of userTokenSet) {
    if (revisedTokenSet.has(token)) {
      sharedTokens += 1;
    }
  }

  const sharedCoverage = sharedTokens / Math.max(1, userTokenSet.size);
  const novelCoverage = [...revisedTokenSet].filter((token) => !userTokenSet.has(token)).length /
    Math.max(1, revisedTokenSet.size);
  const lengthRatio = revisedText.trim().length / Math.max(1, userMessage.trim().length);

  return sharedTokens >= 2 && sharedCoverage >= 0.3 && novelCoverage <= 0.75 && lengthRatio >= 0.45 && lengthRatio <= 3;
}

function phaseRank(intent: string | undefined): number {
  switch (intent) {
    case "impact_statement":
      return 1;
    case "impact_population_facet":
    case "population_focus":
      return 1;
    case "impact_geography_facet":
    case "geography":
      return 2;
    case "impact_outcome_facet":
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

    // Only block a blank overwrite of a confirmed population; allow refinements/expansions through.
    if (
      isBlank(impactPatch.population) &&
      looksSpecificPopulation(snapshotImpact.population)
    ) {
      delete impactPatch.population;
      contradictionFlags.add("known_fact_overwrite");
    }

    if (
      impactPatch.population?.trim() &&
      looksSpecificPopulation(snapshotImpact.population) &&
      !looksSpecificPopulation(impactPatch.population)
    ) {
      delete impactPatch.population;
      contradictionFlags.add("known_fact_overwrite");
    }

    if (
      impactPatch.population?.trim() &&
      looksSpecificPopulation(snapshotImpact.population) &&
      !input.turnBrief.missingFields.includes("population") &&
      !input.turnBrief.missingFields.includes("impact_population_facet") &&
      hasConcreteImpactMarker(impactPatch.population)
    ) {
      delete impactPatch.population;
      contradictionFlags.add("known_fact_overwrite");
    }

    // Only block a blank overwrite of a confirmed geography; allow refinements through.
    if (
      isBlank(impactPatch.geography) &&
      looksSpecificGeography(snapshotImpact.geography)
    ) {
      delete impactPatch.geography;
      contradictionFlags.add("known_fact_overwrite");
    }

    // Only block a blank overwrite of a confirmed long-term goal; allow refinements through.
    if (
      isBlank(impactPatch.long_term_goal) &&
      hasConcreteImpactMarker(snapshotImpact.long_term_goal || snapshotImpact.compiled_statement)
    ) {
      delete impactPatch.long_term_goal;
      contradictionFlags.add("known_fact_overwrite");
    }

    if (Object.keys(impactPatch).length === 0) {
      delete sanitizedPatch.intended_impact;
    }
  }

  const questionPlan = result.questionPlan ? structuredClone(result.questionPlan) : undefined;
  const revisionProposal = result.revisionProposal ? structuredClone(result.revisionProposal) : undefined;

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

  let sanitizedRevisionProposal = revisionProposal;
  if (sanitizedRevisionProposal?.revisedText) {
    if (!isCloseEnoughForRevision(message, sanitizedRevisionProposal.revisedText)) {
      sanitizedRevisionProposal = undefined;
      contradictionFlags.add("unsupported_patch");
    } else {
      sanitizedRevisionProposal.shouldRevise = sanitizedRevisionProposal.shouldRevise ?? true;
      sanitizedRevisionProposal.originalText = sanitizedRevisionProposal.originalText ?? message.trim();
    }
  } else if (sanitizedRevisionProposal) {
    sanitizedRevisionProposal = undefined;
    contradictionFlags.add("unsupported_patch");
  }

  if (questionPlan) {
    questionPlan.shouldAsk = questionIntent !== "none";
    if (questionIntent === "none") {
      questionPlan.targetField = "none";
      delete questionPlan.draftQuestion;
    }
  }

  return {
    ...result,
    questionIntent,
    modelPatch: sanitizedPatch && Object.keys(sanitizedPatch).length > 0 ? sanitizedPatch : null,
    questionPlan,
    revisionProposal: sanitizedRevisionProposal,
    contradictionFlags: [...contradictionFlags],
    stateAssessment,
  };
}