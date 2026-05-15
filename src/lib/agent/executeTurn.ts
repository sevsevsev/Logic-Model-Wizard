import { retrieveKnowledge } from "@/lib/rag/retrieval";
import { applyCompiledStatementPolicy } from "@/lib/chat/impactAcceptance";
import { formatAgentPolicy, retrieveAgentPolicy } from "@/lib/agent/policy";
import { parseAgentStructuredOutput, salvageAgentStructuredOutput } from "@/lib/agent/schema";
import { buildAgentTurnBrief, formatAgentTurnBrief } from "@/lib/agent/turnBrief";
import { sanitizeAgentTurnResult } from "@/lib/agent/validate";
import { generateGeminiContentWithFallback } from "@/lib/llm/generate";
import { findSchoolReferenceMentions, formatSchoolReferenceHints } from "@/lib/geo/referenceStore";
import type { AgentTurnBrief } from "@/lib/agent/turnBrief";
import type { AgentTurnInput, AgentTurnResult } from "@/lib/agent/types";

const DEBUG_AGENTIC_TURN = process.env.DEBUG_AGENTIC_TURN === "true";

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const AGENTIC_USER_RETRIEVAL_TOP_K = parsePositiveInt(process.env.RAG_AGENT_USER_TOP_K, 8);
const AGENTIC_PLANNING_RETRIEVAL_TOP_K = parsePositiveInt(process.env.RAG_AGENT_PLAN_TOP_K, 6);
const AGENTIC_MERGED_RETRIEVAL_TOP_K = parsePositiveInt(process.env.RAG_AGENT_MERGED_TOP_K, 12);

function buildQuestionPlanningQuery(turnBrief: AgentTurnBrief): string {
  const phaseQueries: Record<AgentTurnBrief["currentPhase"], string> = {
    unknown: "logic model intake question framing for missing population geography and long-term change",
    complete: "logic model section refinement and review question framing",
    impact_statement: "logic model intended impact draft elicitation and synthesis question examples",
    impact_population_facet: "logic model impact statement population clarification question examples",
    impact_geography_facet: "logic model impact statement geography clarification question examples",
    impact_outcome_facet: "logic model intended impact long-term change clarification question examples",
    impact_aspiration: "logic model intended impact long-term change clarification question examples",
    impact_change_type: "logic model intended impact long-term change type clarification",
    impact_specificity: "logic model intended impact specificity clarification and examples",
    impact_review: "logic model intended impact statement confirmation phrasing",
    long_term_help: "logic model long-term outcome coaching and clarification",
    geography: "logic model geography specificity clarification question examples",
    population_focus: "logic model population specificity clarification question examples",
    resources: "logic model resources inputs clarification question examples",
    activities: "logic model activities verb-based strategy clarification question examples",
    outputs_metrics: "logic model outputs metrics clarification question examples",
    quality_evidence: "logic model program quality and fidelity clarification question examples",
    outcomes_review: "logic model short medium long-term outcomes sequencing clarification",
    section_refine: "logic model section refinement clarification question examples",
    none: "logic model direct answer with optional follow-up question framing",
  };

  const coachingModeHint =
    turnBrief.currentPhase === "complete" || turnBrief.currentPhase === "section_refine"
      ? "End-stage mode: prioritize section_refine, wording cleanup, and light-touch polishing while preserving user intent."
      : "Collection mode: accept close-enough answers, capture partial details, keep momentum, and ask one focused follow-up only when needed.";

  return [
    phaseQueries[turnBrief.currentPhase] ?? "logic model clarification question framing",
    turnBrief.missingFields.length > 0 ? `Missing fields: ${turnBrief.missingFields.join(", ")}` : "No required field is currently missing.",
    coachingModeHint,
    "Prefer low-friction coaching guidance: close enough, good enough for now, avoid repetitive correction loops.",
    "Use end-of-flow guidance for refinement: finishing touches, section refine, wording cleanup after model is populated.",
    "Use conceptual guidance to decide whether to ask, confirm, or answer directly.",
  ].join("\n");
}

function mergeRetrievedEvidence(primary: Awaited<ReturnType<typeof retrieveKnowledge>>, secondary: Awaited<ReturnType<typeof retrieveKnowledge>>, topK: number) {
  const seen = new Set<string>();
  const merged = [...primary, ...secondary].filter((chunk) => {
    if (seen.has(chunk.id)) return false;
    seen.add(chunk.id);
    return true;
  });

  return merged.slice(0, topK);
}

const AGENT_SYSTEM_INSTRUCTION = `You are a logic model coaching assistant helping nonprofit and social-sector teams build clear, rigorous logic models.

================================================================================
OUTPUT FORMAT — return STRICT JSON only, exactly this shape:
================================================================================
{
  "assistant_reply": "string",
  "question_intent": "impact_aspiration|impact_change_type|impact_specificity|impact_review|long_term_help|geography|population_focus|resources|activities|outputs_metrics|quality_evidence|outcomes_review|section_refine|none",
  "model_patch": { ...fields to update in the logic model, or omit if nothing changed... },
  "confidence": 0.0,
  "evidence_refs": ["chunk-id"],
  "question_plan": {
    "shouldAsk": true,
    "targetField": "impact_statement|impact_population_facet|impact_geography_facet|impact_outcome_facet|population|geography|long_term_goal|impact_review_confirmation|resources|activities|outputs_metrics|quality_evidence|outcomes|none",
    "goal": "what the next turn should accomplish",
    "draftQuestion": "single focused question if shouldAsk is true",
    "conceptualTopics": ["topic names from retrieved evidence"]
  },
  "revision_proposal": {
    "shouldRevise": true,
    "originalText": "the user's close-but-imperfect wording if needed",
    "revisedText": "a careful rewrite that preserves meaning and improves alignment",
    "rationale": "why the rewrite is better aligned",
    "evidenceRefs": ["chunk-id"],
    "confidence": 0.0
  },
  "decision_summary": "one sentence rationale",
  "state_assessment": {
    "currentPhase": "string",
    "knownFacts": ["string"],
    "missingFields": ["string"]
  },
  "contradiction_flags": [],
  "patch_provenance": ["user_stated|retrieved_guidance|assistant_inferred"]
}

================================================================================
CORE OPERATING PRINCIPLES
================================================================================
- Use natural reasoning and plain language.
- Prioritize faithful extraction of user-stated facts.
- Keep replies concise for routine turns; be fuller only when asked for explanation.
- Ask at most one focused follow-up question when clarification is needed.
- Prefer forward progress and avoid repeating already confirmed prompts.
- Decide explicitly whether this turn should answer only, confirm a draft, or ask one focused next-step question.
- Prefer a close-enough standard during collection turns: capture usable meaning first and avoid over-correcting phrasing mid-flow.
- Save wording polish and category cleanup for section_refine/end-of-flow review unless there is clear risk of material misclassification.
- When the user's answer is close but not ideal, you may propose a revision that preserves the user's meaning while tightening clarity and framework alignment; do not invent facts or drift away from the original intent.
- Keep assistant_reply consistent with question_plan. If question_plan.shouldAsk is false, do not end with a new question.
- Use turn_brief.revision_lifecycle to guide rewrite behavior:
  - status "pending": avoid generating a second rewrite for the same text; ask for accept/reject or continue only if user moves on.
  - status "dismissed": do not re-propose the same rewrite unless the user explicitly asks for rewriting help.
  - status "accepted": treat revised text as settled wording unless the user asks to change it.

Extraction guidance:
- Populate model_patch only with data the user provided or explicitly revised this turn.
- Keep extraction domain-aligned with current phase signals in turn_brief.
- Avoid inferring new project facts from generic examples.
- Do not clear existing fields unless the user explicitly corrects them.

FIRST-TURN BROAD NARRATIVE INTAKE (High Priority):
- When the user provides a rich, multi-sentence program description on turn 1 (empty history), treat this as a comprehensive intake opportunity.
- Extract ALL semantic chunks into appropriate model_patch fields:
  * Population: "children and youth," "students," "families," etc.
  * Geography: "neighborhoods," "Philadelphia," "schools," district scope, etc.
  * Activities: verb phrases like "run workshops," "provide tutoring," "offer mentoring," "deliver instruction," etc.
  * Intended long-term outcome: phrases like "students will graduate," "families become stable," "lasting change," "long-term educational pathways," etc.
  * Quality/fidelity signals: "high quality," "with fidelity," "to standards," "adherence to design," etc.
  * Short/medium/long-term outcomes: look for outcome sequencing like "students will gain skills → demonstrate behavior → achieve condition change"
- Even if confidence is medium (0.4-0.7), return a populated model_patch. First-turn narrative extraction is probabilistic and iterative.
- Populate MULTIPLE fields in the patch — do not restrict to a single domain. Broad narrative contains multi-domain signals.
- Ask a follow-up to clarify the most important missing field (usually confirming one key facet of intended impact) rather than re-asking the whole narrative.

Other extraction guidance:
- For resources: classify user-stated items into human (people/roles), material (physical things), financial (funding), or knowledge (expertise/training) buckets. Common examples: 'volunteers' → human, 'curriculum' → material, 'grants' → financial, 'training' → knowledge.
- For activities: extract verb-based descriptions from phrases like 'we run workshops', 'we provide tutoring', 'we offer mentoring', 'we connect students to services'.
- For outcomes: extract short-term (knowledge/awareness), medium-term (behavior/skills), long-term (condition changes) from user statements about what will change.
- Accept partial answers: if the user only names some resources/activities/outcomes, capture what they gave and ask one targeted follow-up about the most important missing piece.
- If the user has already answered a question (even partially), do not ask the exact same open-ended question again — acknowledge what was captured and ask specifically about what is missing.

================================================================================
USING RETRIEVED EVIDENCE
================================================================================
- The retrieved_evidence block contains framework snippets from vector retrieval.
- Some snippets may be retrieved from a conceptual question-planning query, not just the literal user words.
- Use it to improve definitions, distinctions, and phrasing quality.
- Never treat retrieved content as user-confirmed project facts.
- If retrieved guidance conflicts with explicit user facts, prioritize the user facts.

================================================================================
GEOGRAPHY RESOLUTION HINTS (RELATIONAL LOOKUP)
================================================================================
- The geo_reference_hints block contains deterministic school/place alias matches.
- Use hints for disambiguation support only.
- Do not invent places not present in user text or hints.
- Hints are grounding context, not user-confirmed model facts.`;

export async function executeAgenticTurn(input: AgentTurnInput): Promise<AgentTurnResult | null> {
  const turnBrief = buildAgentTurnBrief({
    userMessage: input.userMessage,
    history: input.history.slice(-20),
    modelSnapshot: input.modelSnapshot,
    revisionLifecycle: input.revisionLifecycle,
  });
  const behaviorGuidance = retrieveAgentPolicy(
    [
      input.userMessage,
      turnBrief.currentPhase,
      ...turnBrief.missingFields,
      ...turnBrief.confirmedFacts,
    ].join("\n"),
    4
  );

  const retrievedFromUserTurn = await retrieveKnowledge(input.userMessage, AGENTIC_USER_RETRIEVAL_TOP_K, {
    userId: input.userId,
  });
  const retrievedFromQuestionPlanning = await retrieveKnowledge(buildQuestionPlanningQuery(turnBrief), AGENTIC_PLANNING_RETRIEVAL_TOP_K, {
    userId: input.userId,
  });
  const retrieved = mergeRetrievedEvidence(retrievedFromUserTurn, retrievedFromQuestionPlanning, AGENTIC_MERGED_RETRIEVAL_TOP_K);

  const schoolMatches = await findSchoolReferenceMentions(input.userMessage, 5);
  const schoolHintBlock = formatSchoolReferenceHints(schoolMatches);

  const evidenceBlock = retrieved
    .map((chunk) => `- [${chunk.id}] (${chunk.topic}) ${chunk.title}: ${chunk.text}`)
    .join("\n");

  const payload = {
    system_instruction: { parts: [{ text: AGENT_SYSTEM_INSTRUCTION }] },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: JSON.stringify({
              user_message: input.userMessage,
              history: input.history.slice(-20),
              model_snapshot: input.modelSnapshot,
              turn_brief: formatAgentTurnBrief(turnBrief),
              behavior_guidance: formatAgentPolicy(behaviorGuidance),
              question_planning_query: buildQuestionPlanningQuery(turnBrief),
              retained_facts_context: input.retentionContext ?? "",
              geo_reference_hints: schoolHintBlock,
              retrieved_evidence: evidenceBlock,
            }),
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1400,
      responseMimeType: "application/json",
    },
  };

  const { response: res, model: modelUsed } = await generateGeminiContentWithFallback(input.apiKey, payload, "agent");

  if (!res.ok) {
    if (DEBUG_AGENTIC_TURN) {
      console.warn("[agentic-turn] model call failed", {
        status: res.status,
        modelUsed,
      });
    }
    return null;
  }

  const data = await res.json();
  const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const parsed = parseAgentStructuredOutput(rawText);
  const salvaged = parsed ? null : salvageAgentStructuredOutput(rawText);
  const output = parsed ?? salvaged;
  if (!output) {
    if (DEBUG_AGENTIC_TURN) {
      console.warn("[agentic-turn] parse failure", {
        modelUsed,
        rawPreview: rawText.slice(0, 600),
      });
    }
    return null;
  }

  const draftResult: AgentTurnResult = {
    reply: output.assistant_reply,
    questionIntent: output.question_intent,
    modelPatch: output.model_patch ?? null,
    confidence: output.confidence,
    evidenceRefs: output.evidence_refs,
    questionPlan: output.question_plan,
    revisionProposal: output.revision_proposal,
    stateAssessment: output.state_assessment,
    contradictionFlags: output.contradiction_flags,
    patchProvenance: output.patch_provenance,
    decisionSummary: output.decision_summary,
    modelUsed,
    retrievedEvidence: retrieved,
  };

  const sanitized = sanitizeAgentTurnResult(draftResult, {
    modelSnapshot: input.modelSnapshot,
    userMessage: input.userMessage,
    turnBrief,
  });

  if (DEBUG_AGENTIC_TURN) {
    console.info("[agentic-turn] parsed", {
      modelUsed,
      usedSalvage: Boolean(salvaged),
      questionIntent: sanitized.questionIntent,
      hasPatch: Boolean(sanitized.modelPatch),
    });
  }

  sanitized.modelPatch = applyCompiledStatementPolicy(
    sanitized.modelPatch,
    input.modelSnapshot,
    input.userMessage,
    { synthesizeWhenComplete: false }
  );

  return sanitized;
}
