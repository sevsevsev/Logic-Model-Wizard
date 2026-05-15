import type { FailureClass } from "@/lib/regression/incidents";

export interface CandidateTurnExpectation {
  finalIntentOneOf?: string[];
  modelPatchMustHavePath?: string[];
  modelPatchResourceBucketsAtLeast?: number;
  replyMustNotMatch?: string[];
}

export interface CandidateScenarioTurn {
  user: string;
  expect?: CandidateTurnExpectation;
}

export interface CandidateScenarioDraft {
  id: string;
  description: string;
  expectedFailureClass: FailureClass;
  sourceIncidentId: string;
  rationale: string;
  edgeFamily:
    | "contradictory_user_facts"
    | "implicit_approval_language"
    | "short_vague_reply"
    | "section_jump_request"
    | "retrieval_sensitive_phrasing"
    | "repeated_confirmation_turn";
  seedModel?: Partial<{
    intended_impact: {
      population: string;
      geography: string;
      long_term_goal: string;
      compiled_statement: string;
    };
  }>;
  seedHistory?: Array<{ role: "assistant" | "user"; content: string }>;
  turns: CandidateScenarioTurn[];
}

export interface CandidatePackInputIncident {
  id: string;
  failureClass: FailureClass;
  summary: string;
  rationale: string;
  severity: "high" | "medium" | "low";
  confidence: "high" | "medium" | "low";
  evidence?: Record<string, unknown>;
}

export interface CandidatePack {
  generatedAt: string;
  sourceIncidentCount: number;
  generatedCandidateCount: number;
  byFailureClass: Record<FailureClass, number>;
  candidates: CandidateScenarioDraft[];
}

const ORDERED_CLASSES: FailureClass[] = [
  "acceptance_gate_failure",
  "missing_patch_writeback",
  "phase_regression",
  "repeated_question_loop",
  "intent_misclassification",
  "extraction_gap",
  "retrieval_mismatch",
  "contradiction_handling_failure",
  "runtime_transport_failure",
  "unknown",
];

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function compactId(input: string): string {
  return toSlug(input).replace(/-/g, "").slice(0, 12) || "incident";
}

function scenarioForIncident(incident: CandidatePackInputIncident): CandidateScenarioDraft {
  const idBase = `${incident.failureClass}-${compactId(incident.id)}`;

  switch (incident.failureClass) {
    case "acceptance_gate_failure":
    case "missing_patch_writeback":
      return {
        id: `${idBase}-approval-writeback`,
        description:
          "After user confirms the draft intended impact statement, assistant must persist compiled_statement before transitioning to resources.",
        expectedFailureClass: incident.failureClass,
        sourceIncidentId: incident.id,
        rationale: incident.rationale,
        edgeFamily: "implicit_approval_language",
        seedHistory: [
          {
            role: "assistant",
            content:
              "Based on what you've shared, here's a draft intended impact statement: Middle school students in North Philadelphia will read on grade level and transition successfully to high school. Does this capture your ultimate goal?",
          },
        ],
        turns: [
          {
            user: "Yes, that captures it. Let's continue.",
            expect: {
              modelPatchMustHavePath: ["intended_impact.compiled_statement"],
              finalIntentOneOf: ["impact", "resources"],
            },
          },
        ],
      };

    case "phase_regression":
      return {
        id: `${idBase}-no-impact-restart`,
        description:
          "When a working impact draft already exists, assistant should acknowledge the draft and ask a targeted refinement question rather than restarting with baseline population elicitation.",
        expectedFailureClass: incident.failureClass,
        sourceIncidentId: incident.id,
        rationale: incident.rationale,
        edgeFamily: "section_jump_request",
        seedModel: {
          intended_impact: {
            population: "Children and youth (birth-12th grade), including those with disabilities, in under-resourced communities.",
            geography: "Priority neighborhoods and zip codes within Philadelphia.",
            long_term_goal: "To create safer, more vibrant communities where arts learning is embedded in daily life.",
            compiled_statement:
              "For children and youth in priority Philadelphia neighborhoods, Musicopia works to create safer, more vibrant communities where arts learning is embedded in daily life.",
          },
        },
        seedHistory: [
          {
            role: "assistant",
            content:
              "I reviewed your document and drafted intended impact language. We can refine the impact statement before we move on.",
          },
          {
            role: "user",
            content: "Let's focus on intended impact first.",
          },
        ],
        turns: [
          {
            user: "Great, let's refine what's already there.",
            expect: {
              finalIntentOneOf: ["impact", "impact_review"],
              replyMustNotMatch: [
                "specific population or community your program is designed to serve",
                "who is this intended impact statement really about",
              ],
            },
          },
        ],
      };

    case "repeated_question_loop":
      return {
        id: `${idBase}-no-repeat-confirm`,
        description:
          "Assistant should not repeat the same resource question after user confirms completion.",
        expectedFailureClass: incident.failureClass,
        sourceIncidentId: incident.id,
        rationale: incident.rationale,
        edgeFamily: "repeated_confirmation_turn",
        seedHistory: [
          {
            role: "assistant",
            content: "What key resources does your program rely on?",
          },
        ],
        turns: [
          {
            user: "Staff mentors, donated laptops, grant funding, and partner training.",
            expect: {
              finalIntentOneOf: ["resources"],
              modelPatchResourceBucketsAtLeast: 3,
            },
          },
          {
            user: "That's all for resources.",
            expect: {
              replyMustNotMatch: ["what key resources", "please list resources", "tell me your resources"],
            },
          },
        ],
      };

    case "intent_misclassification":
      return {
        id: `${idBase}-resource-intent-lock`,
        description:
          "Direct resource list input should remain in resources intent and produce resource patch fields.",
        expectedFailureClass: incident.failureClass,
        sourceIncidentId: incident.id,
        rationale: incident.rationale,
        edgeFamily: "short_vague_reply",
        seedHistory: [
          {
            role: "assistant",
            content: "List people, materials, funding, and expertise your program depends on.",
          },
        ],
        turns: [
          {
            user: "Mentors, laptops, grants, and training curriculum.",
            expect: {
              finalIntentOneOf: ["resources"],
              modelPatchMustHavePath: ["implementation.resources"],
              modelPatchResourceBucketsAtLeast: 3,
            },
          },
        ],
      };

    case "extraction_gap":
      return {
        id: `${idBase}-impact-field-completion`,
        description:
          "Agent should retain and write extracted impact fields when provided in one compact user turn.",
        expectedFailureClass: incident.failureClass,
        sourceIncidentId: incident.id,
        rationale: incident.rationale,
        edgeFamily: "short_vague_reply",
        turns: [
          {
            user:
              "We serve ninth graders in North Philly and our long-term goal is on-time graduation with postsecondary enrollment.",
            expect: {
              finalIntentOneOf: ["impact"],
              modelPatchMustHavePath: [
                "intended_impact.population",
                "intended_impact.geography",
                "intended_impact.long_term_goal",
              ],
            },
          },
        ],
      };

    case "retrieval_mismatch":
      return {
        id: `${idBase}-retrieval-resilient-reply`,
        description:
          "Assistant should maintain coherent section-focused response even when retrieval quality degrades.",
        expectedFailureClass: incident.failureClass,
        sourceIncidentId: incident.id,
        rationale: incident.rationale,
        edgeFamily: "retrieval_sensitive_phrasing",
        seedHistory: [
          {
            role: "assistant",
            content: "Let's focus on activities. What does your team do each week?",
          },
        ],
        turns: [
          {
            user: "Weekly mentoring circles, two tutoring blocks, and Friday family office hours.",
            expect: {
              finalIntentOneOf: ["activities"],
              modelPatchMustHavePath: ["implementation.activities"],
            },
          },
        ],
      };

    case "contradiction_handling_failure":
      return {
        id: `${idBase}-contradiction-resolve`,
        description:
          "Assistant should surface contradiction and ask a targeted disambiguation question before writing conflicting outcome facts.",
        expectedFailureClass: incident.failureClass,
        sourceIncidentId: incident.id,
        rationale: incident.rationale,
        edgeFamily: "contradictory_user_facts",
        seedHistory: [
          {
            role: "assistant",
            content: "What medium-term outcome should we anchor?",
          },
        ],
        turns: [
          {
            user: "Medium-term is 80 percent job placement, but actually we do not track placement yet.",
            expect: {
              finalIntentOneOf: ["outcomes", "clarify"],
              replyMustNotMatch: ["captured as final", "locked in"],
            },
          },
        ],
      };

    case "runtime_transport_failure":
    case "unknown":
    default:
      return {
        id: `${idBase}-fallback-general`,
        description:
          "General robustness scenario candidate derived from unclassified or transport-linked incident.",
        expectedFailureClass: incident.failureClass,
        sourceIncidentId: incident.id,
        rationale: incident.rationale,
        edgeFamily: "short_vague_reply",
        turns: [
          {
            user: "Can we continue from the current section?",
            expect: {
              replyMustNotMatch: ["internal error", "unable to continue"],
            },
          },
        ],
      };
  }
}

function initializeClassCounts(): Record<FailureClass, number> {
  return {
    intent_misclassification: 0,
    missing_patch_writeback: 0,
    repeated_question_loop: 0,
    phase_regression: 0,
    extraction_gap: 0,
    retrieval_mismatch: 0,
    contradiction_handling_failure: 0,
    acceptance_gate_failure: 0,
    runtime_transport_failure: 0,
    unknown: 0,
  };
}

export function generateCandidatePack(
  incidents: CandidatePackInputIncident[],
  options?: { maxPerClass?: number }
): CandidatePack {
  const maxPerClass = Math.max(1, options?.maxPerClass ?? 2);
  const countsByClass = initializeClassCounts();
  const usedIds = new Set<string>();

  const ordered = [...incidents].sort((a, b) => {
    const classRank = ORDERED_CLASSES.indexOf(a.failureClass) - ORDERED_CLASSES.indexOf(b.failureClass);
    if (classRank !== 0) return classRank;
    const severityRank: Record<string, number> = { high: 3, medium: 2, low: 1 };
    const severityDiff = severityRank[b.severity] - severityRank[a.severity];
    if (severityDiff !== 0) return severityDiff;
    return a.id < b.id ? -1 : 1;
  });

  const candidates: CandidateScenarioDraft[] = [];
  for (const incident of ordered) {
    if (countsByClass[incident.failureClass] >= maxPerClass) {
      continue;
    }
    const candidate = scenarioForIncident(incident);
    const originalId = candidate.id;
    let uniqueId = originalId;
    let suffix = 2;
    while (usedIds.has(uniqueId)) {
      uniqueId = `${originalId}-${suffix}`;
      suffix += 1;
    }
    candidate.id = uniqueId;
    usedIds.add(uniqueId);
    candidates.push(candidate);
    countsByClass[incident.failureClass] += 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceIncidentCount: incidents.length,
    generatedCandidateCount: candidates.length,
    byFailureClass: countsByClass,
    candidates,
  };
}
