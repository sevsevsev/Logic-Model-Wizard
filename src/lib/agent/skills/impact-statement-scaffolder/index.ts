import type { AgentSkill, SkillContext, SkillResult } from "@/lib/agent/skills";
import type { LogicModel } from "@/store/useLogicModelStore";

/**
 * Validation results for impact statement components
 */
interface ImpactComponentValidation {
  isPopulationValid: boolean;
  isGeographyValid: boolean;
  isGoalValid: boolean;
  populationFeedback: string;
  geographyFeedback: string;
  goalFeedback: string;
  allValid: boolean;
}

/**
 * Validates if a population is specific enough
 */
function validatePopulation(text: string): { valid: boolean; feedback: string } {
  if (!text.trim()) {
    return { valid: false, feedback: "Population is empty." };
  }

  // Grade / age / developmental stage specificity
  const gradeOrAgeSpecific =
    /\b(k\s*[-–]\s*\d+|\d+(?:st|nd|rd|th)\s+grad(?:e|ers?)?|(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\s+grad(?:e|ers?)?|elementary(?:\s+school)?|middle\s+school|high\s+school|grades?\s+\d|\d+(?:[-–]\d+)?[-\s]year[-\s]olds?|ages?\s+\d|early\s+childhood|preschool|kindergarten)\b/i.test(
      text
    );
  if (gradeOrAgeSpecific) {
    return {
      valid: true,
      feedback: `Population "${text}" has good age/grade specificity.`,
    };
  }

  // Named population groups that are always specific enough on their own
  const namedGroup =
    /\b(veterans?|military\s+(?:families|spouses|members|veterans?)|returning\s+(?:citizens?|veterans?|residents?)|formerly\s+incarcerated|ex[-\s]offenders?|reentry|seniors?|elderly|older\s+adults?|refugees?|asylum\s+seekers?|undocumented\s+(?:immigrants?|residents?)|english\s+language\s+learners?|ELL|ESOL|LGBTQ\+?|BIPOC|people\s+experiencing\s+homelessness|unhoused|adults?\s+in\s+recovery|people\s+in\s+recovery)\b/i.test(
      text
    );
  if (namedGroup) {
    return {
      valid: true,
      feedback: `Population "${text}" includes a specifically named group.`,
    };
  }

  // Population noun + qualifier combinations
  const hasPopulationNoun =
    /\b(students?|youth|young\s+adults?|adults?|children|kids?|teens?|adolescents?|participants?|families|parents?|caregivers?|guardians?|residents?|individuals?|people|clients?|women|men|girls?|boys?|community\s+members?)\b/i.test(
      text
    );
  const hasQualifier =
    /\b(low[-\s]?income|first[-\s]?generation|justice[-\s]?involved|court[-\s]?involved|english\s+learners?|newcomer|immigrant|foster|homeless|unhoused|unemployed|underemployed|pregnant|parenting|teen\s+parents?|disabled?|with\s+disabilit|rural|tribal|at[-\s]?risk|underserved|marginalized|under-resourced|economically\s+disadvantaged|public\s+housing|in\s+recovery|recovering|formerly\s+incarcerated|returning|reentry|vulnerable|high[-\s]?need|special\s+needs?|chronic(?:ally)?\s+absent|dual[-\s]?language|bilingual|minority|under-represented)\b/i.test(
      text
    );
  if (hasPopulationNoun && hasQualifier) {
    return {
      valid: true,
      feedback: `Population "${text}" has demographic specificity (noun + qualifier).`,
    };
  }

  // Fallback: any non-trivial description with 4+ distinct words
  const wordCount = text.trim().split(/\s+/).length;
  const isPlaceholder = /^(people|community|everyone|anyone|participants|clients|users|individuals)$/i.test(
    text.trim()
  );
  if (wordCount >= 4 && !isPlaceholder) {
    return {
      valid: true,
      feedback: `Population "${text}" has sufficient descriptive detail.`,
    };
  }

  return {
    valid: false,
    feedback: `Population "${text}" is too generic. Try specifying: grade/age, demographic group, or qualifiers (e.g., "low-income", "first-generation").`,
  };
}

/**
 * Validates if a geography is specific enough
 */
function validateGeography(text: string): { valid: boolean; feedback: string } {
  if (!text.trim()) {
    return { valid: false, feedback: "Geography is empty." };
  }

  // Common place names
  if (
    /\b(philadelphia|center\s+city|kensington|fishtown|germantown|south\s+philly|north\s+philly|west\s+philly|northeast\s+philadelphia|northwest\s+philadelphia)\b/i.test(
      text
    )
  ) {
    return {
      valid: true,
      feedback: `Geography "${text}" includes a specific place name.`,
    };
  }

  // Administrative / directional geography terms with context
  if (
    /\b(?:north|south|east|west)\s+(?:philadelphia|district|zone|section)\b/i.test(
      text
    )
  ) {
    return {
      valid: true,
      feedback: `Geography "${text}" specifies a district or directional area.`,
    };
  }

  // City/state shorthand
  if (/\b[a-z]+(?:\s+[a-z]+){0,2},\s*[a-z]{2}\b/i.test(text)) {
    return {
      valid: true,
      feedback: `Geography "${text}" includes city/state notation.`,
    };
  }

  // ZIP-code specificity
  if (/\b(?:zip(?:\s+code)?\s*)?\d{5}(?:-\d{4})?\b/.test(text)) {
    return {
      valid: true,
      feedback: `Geography "${text}" includes ZIP code specificity.`,
    };
  }

  // Named schools or institutions
  if (/\b(?:[a-z][\w'&.-]*\s+){1,3}(?:elementary|middle|high)\s+school\b/i.test(text)) {
    return {
      valid: true,
      feedback: `Geography "${text}" specifies a named school.`,
    };
  }

  // Neighborhood or district language
  if (/\b(?:neighborhoods?|district|zone|region|area|quarter|section)\b/i.test(text)) {
    return {
      valid: true,
      feedback: `Geography "${text}" has neighborhood/district specificity.`,
    };
  }

  return {
    valid: false,
    feedback: `Geography "${text}" is too vague. Try specifying: neighborhood name, ZIP code, school district, or named school.`,
  };
}

/**
 * Validates if a long-term goal includes concrete impact markers
 */
function validateLongTermGoal(text: string): { valid: boolean; feedback: string } {
  if (!text.trim()) {
    return { valid: false, feedback: "Long-term goal is empty." };
  }

  const concreteMarkers = /(graduate|graduation|postsecondary|college|credential|employment|job|wage|income|housing|homeless|justice|incarcer|arrest|violence|safety|health|mental health|attendance|absenteeism|reading level|grade level)/i;

  if (concreteMarkers.test(text)) {
    return {
      valid: true,
      feedback: `Long-term goal "${text}" includes a concrete impact marker.`,
    };
  }

  return {
    valid: false,
    feedback: `Long-term goal "${text}" needs a concrete outcome. Use specific markers like: graduation, college enrollment, employment, housing stability, or reduced justice involvement.`,
  };
}

/**
 * Validates all three components of intended impact
 */
export function validateImpactComponents(
  modelSnapshot: LogicModel | undefined
): ImpactComponentValidation {
  const impact = modelSnapshot?.intended_impact;

  const populationValidation = validatePopulation(impact?.population ?? "");
  const geographyValidation = validateGeography(impact?.geography ?? "");
  const goalValidation = validateLongTermGoal(impact?.long_term_goal ?? "");

  return {
    isPopulationValid: populationValidation.valid,
    isGeographyValid: geographyValidation.valid,
    isGoalValid: goalValidation.valid,
    populationFeedback: populationValidation.feedback,
    geographyFeedback: geographyValidation.feedback,
    goalFeedback: goalValidation.feedback,
    allValid:
      populationValidation.valid &&
      geographyValidation.valid &&
      goalValidation.valid,
  };
}

/**
 * Compiles impact statement from validated components
 */
export function compileImpactStatement(
  population: string,
  geography: string,
  longTermGoal: string
): string | null {
  if (!population.trim() || !geography.trim() || !longTermGoal.trim()) {
    return null;
  }
  return `${population.trim()} in ${geography.trim()} will ${longTermGoal.trim()}.`;
}

/**
 * Impact Statement Scaffolder Skill
 * Guides users through structured construction of the intended impact statement
 */
export const impactStatementScaffolderSkill: AgentSkill = {
  metadata: {
    name: "impact-statement-scaffolder",
    description:
      "Guides users through structured construction of the intended impact statement by validating and progressively combining population, geography, and long-term goal components. Use when working on the intended impact section of a logic model.",
    license: "Apache-2.0",
    compatibility: "Requires TypeScript/Node.js environment",
    metadata: {
      version: "1.0",
      author: "LM Chatbot",
      phase: "1",
    },
  },
  instructions: `See SKILL.md for detailed instructions on population, geography, and long-term goal specificity.`,
  execute: async (context: SkillContext): Promise<SkillResult> => {
    try {
      const validation = validateImpactComponents(context.modelSnapshot);

      if (validation.allValid) {
        // All components are valid; can compile
        const compiled = compileImpactStatement(
          context.modelSnapshot?.intended_impact?.population ?? "",
          context.modelSnapshot?.intended_impact?.geography ?? "",
          context.modelSnapshot?.intended_impact?.long_term_goal ?? ""
        );

        return {
          success: true,
          message: "All impact components are valid and specific.",
          data: {
            validation,
            compiledStatement: compiled,
          },
          shouldProceed: true,
          nextAction: "continue",
        };
      }

      // Some components are invalid; provide targeted feedback
      const feedback: string[] = [];
      if (!validation.isPopulationValid) {
        feedback.push(`📍 Population: ${validation.populationFeedback}`);
      }
      if (!validation.isGeographyValid) {
        feedback.push(`🗺️ Geography: ${validation.geographyFeedback}`);
      }
      if (!validation.isGoalValid) {
        feedback.push(`🎯 Long-term Goal: ${validation.goalFeedback}`);
      }

      return {
        success: true,
        message: "Impact statement needs refinement. " + feedback.join(" "),
        data: {
          validation,
          nextComponentToRefine: !validation.isPopulationValid
            ? "population"
            : !validation.isGeographyValid
              ? "geography"
              : "long_term_goal",
        },
        shouldProceed: false,
        nextAction: "validate",
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
