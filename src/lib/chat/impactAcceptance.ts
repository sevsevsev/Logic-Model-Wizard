import type { LogicModel } from "@/store/useLogicModelStore";
import { buildCompiledStatement, isExplicitImpactAcceptance } from "@/lib/chat/guardrails";

interface CompiledStatementPolicyOptions {
  synthesizeWhenComplete?: boolean;
}

function mergeImpactSnapshot(
  modelSnapshot: LogicModel | undefined,
  modelPatch: Partial<LogicModel> | null
): LogicModel["intended_impact"] {
  return {
    population: modelPatch?.intended_impact?.population ?? modelSnapshot?.intended_impact.population ?? "",
    geography: modelPatch?.intended_impact?.geography ?? modelSnapshot?.intended_impact.geography ?? "",
    long_term_goal:
      modelPatch?.intended_impact?.long_term_goal ?? modelSnapshot?.intended_impact.long_term_goal ?? "",
    compiled_statement:
      modelPatch?.intended_impact?.compiled_statement ?? modelSnapshot?.intended_impact.compiled_statement ?? "",
  };
}

export function applyCompiledStatementPolicy(
  modelPatch: Partial<LogicModel> | null,
  modelSnapshot: LogicModel | undefined,
  latestUserMessage: string,
  options?: CompiledStatementPolicyOptions
): Partial<LogicModel> | null {
  const synthesizeWhenComplete = options?.synthesizeWhenComplete ?? false;
  let nextPatch = modelPatch ? structuredClone(modelPatch) : null;

  if (nextPatch?.intended_impact) {
    const accepted = isExplicitImpactAcceptance(latestUserMessage);
    if (!accepted) {
      if ("compiled_statement" in nextPatch.intended_impact) {
        nextPatch.intended_impact.compiled_statement = "";
      }
      if (Object.keys(nextPatch.intended_impact).length === 0) {
        delete nextPatch.intended_impact;
      }
    } else if (!nextPatch.intended_impact.compiled_statement?.trim()) {
      const mergedImpact = mergeImpactSnapshot(modelSnapshot, nextPatch);
      const compiled = buildCompiledStatement(
        mergedImpact.population,
        mergedImpact.geography,
        mergedImpact.long_term_goal
      );
      if (compiled) {
        nextPatch.intended_impact.compiled_statement = compiled;
      }
    }
  }

  if (synthesizeWhenComplete) {
    const mergedImpact = mergeImpactSnapshot(modelSnapshot, nextPatch);
    if (
      mergedImpact.population.trim() &&
      mergedImpact.geography.trim() &&
      mergedImpact.long_term_goal.trim() &&
      !mergedImpact.compiled_statement.trim()
    ) {
      const compiled = buildCompiledStatement(
        mergedImpact.population,
        mergedImpact.geography,
        mergedImpact.long_term_goal
      );
      if (compiled) {
        nextPatch = {
          ...(nextPatch ?? {}),
          intended_impact: {
            ...(nextPatch?.intended_impact ?? {}),
            compiled_statement: compiled,
          },
        };
      }
    }
  }

  return nextPatch;
}

export function applyImpactAcceptanceFromReply(
  modelPatch: Partial<LogicModel> | null,
  modelSnapshot: LogicModel | undefined,
  latestUserMessage: string
): Partial<LogicModel> | null {
  if (!isExplicitImpactAcceptance(latestUserMessage)) {
    return modelPatch;
  }

  return applyCompiledStatementPolicy(modelPatch, modelSnapshot, latestUserMessage, {
    synthesizeWhenComplete: true,
  });
}
