import type { LogicModel } from "@/store/useLogicModelStore";
import { buildCompiledStatement, isExplicitImpactAcceptance } from "@/lib/chat/guardrails";

export function applyImpactAcceptanceFromReply(
  modelPatch: Partial<LogicModel> | null,
  modelSnapshot: LogicModel | undefined,
  latestUserMessage: string
): Partial<LogicModel> | null {
  if (!isExplicitImpactAcceptance(latestUserMessage)) {
    return modelPatch;
  }

  const population = modelPatch?.intended_impact?.population ?? modelSnapshot?.intended_impact.population ?? "";
  const geography = modelPatch?.intended_impact?.geography ?? modelSnapshot?.intended_impact.geography ?? "";
  const longTermGoal =
    modelPatch?.intended_impact?.long_term_goal ?? modelSnapshot?.intended_impact.long_term_goal ?? "";

  const compiled = buildCompiledStatement(population, geography, longTermGoal);
  if (!compiled) {
    return modelPatch;
  }

  return {
    ...(modelPatch ?? {}),
    intended_impact: {
      population,
      geography,
      long_term_goal: longTermGoal,
      compiled_statement: compiled,
    },
  };
}
