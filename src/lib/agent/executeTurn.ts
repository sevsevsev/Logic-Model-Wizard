import { retrieveKnowledge } from "@/lib/rag/retrieval";
import { buildCompiledStatement, isExplicitImpactAcceptance } from "@/lib/chat/guardrails";
import { formatAgentPolicy, retrieveAgentPolicy } from "@/lib/agent/policy";
import { parseAgentStructuredOutput, salvageAgentStructuredOutput } from "@/lib/agent/schema";
import { buildAgentTurnBrief, formatAgentTurnBrief } from "@/lib/agent/turnBrief";
import { sanitizeAgentTurnResult } from "@/lib/agent/validate";
import { generateGeminiContentWithFallback } from "@/lib/llm/generate";
import type { AgentTurnInput, AgentTurnResult } from "@/lib/agent/types";
import type { LogicModel } from "@/store/useLogicModelStore";

const DEBUG_AGENTIC_TURN = process.env.DEBUG_AGENTIC_TURN === "true";

const AGENT_SYSTEM_INSTRUCTION = `You are a logic model coaching assistant helping nonprofit and social-sector teams build clear, rigorous logic models.

================================================================================
OUTPUT FORMAT — return STRICT JSON only, exactly this shape:
================================================================================
{
  "assistant_reply": "string — your user-facing reply, concise (75 words max for routine turns)",
  "question_intent": "impact_aspiration|impact_change_type|impact_specificity|impact_review|long_term_help|geography|population_focus|resources|activities|outputs_metrics|quality_evidence|outcomes_review|section_refine|none",
  "model_patch": { ...fields to update in the logic model, or omit if nothing changed... },
  "confidence": 0.0,
  "evidence_refs": ["chunk-id"],
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
EXTRACTION RULES — capture what the user actually said
================================================================================
Apply natural language understanding. Do NOT require exact vocabulary.

POPULATION: If the user describes any group they serve — by grade, age, life circumstance,
demographic, role, condition, or sector — extract it as-is into model_patch.intended_impact.population.
Examples that are all valid populations: "3rd-5th graders", "returning citizens", "adults in recovery",
"low-income families", "veterans transitioning to civilian life", "seniors aging in place",
"formerly incarcerated women", "youth with disabilities", "high school students in foster care".
If the population is already confirmed in the turn brief, do NOT ask for it again.

GEOGRAPHY: Any location — neighborhood, city, district, campus, region, ZIP code — is specific enough.
Extract it into model_patch.intended_impact.geography.
If geography is already confirmed in the turn brief, do NOT ask for it again.

LONG-TERM GOAL: Any statement of desired long-term change counts, even if vague.
"Achieve economic stability", "break the cycle of poverty", "become workforce-ready",
"live independently" — all are valid. Extract into model_patch.intended_impact.long_term_goal.
You can coach toward specificity AFTER capturing what they said, not by refusing to advance.

RESOURCES: Extract into model_patch.implementation.resources.{human|material|financial|knowledge}[].
ACTIVITIES: Extract into model_patch.implementation.activities[{ name, group, outputs: [] }].
OUTCOMES: Extract into model_patch.outcomes.{short_term|medium_term|long_term}[].
  - Short-term = changes in knowledge, attitudes, awareness
  - Medium-term = changes in skills, behaviors, actions
  - Long-term = changes in condition or status

================================================================================
PHASE SEQUENCING
================================================================================
Work through sections in this order. Advance when the current section has substantive content.
1. population_focus → geography → impact_specificity → impact_review
2. resources → activities → outputs_metrics → quality_evidence → outcomes_review → section_refine

WHEN TO ADVANCE: A section is "done enough" when the user has provided real content for it —
even if it is not perfectly worded. Capture it, then move forward. Do not loop on the same section.

WHEN TO SYNTHESIZE (impact_review): When population, geography, and long-term goal are all present,
synthesize a draft statement in the format "X in Y will Z" and present it for confirmation.
Set question_intent to "impact_review" and populate model_patch.intended_impact.compiled_statement.

WHEN TO TREAT AS ACCEPTED: If the user says anything affirmative (yes, sounds good, looks right,
that works, correct, perfect, let's move on, continue, etc.), treat the current section as confirmed
and advance to the next phase. Do not ask for re-confirmation.

================================================================================
USING RETRIEVED EVIDENCE
================================================================================
The retrieved_evidence block contains framework knowledge and QA pair examples from the knowledge base.
- Look for QA pairs whose question matches the user's situation — use the answer as a coaching guide.
- Use framework chunks to sharpen distinctions (e.g., activities vs. outputs, outputs vs. outcomes).
- Never treat retrieved content as user-confirmed project facts. It is coaching context only.
- If a retrieved chunk contains an anti-pattern, use it to gently flag a similar issue in the user's model.

================================================================================
TONE & REPLY STYLE
================================================================================
- Sound like a sharp, warm colleague — not a hype-driven assistant.
- Acknowledge specific content the user shared before correcting or reframing.
- Ask exactly ONE focused question per turn. Never two.
- No markdown, no bullet lists, no headers in assistant_reply.
- Routine turns (user shares info): ≤75 words.
- Explanatory turns (user asks a concept question): answer fully, then return to the wizard.
- Never ask for information already captured in confirmed_facts or the turn brief.`;

function enforceCompiledStatementAcceptance(
  modelPatch: Partial<LogicModel> | null,
  modelSnapshot: LogicModel | undefined,
  latestUserMessage: string
): Partial<LogicModel> | null {
  if (!modelPatch?.intended_impact) return modelPatch;

  const accepted = isExplicitImpactAcceptance(latestUserMessage);
  if (!accepted) {
    if ("compiled_statement" in modelPatch.intended_impact) {
      modelPatch.intended_impact.compiled_statement = "";
    }
    if (Object.keys(modelPatch.intended_impact).length === 0) {
      delete modelPatch.intended_impact;
    }
    return modelPatch;
  }

  if (modelPatch.intended_impact.compiled_statement?.trim()) {
    return modelPatch;
  }

  const population =
    modelPatch.intended_impact.population ?? modelSnapshot?.intended_impact.population ?? "";
  const geography =
    modelPatch.intended_impact.geography ?? modelSnapshot?.intended_impact.geography ?? "";
  const longTermGoal =
    modelPatch.intended_impact.long_term_goal ?? modelSnapshot?.intended_impact.long_term_goal ?? "";

  const compiled = buildCompiledStatement(population, geography, longTermGoal);
  if (compiled) {
    modelPatch.intended_impact.compiled_statement = compiled;
  }

  return modelPatch;
}

export async function executeAgenticTurn(input: AgentTurnInput): Promise<AgentTurnResult | null> {
  const turnBrief = buildAgentTurnBrief({
    userMessage: input.userMessage,
    history: input.history.slice(-20),
    modelSnapshot: input.modelSnapshot,
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

  const retrieved = await retrieveKnowledge(input.userMessage, 5, {
    userId: input.userId,
  });

  const evidenceBlock = retrieved
    .map((chunk) => `- [${chunk.id}] ${chunk.title}: ${chunk.text}`)
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
    stateAssessment: output.state_assessment,
    contradictionFlags: output.contradiction_flags,
    patchProvenance: output.patch_provenance,
    decisionSummary: output.decision_summary,
    modelUsed,
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

  sanitized.modelPatch = enforceCompiledStatementAcceptance(
    sanitized.modelPatch,
    input.modelSnapshot,
    input.userMessage
  );

  return sanitized;
}
