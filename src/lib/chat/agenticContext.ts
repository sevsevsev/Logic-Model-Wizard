import type { LogicModel } from "@/store/useLogicModelStore";
import type { GuardrailIntent } from "@/lib/chat/guardrails";
import { looksSpecificGeography, looksSpecificPopulation } from "@/lib/chat/guardrails";

type KnowledgePatch = Partial<LogicModel> | null;

export interface ContextSignalSummary {
  hasPopulationCue: boolean;
  hasGeographyCue: boolean;
  hasResourceCue: boolean;
  hasActivityCue: boolean;
  hasOutcomeCue: boolean;
}

export interface ContextCoverageSummary {
  user: ContextSignalSummary;
  patch: ContextSignalSummary;
  missingCaptures: string[];
}

function detectSignalsFromText(text: string): ContextSignalSummary {
  const normalized = text.trim();
  if (!normalized) {
    return {
      hasPopulationCue: false,
      hasGeographyCue: false,
      hasResourceCue: false,
      hasActivityCue: false,
      hasOutcomeCue: false,
    };
  }

  const hasResourceCue =
    /\b(staff|volunteers?|partners?|funding|budget|grant|technology|curriculum|space|expertise|inputs?)\b/i.test(
      normalized
    );
  const hasActivityCue =
    /\b(provide|deliver|facilitate|mentor|tutor|train|coach|run|conduct|hold|offer)\b/i.test(normalized);
  const hasOutcomeCue =
    /\b(graduate|employment|job|wage|income|housing|health|attendance|reading|justice|safety|improve|increase|reduce)\b/i.test(
      normalized
    );

  return {
    hasPopulationCue: looksSpecificPopulation(normalized),
    hasGeographyCue: looksSpecificGeography(normalized),
    hasResourceCue,
    hasActivityCue,
    hasOutcomeCue,
  };
}

function detectSignalsFromPatch(patch: KnowledgePatch): ContextSignalSummary {
  const impact = patch?.intended_impact;
  const activities = patch?.implementation?.activities ?? [];
  const resources = patch?.implementation?.resources;
  const outcomes = patch?.outcomes;

  const hasResourceCue = Boolean(
    resources &&
      ((resources.human?.length ?? 0) > 0 ||
        (resources.material?.length ?? 0) > 0 ||
        (resources.financial?.length ?? 0) > 0 ||
        (resources.knowledge?.length ?? 0) > 0)
  );

  const hasOutcomeCue = Boolean(
    (outcomes?.short_term?.length ?? 0) > 0 ||
      (outcomes?.medium_term?.length ?? 0) > 0 ||
      (outcomes?.long_term?.length ?? 0) > 0 ||
      (impact?.long_term_goal?.trim().length ?? 0) > 0
  );

  return {
    hasPopulationCue: Boolean(impact?.population && looksSpecificPopulation(impact.population)),
    hasGeographyCue: Boolean(impact?.geography && looksSpecificGeography(impact.geography)),
    hasResourceCue,
    hasActivityCue: activities.length > 0,
    hasOutcomeCue,
  };
}

export function buildContextCoverageSummary(userMessage: string, patch: KnowledgePatch): ContextCoverageSummary {
  const user = detectSignalsFromText(userMessage);
  const patchSignals = detectSignalsFromPatch(patch);

  const missingCaptures: string[] = [];
  if (user.hasPopulationCue && !patchSignals.hasPopulationCue) missingCaptures.push("population");
  if (user.hasGeographyCue && !patchSignals.hasGeographyCue) missingCaptures.push("geography");
  if (user.hasResourceCue && !patchSignals.hasResourceCue) missingCaptures.push("resources");
  if (user.hasActivityCue && !patchSignals.hasActivityCue) missingCaptures.push("activities");
  if (user.hasOutcomeCue && !patchSignals.hasOutcomeCue) missingCaptures.push("outcomes");

  return {
    user,
    patch: patchSignals,
    missingCaptures,
  };
}

export function assertIntentWithLatestUserEvidence(
  inferredIntent: GuardrailIntent | undefined,
  latestUserMessage: string,
  mergedModel: LogicModel | undefined
): GuardrailIntent | undefined {
  if (!inferredIntent) return undefined;

  if (inferredIntent === "population_focus" && looksSpecificPopulation(latestUserMessage)) {
    const knownGeography = looksSpecificGeography(mergedModel?.intended_impact.geography ?? latestUserMessage);
    return knownGeography ? "impact_specificity" : "geography";
  }

  if (inferredIntent === "geography" && looksSpecificGeography(latestUserMessage)) {
    return "impact_specificity";
  }

  return inferredIntent;
}
