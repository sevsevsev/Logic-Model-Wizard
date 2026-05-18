import type { LogicModel } from "@/store/useLogicModelStore";
import type { SectionState, LogicModelState, SectionSufficiency, Provenance } from "@/lib/agent/logicModelSectionState";
import type { GuardrailIntent } from "@/lib/chat/guardrails";
import { looksSpecificGeography, looksSpecificPopulation } from "@/lib/chat/guardrails";
import { classifyIntakeSignals } from "@/lib/chat/intakeSignals";

// KnowledgePatch now supports both legacy and section-state logic model
type KnowledgePatch = Partial<LogicModel> | Partial<LogicModelState> | null;

function isLegacyPatch(patch: KnowledgePatch): patch is Partial<LogicModel> {
  return Boolean(
    patch &&
      ("intended_impact" in patch || "implementation" in patch || "outcomes" in patch)
  );
}

function hasSectionValue(section?: SectionState<unknown>): boolean {
  const value = section?.value;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return false;
}
// Helper: get sufficiency state for a section (returns 'empty' if not present)
export function getSectionSufficiency(section?: SectionState): SectionSufficiency {
  return section?.sufficiency ?? 'empty';
}

// Helper: get provenance for a section
export function getSectionProvenance(section?: SectionState): Provenance | undefined {
  return section?.provenance;
}

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

  const intake = classifyIntakeSignals(normalized);
  const hasResourceCue =
    /\b(staff|volunteers?|partners?|funding|budget|grant|technology|curriculum|space|expertise|inputs?)\b/i.test(
      normalized
    );
  const hasActivityCue = intake.isBroadProgramFrame ? false : intake.hasGenericActivityCue || intake.hasSpecificActivityCue;
  const hasOutcomeCue = intake.hasOutcomeCue;

  return {
    hasPopulationCue: looksSpecificPopulation(normalized),
    hasGeographyCue: looksSpecificGeography(normalized),
    hasResourceCue,
    hasActivityCue,
    hasOutcomeCue,
  };
}

function detectSignalsFromPatch(patch: KnowledgePatch): ContextSignalSummary {
  if (!patch) {
    return {
      hasPopulationCue: false,
      hasGeographyCue: false,
      hasResourceCue: false,
      hasActivityCue: false,
      hasOutcomeCue: false,
    };
  }

  if (!isLegacyPatch(patch)) {
    return {
      hasPopulationCue: hasSectionValue(patch.intendedImpact),
      hasGeographyCue: hasSectionValue(patch.intendedImpact),
      hasResourceCue: hasSectionValue(patch.implementation),
      hasActivityCue: hasSectionValue(patch.implementation),
      hasOutcomeCue: hasSectionValue(patch.outcomes),
    };
  }

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
