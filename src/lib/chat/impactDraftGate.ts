import type { LogicModel } from "@/store/useLogicModelStore";

/**
 * When impact drafting is blocked (missing required readiness inputs), keep extracted
 * impact facts (population/geography/long_term_goal) but drop compiled draft text.
 */
export function sanitizeImpactPatchWhenDraftBlocked(
  modelPatch: Partial<LogicModel> | null
): Partial<LogicModel> | null {
  if (!modelPatch?.intended_impact) return modelPatch;

  const { compiled_statement: _omit, ...impact } = modelPatch.intended_impact;

  const hasMeaningfulImpactFields = Object.entries(impact).some(([, value]) =>
    typeof value === "string" ? value.trim().length > 0 : Boolean(value)
  );

  if (!hasMeaningfulImpactFields) {
    const { intended_impact: _omit, ...remainingPatch } = modelPatch;
    return Object.keys(remainingPatch).length > 0 ? remainingPatch : null;
  }

  return {
    ...modelPatch,
    intended_impact: {
      ...impact,
      compiled_statement: "",
    },
  };
}
