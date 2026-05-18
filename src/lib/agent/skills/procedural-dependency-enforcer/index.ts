import type { AgentSkill, SkillContext, SkillResult } from "@/lib/agent/skills";
import type { LogicModel } from "@/store/useLogicModelStore";

/**
 * Model completeness assessment
 */
interface ModelState {
  hasPopulation: boolean;
  hasGeography: boolean;
  hasLongTermGoal: boolean;
  hasResources: boolean;
  hasActivities: boolean;
  hasOutputs: boolean;
  hasShortTermOutcomes: boolean;
  hasMediumTermOutcomes: boolean;
  hasLongTermOutcomes: boolean;
  intendedImpactComplete: boolean;
  implementationComplete: boolean;
  outcomesComplete: boolean;
}

/**
 * Checks if a component has meaningful content
 */
function hasContent(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  return false;
}

/**
 * Assesses the current state of the logic model
 */
function assessModelState(modelSnapshot: LogicModel | undefined): ModelState {
  const impact = modelSnapshot?.intended_impact;
  const impl = modelSnapshot?.implementation;
  const outcomes = modelSnapshot?.outcomes;

  const hasPopulation = hasContent(impact?.population);
  const hasGeography = hasContent(impact?.geography);
  const hasLongTermGoal = hasContent(impact?.long_term_goal);
  const hasResources = hasContent(impl?.resources);
  const hasActivities = hasContent(impl?.activities);
  const hasOutputs = hasContent(impl?.outputs_metrics);
  const hasShortTermOutcomes = hasContent(outcomes?.short_term);
  const hasMediumTermOutcomes = hasContent(outcomes?.medium_term);
  const hasLongTermOutcomes = hasContent(outcomes?.long_term);

  return {
    hasPopulation,
    hasGeography,
    hasLongTermGoal,
    hasResources,
    hasActivities,
    hasOutputs,
    hasShortTermOutcomes,
    hasMediumTermOutcomes,
    hasLongTermOutcomes,
    intendedImpactComplete: hasPopulation && hasGeography && hasLongTermGoal,
    implementationComplete: hasResources && hasActivities && hasOutputs,
    outcomesComplete: hasShortTermOutcomes && hasMediumTermOutcomes && hasLongTermOutcomes,
  };
}

/**
 * Analyzes question intent for procedural dependency relevance
 */
function analyzeIntentForDependency(
  intent: string | undefined,
  modelState: ModelState
): { violates: boolean; violationType: string; reason: string } {
  if (!intent) {
    return { violates: false, violationType: "", reason: "" };
  }

  const intentLower = intent.toLowerCase();

  // Check for activities/resources intent without Intended Impact
  if (
    (intentLower.includes("activities") || intentLower.includes("resources")) &&
    !modelState.intendedImpactComplete
  ) {
    return {
      violates: true,
      violationType: "activities_before_impact",
      reason: `Cannot define ${intentLower.includes("activities") ? "activities" : "resources"} without first establishing who you serve (population), where (geography), and long-term goal.`,
    };
  }

  // Check for outcomes intent without Implementation
  if (
    intentLower.includes("outcomes") &&
    !modelState.implementationComplete
  ) {
    return {
      violates: true,
      violationType: "outcomes_before_implementation",
      reason: "Cannot define realistic outcomes without first establishing activities and outputs.",
    };
  }

  // Check for outputs intent without Activities
  if (
    intentLower.includes("outputs") &&
    !modelState.hasActivities
  ) {
    return {
      violates: true,
      violationType: "outputs_before_activities",
      reason: "Outputs are the direct products of activities. Define activities first.",
    };
  }

  return { violates: false, violationType: "", reason: "" };
}

/**
 * Suggests the next logical step based on model state
 */
function suggestNextStep(modelState: ModelState): string {
  if (!modelState.intendedImpactComplete) {
    const missing: string[] = [];
    if (!modelState.hasPopulation) missing.push("population");
    if (!modelState.hasGeography) missing.push("geography");
    if (!modelState.hasLongTermGoal) missing.push("long-term goal");
    return `Start with Intended Impact: Define ${missing.join(", ")}.`;
  }

  if (!modelState.hasResources) {
    return "Next: Identify the resources (human, financial, material, knowledge) needed to implement your program.";
  }

  if (!modelState.hasActivities) {
    return "Next: Describe the activities your program will implement with those resources.";
  }

  if (!modelState.hasOutputs) {
    return "Next: Define the direct outputs (number of participants, sessions, materials) of your activities.";
  }

  if (!modelState.outcomesComplete) {
    return "Next: Define short-, medium-, and long-term outcomes that will result from your activities.";
  }

  return "Your logic model is comprehensive. Consider validating it with stakeholders.";
}

/**
 * Procedural Dependency Enforcer Skill
 * Ensures users complete logic model components in logical order
 */
export const proceduralDependencyEnforcerSkill: AgentSkill = {
  metadata: {
    name: "procedural-dependency-enforcer",
    description:
      "Ensures that users complete logic model components in a logical order that respects procedural dependencies. Redirects out-of-sequence requests and suggests the next logical step. Use when users ask about or provide information for components before prerequisites are defined.",
    license: "Apache-2.0",
    compatibility: "Requires TypeScript/Node.js environment",
    metadata: {
      version: "1.0",
      author: "LM Chatbot",
      phase: "1",
    },
  },
  instructions: `See SKILL.md for the procedural dependency chain and rules.`,
  execute: async (context: SkillContext): Promise<SkillResult> => {
    try {
      const modelState = assessModelState(context.modelSnapshot);
      const dependencyAnalysis = analyzeIntentForDependency(
        context.questionIntent,
        modelState
      );

      if (dependencyAnalysis.violates) {
        // Dependency violation detected
        const nextStep = suggestNextStep(modelState);

        return {
          success: true,
          message: `Procedural dependency detected: ${dependencyAnalysis.reason} ${nextStep}`,
          data: {
            violation: dependencyAnalysis.violationType,
            modelState,
            suggestedNextStep: nextStep,
          },
          shouldProceed: false,
          nextAction: "redirect",
        };
      }

      // No violation; proceed normally
      return {
        success: true,
        message: "No procedural dependency violations.",
        data: {
          modelState,
          suggestedNextStep: suggestNextStep(modelState),
        },
        shouldProceed: true,
        nextAction: "continue",
      };
    } catch (error) {
      return {
        success: false,
        message: `Skill execution failed: ${error instanceof Error ? error.message : String(error)}`,
        shouldProceed: true,
        nextAction: "continue",
      };
    }
  },
};
