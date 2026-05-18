import type { AgentSkill, SkillContext, SkillResult } from "@/lib/agent/skills";
import type { LogicModel } from "@/store/useLogicModelStore";

/**
 * Quality assessment for a component
 */
interface ComponentQualityAssessment {
  score: number; // 0-100
  rating: "poor" | "fair" | "good";
  feedback: string;
  suggestions: string[];
  commonMistakes: string[];
}

/**
 * Scores population specificity (0-100)
 */
function validatePopulationQuality(text: string): ComponentQualityAssessment {
  if (!text.trim()) {
    return {
      score: 0,
      rating: "poor",
      feedback: "Population is empty.",
      suggestions: [
        "Specify who you serve: grade level, age range, or demographic group",
        "Include qualifiers: low-income, first-generation, justice-involved, etc.",
      ],
      commonMistakes: ["Generic 'students' without specificity", "Outcome language in population"],
    };
  }

  let score = 0;
  const suggestions: string[] = [];
  const commonMistakes: string[] = [];

  const wordCount = text.split(/\s+/).length;
  const hasGradeOrAge =
    /\b(k\s*[-–]\s*\d+|grade|year|age|elementary|middle|high school|kindergarten|preschool)\b/i.test(
      text
    );
  const hasQualifier =
    /\b(low[-\s]?income|first[-\s]?generation|justice|homeless|unhoused|immigrant|refugee|veteran|english\s+learner|foster|parenting|disabilities?)\b/i.test(
      text
    );
  const isGeneric = /^(people|students|youth|community|everyone|anyone|participants|clients)$/i.test(
    text.trim()
  );

  if (isGeneric) {
    score = 20;
    suggestions.push("Add demographic specificity: grade, age, or named group");
  } else if (hasGradeOrAge && hasQualifier) {
    score = 90;
  } else if (hasGradeOrAge || hasQualifier) {
    score = 60;
    if (!hasGradeOrAge) suggestions.push("Specify grade level or age range");
    if (!hasQualifier) suggestions.push("Add demographic qualifiers for clarity");
  } else if (wordCount >= 4) {
    score = 70;
    suggestions.push("Consider adding grade level or demographic qualifiers for clarity");
  } else {
    score = 40;
    suggestions.push("Expand with demographic details and qualifiers");
  }

  return {
    score,
    rating: score >= 80 ? "good" : score >= 50 ? "fair" : "poor",
    feedback:
      score >= 80
        ? "Population is specific and well-defined."
        : score >= 50
          ? "Population has some specificity but could be more detailed."
          : "Population is too generic and needs more specificity.",
    suggestions,
    commonMistakes: ["Generic 'students' without specificity"],
  };
}

/**
 * Scores geography specificity (0-100)
 */
function validateGeographyQuality(text: string): ComponentQualityAssessment {
  if (!text.trim()) {
    return {
      score: 0,
      rating: "poor",
      feedback: "Geography is empty.",
      suggestions: [
        "Specify a neighborhood, school, ZIP code, or district",
        "Use place names that are observable and verifiable",
      ],
      commonMistakes: [
        "Vague references like 'area', 'region', or 'our community'",
        "Unbounded 'citywide' without naming the city",
      ],
    };
  }

  let score = 0;
  const suggestions: string[] = [];

  const hasPlaceName = /\b(philadelphia|kensington|fishtown|germantown|center\s+city|west\s+philly)\b/i.test(
    text
  );
  const hasZip = /\d{5}(?:-\d{4})?/.test(text);
  const hasSchoolName =
    /\b(?:[a-z][\w'&.-]*\s+){1,2}(?:elementary|middle|high)\s+school\b/i.test(
      text
    );
  const hasDistrict = /\bdistrict|school\s+district\b/i.test(text);
  const isVague = /\b(area|region|our community|zone|everywhere)\b/i.test(text);

  if (hasPlaceName || hasZip || hasSchoolName) {
    score = 85;
  } else if (hasDistrict) {
    score = 70;
    suggestions.push("Consider adding a specific neighborhood or school name");
  } else if (isVague) {
    score = 20;
    suggestions.push("Replace vague references with specific place names, ZIP codes, or schools");
  } else if (text.length > 20) {
    score = 60;
    suggestions.push("Use recognizable place names or geographic markers");
  } else {
    score = 40;
    suggestions.push("Specify a neighborhood, district, or school");
  }

  return {
    score,
    rating: score >= 80 ? "good" : score >= 50 ? "fair" : "poor",
    feedback:
      score >= 80
        ? "Geography is specific and well-bounded."
        : score >= 50
          ? "Geography is somewhat clear but could be more specific."
          : "Geography is too vague and needs concrete place names.",
    suggestions,
    commonMistakes: [
      "Vague references like 'area', 'region', or 'our community'",
      "'Citywide' without naming the city",
    ],
  };
}

/**
 * Scores activities quality (0-100)
 */
function validateActivitiesQuality(text: string): ComponentQualityAssessment {
  if (!text.trim()) {
    return {
      score: 0,
      rating: "poor",
      feedback: "Activities are empty.",
      suggestions: [
        "Describe what your program does: specific processes, events, or actions",
        "Use action verbs: deliver, conduct, facilitate, provide, etc.",
      ],
      commonMistakes: ["Aspirational language like 'improved instruction'", "Listing every task instead of core strategies"],
    };
  }

  let score = 50;
  const suggestions: string[] = [];
  const commonMistakes: string[] = [];

  // Check for action verbs
  const hasActionVerb =
    /\b(deliver|conduct|provide|facilitate|teach|mentor|coach|train|support|guide|lead|implement|run|offer|organize)\b/i.test(
      text
    );
  if (hasActionVerb) {
    score += 20;
  } else {
    suggestions.push("Use action verbs: deliver, conduct, provide, facilitate, teach, mentor, etc.");
  }

  // Check for specificity (numbers, timeframes, methods)
  const hasSpecifics =
    /\b\d+\s+(hours?|days?|weeks?|sessions?|groups?|students?|people)\b|\b(weekly|monthly|daily|twice.*week)\b/i.test(
      text
    );
  if (hasSpecifics) {
    score += 20;
  } else {
    suggestions.push("Add specifics: frequency (weekly), duration (90 minutes), group size (5-8 students), etc.");
  }

  // Check for outcome language (common mistake)
  if (/\b(increase|improve|reduce|enhance|achievement|success|outcome)\b/i.test(text)) {
    commonMistakes.push("Sounds like an outcome, not an activity. Use action verbs for what you DO.");
    score = Math.max(0, score - 15);
  }

  // Check for resource language
  if (/\b(staff|budget|materials?|training|curriculum)\b/i.test(text)) {
    score += 10; // Mention of resources shows implementation thinking
  }

  return {
    score: Math.min(100, score),
    rating: score >= 80 ? "good" : score >= 50 ? "fair" : "poor",
    feedback:
      score >= 80
        ? "Activities are well-defined with clear actions and specifics."
        : score >= 50
          ? "Activities are described but could be more specific about delivery method and frequency."
          : "Activities need clearer action verbs and implementation details.",
    suggestions,
    commonMistakes,
  };
}

function summarizeActivities(activities: LogicModel["implementation"]["activities"]): string {
  return activities
    .map((activity) => {
      const outputs = activity.outputs.map((output) => output.text).join(" ");
      return [activity.item, ...activity.actions, outputs].filter(Boolean).join(" ");
    })
    .join(" ");
}

/**
 * Scores outcomes quality (0-100)
 */
function validateOutcomesQuality(text: string): ComponentQualityAssessment {
  if (!text.trim()) {
    return {
      score: 0,
      rating: "poor",
      feedback: "Outcomes are empty.",
      suggestions: [
        "Describe changes in knowledge, skills, behaviors, or status",
        "Use outcome language: increase, improve, develop, achieve, etc.",
      ],
      commonMistakes: [
        "Outcomes = activities ('receive tutoring')",
        "Outcomes = outputs ('participate in 10 sessions')",
      ],
    };
  }

  let score = 50;
  const suggestions: string[] = [];
  const commonMistakes: string[] = [];

  // Check for change language
  const hasChangeLanguage =
    /\b(increase|improve|develop|achieve|demonstrate|attain|reach|gain|build|strengthen)\b/i.test(
      text
    );
  if (hasChangeLanguage) {
    score += 20;
  } else {
    suggestions.push("Use outcome language: increase, improve, develop, achieve, demonstrate, etc.");
  }

  // Check for measurability indicators
  const hasMeasurability = /\b(from|to|%|percentage|level|score|grade|proficiency)\b/i.test(text);
  if (hasMeasurability) {
    score += 15;
  } else {
    suggestions.push("Include measurable indicators: specific percentages, levels, or benchmarks");
  }

  // Check for activity language (common mistake)
  if (/\b(receive|participate|attend|enroll|register|take|enrolled in)\b/i.test(text)) {
    commonMistakes.push("This sounds like participation (activity/output), not an outcome (change).");
    score = Math.max(0, score - 20);
  }

  // Check for status/condition change language
  if (/\b(graduate|enroll|employed|employment|housing|arrest|justice|health)\b/i.test(text)) {
    score += 10; // Concrete, meaningful outcome
  }

  return {
    score: Math.min(100, score),
    rating: score >= 80 ? "good" : score >= 50 ? "fair" : "poor",
    feedback:
      score >= 80
        ? "Outcomes are clear, measurable, and show meaningful change."
        : score >= 50
          ? "Outcomes describe change but could be more specific about measurement."
          : "Outcomes are unclear or confuse activities/outputs with actual changes.",
    suggestions,
    commonMistakes,
  };
}

/**
 * Component Quality Validator Skill
 * Validates logic model components against domain-specific quality criteria
 */
export const componentQualityValidatorSkill: AgentSkill = {
  metadata: {
    name: "component-quality-validator",
    description:
      "Validates each logic model component against domain-specific quality criteria. Provides targeted improvement feedback and quality scores. Use when evaluating specificity, clarity, and framework alignment of logic model components.",
    license: "Apache-2.0",
    compatibility: "Requires TypeScript/Node.js environment",
    metadata: {
      version: "1.0",
      author: "LM Chatbot",
      phase: "1",
    },
  },
  instructions: `See SKILL.md for quality criteria by component type.`,
  execute: async (context: SkillContext): Promise<SkillResult> => {
    try {
      const impact = context.modelSnapshot?.intended_impact;
      const impl = context.modelSnapshot?.implementation;
      const outcomes = context.modelSnapshot?.outcomes;

      const assessments: Record<string, ComponentQualityAssessment> = {};

      if (impact?.population) {
        assessments.population = validatePopulationQuality(impact.population);
      }
      if (impact?.geography) {
        assessments.geography = validateGeographyQuality(impact.geography);
      }
      if (impl?.activities) {
        assessments.activities = validateActivitiesQuality(summarizeActivities(impl.activities));
      }
      if (outcomes?.short_term || outcomes?.medium_term || outcomes?.long_term) {
        assessments.outcomes = validateOutcomesQuality(
          [outcomes?.short_term, outcomes?.medium_term, outcomes?.long_term]
            .filter(Boolean)
            .join(" ")
        );
      }

      // Calculate overall quality score
      const scores = Object.values(assessments).map((a) => a.score);
      const overallScore =
        scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

      // Collect all suggestions and common mistakes
      const allSuggestions = Object.values(assessments).flatMap((a) => a.suggestions);
      const allMistakes = Object.values(assessments).flatMap((a) => a.commonMistakes);

      return {
        success: true,
        message: `Component quality assessment complete. Overall score: ${overallScore}/100.`,
        data: {
          assessments,
          overallScore,
          topPrioritySuggestions: allSuggestions.slice(0, 3),
          potentialMistakes: allMistakes,
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
