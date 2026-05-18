/**
 * Skill-to-Retrieval Signal Mapping
 *
 * Maps skill-identified gaps to targeted retrieval signals, enabling the RAG system
 * to retrieve evidence, examples, and guidance specifically addressing the gap.
 *
 * This module is imported by retrieveKnowledgeWithTrace() to inform query enhancement
 * and metadata-based reranking, creating a closed-loop feedback system where skills
 * drive targeted knowledge retrieval.
 */

import type { SkillAssessmentContext } from "@/lib/rag/retrieval";

export interface RetrievalSignals {
  /** Enhanced query terms combining original query with skill-specific signals */
  retrievalQuery: string;
  /** Canonical domain from ImpactED framework (e.g., "intended_impact", "activities") */
  canonicalDomain: string;
  /** Metadata filters to apply during reranking */
  metadataFilters: Record<string, unknown>;
  /** Whether to prioritize anti-patterns (what NOT to do) */
  includeAntiPatterns?: boolean;
  /** Priority level for this retrieval relative to other signals */
  priority?: "high" | "medium" | "low";
  /** Explanation of why these signals were chosen */
  rationale?: string;
}

/**
 * Maps a specific skill gap to retrieval signals
 *
 * @param skillName - Name of the skill (e.g., "impact-statement-scaffolder")
 * @param gap - The specific gap (e.g., "population_specificity")
 * @returns Retrieval signals for enhanced query building and filtering
 */
export function mapSkillGapToRetrievalSignals(
  skillName: string,
  gap: string
): RetrievalSignals {
  const skillNameLower = skillName.toLowerCase();
  const gapLower = gap.toLowerCase();

  // ========== IMPACT STATEMENT SCAFFOLDER GAPS ==========
  if (skillNameLower.includes("impact")) {
    if (gapLower.includes("population") || gapLower.includes("demographic")) {
      return {
        retrievalQuery:
          "specific population demographics grade level income status ethnicity examples logic model",
        canonicalDomain: "intended_impact",
        metadataFilters: {
          skillName: "impact-statement-scaffolder",
          skillGap: "population_specificity",
          componentFocus: "population",
          type: ["example", "guidance"],
        },
        includeAntiPatterns: true,
        priority: "high",
        rationale:
          "User needs concrete examples of specific populations with demographic qualifiers",
      };
    }

    if (gapLower.includes("geography") || gapLower.includes("location")) {
      return {
        retrievalQuery:
          "specific geography place names neighborhoods zip codes districts schools location examples",
        canonicalDomain: "intended_impact",
        metadataFilters: {
          skillName: "impact-statement-scaffolder",
          skillGap: "geography_specificity",
          componentFocus: "geography",
          type: ["example", "guidance"],
        },
        includeAntiPatterns: true,
        priority: "high",
        rationale: "User needs concrete examples of specific geographic targets",
      };
    }

    if (gapLower.includes("goal") || gapLower.includes("long_term")) {
      return {
        retrievalQuery:
          "concrete long term goal outcome employment graduation housing health measurable markers",
        canonicalDomain: "intended_impact",
        metadataFilters: {
          skillName: "impact-statement-scaffolder",
          skillGap: "goal_concreteness",
          componentFocus: "long_term_goal",
          type: ["example", "guidance"],
        },
        includeAntiPatterns: true,
        priority: "high",
        rationale: "User needs examples of concrete goals with measurable markers",
      };
    }
  }

  // ========== PROCEDURAL DEPENDENCY ENFORCER GAPS ==========
  if (skillNameLower.includes("dependency") || skillNameLower.includes("enforcer")) {
    if (gapLower.includes("no_impact") || gapLower.includes("impact_required")) {
      return {
        retrievalQuery:
          "intended impact is foundation prerequisite first step before resources activities outcomes",
        canonicalDomain: "intended_impact",
        metadataFilters: {
          skillName: "procedural-dependency-enforcer",
          skillGap: "impact_required",
          type: ["guidance"],
        },
        priority: "high",
        rationale: "User tried to define downstream components without intended impact first",
      };
    }

    if (
      gapLower.includes("activity_before_impact") ||
      gapLower.includes("activities_require_impact")
    ) {
      return {
        retrievalQuery:
          "activities implementation flows from intended impact resources support activities deliver outcomes",
        canonicalDomain: "intended_impact",
        metadataFilters: {
          skillName: "procedural-dependency-enforcer",
          skillGap: "sequence_violation",
          type: ["guidance"],
        },
        priority: "high",
        rationale: "User is out of sequence; activities depend on impact+resources",
      };
    }

    if (gapLower.includes("outcome_before_activity") || gapLower.includes("sequence")) {
      return {
        retrievalQuery:
          "procedural order impact resources activities outputs outcomes sequence logic model chain",
        canonicalDomain: "intended_impact",
        metadataFilters: {
          skillName: "procedural-dependency-enforcer",
          skillGap: "procedural_ordering",
          type: ["guidance"],
        },
        priority: "high",
        rationale:
          "User needs guidance on correct component sequencing and procedural dependencies",
      };
    }
  }

  // ========== COMPONENT QUALITY VALIDATOR GAPS ==========
  if (skillNameLower.includes("quality") || skillNameLower.includes("validator")) {
    if (gapLower.includes("population_quality")) {
      return {
        retrievalQuery:
          "population quality criteria specificity demographics markers examples high quality populations",
        canonicalDomain: "intended_impact",
        metadataFilters: {
          skillName: "component-quality-validator",
          skillGap: "population_quality",
          componentFocus: "population",
          type: ["example", "guidance"],
        },
        priority: "medium",
        rationale: "Population component needs quality improvement beyond basic specificity",
      };
    }

    if (gapLower.includes("activity_specificity") || gapLower.includes("activities_quality")) {
      return {
        retrievalQuery:
          "specific activities implementation action verbs concrete strategies delivery methods examples",
        canonicalDomain: "activities",
        metadataFilters: {
          skillName: "component-quality-validator",
          skillGap: "activity_specificity",
          componentFocus: "activities",
          type: ["example", "guidance"],
        },
        priority: "medium",
        rationale: "Activities need more specific action verbs and delivery strategies",
      };
    }

    if (gapLower.includes("outcome_quality")) {
      return {
        retrievalQuery:
          "outcome quality criteria measurable indicators targets progression short medium long term",
        canonicalDomain: "outcomes",
        metadataFilters: {
          skillName: "component-quality-validator",
          skillGap: "outcome_quality",
          componentFocus: "outcomes",
          type: ["example", "guidance"],
        },
        priority: "medium",
        rationale: "Outcomes need measurable indicators and realistic progression pathways",
      };
    }

    if (gapLower.includes("measurement") || gapLower.includes("indicator")) {
      return {
        retrievalQuery:
          "measurable indicators data sources evaluation targets metrics measurement strategy",
        canonicalDomain: "outcomes",
        metadataFilters: {
          skillName: "component-quality-validator",
          skillGap: "measurement",
          type: ["example", "guidance"],
        },
        priority: "medium",
        rationale: "User needs guidance on specifying measurable indicators and data sources",
      };
    }
  }

  // ========== GENERIC/FALLBACK MAPPINGS ==========
  if (gapLower.includes("example")) {
    return {
      retrievalQuery: `${gap} example case study scenario logic model`,
      canonicalDomain: "",
      metadataFilters: {
        type: "example",
      },
      priority: "low",
      rationale: "User is requesting examples to illustrate the gap",
    };
  }

  if (gapLower.includes("anti_pattern") || gapLower.includes("mistake") || gapLower.includes("common_error")) {
    return {
      retrievalQuery: `common mistakes errors to avoid in ${gap}`,
      canonicalDomain: "",
      metadataFilters: {
        type: "anti_pattern",
      },
      includeAntiPatterns: true,
      priority: "medium",
      rationale: "User is learning what NOT to do",
    };
  }

  // Default: generic mapping
  return {
    retrievalQuery: gap,
    canonicalDomain: "",
    metadataFilters: { skillGap: gap },
    priority: "low",
    rationale: "Generic skill gap mapping",
  };
}

/**
 * Maps skill context to a prioritized list of retrieval signals
 *
 * When a skill identifies multiple gaps, this function prioritizes them
 * for targeted retrieval, ensuring the most critical gaps are addressed first.
 *
 * @param skillContext - Complete skill assessment context
 * @returns Array of signals sorted by priority (high → medium → low)
 */
export function mapSkillContextToRetrievalSignals(
  skillContext: SkillAssessmentContext
): RetrievalSignals[] {
  const signals: RetrievalSignals[] = [];

  if (!skillContext.skillName) {
    return signals;
  }

  // Add primary gap
  if (skillContext.gap) {
    signals.push(mapSkillGapToRetrievalSignals(skillContext.skillName, skillContext.gap));
  }

  // Add secondary gaps
  if (skillContext.gaps && skillContext.gaps.length > 0) {
    for (const gap of skillContext.gaps) {
      if (gap !== skillContext.gap) {
        // Don't add primary gap twice
        signals.push(mapSkillGapToRetrievalSignals(skillContext.skillName, gap));
      }
    }
  }

  // Sort by priority (high, medium, low)
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  signals.sort(
    (a, b) =>
      (priorityOrder[a.priority || "low"] ?? 2) - (priorityOrder[b.priority || "low"] ?? 2)
  );

  return signals;
}

/**
 * Builds an enhanced retrieval query from skill context
 *
 * Combines the original user query with skill-specific signals to create
 * a more targeted embedding for vector retrieval.
 *
 * @param baseQuery - Original user query
 * @param skillContext - Skill assessment context
 * @returns Enhanced query string
 */
export function buildSkillInformedQuery(
  baseQuery: string,
  skillContext?: SkillAssessmentContext
): string {
  if (!skillContext || !skillContext.skillName) {
    return baseQuery;
  }

  const signals = mapSkillContextToRetrievalSignals(skillContext);
  if (signals.length === 0) {
    return baseQuery;
  }

  // Combine base query with top signal (highest priority)
  const topSignal = signals[0];
  return `${baseQuery} ${topSignal.retrievalQuery}`.trim();
}

/**
 * Example: Maps skill results to retrieval options
 *
 * This function shows how a skill execution result would be converted
 * into RetrievalOptions for passing to retrieveKnowledgeWithTrace().
 *
 * @param skillResult - Execution result from a skill
 * @returns Retrieval options with skill context
 */
export function skillResultToRetrievalOptions(skillResult: {
  skillName: string;
  gap?: string;
  gaps?: string[];
  score?: number;
  modelState?: Record<string, unknown>;
}) {
  return {
    skillContext: {
      skillName: skillResult.skillName,
      gap: skillResult.gap,
      gaps: skillResult.gaps,
      score: skillResult.score,
      modelState: skillResult.modelState,
    },
  };
}
