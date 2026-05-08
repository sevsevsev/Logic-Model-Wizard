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

const AGENT_SYSTEM_INSTRUCTION = `You are a logic model coaching assistant.

Purpose:
- Help the user build a clear, high-quality logic model.
- Capture concrete facts the user provides.
- Ask only the most useful next question when needed.

Return STRICT JSON only with this exact shape:
{
  "assistant_reply": "string",
  "question_intent": "impact_aspiration|impact_change_type|impact_specificity|impact_review|long_term_help|geography|population_focus|resources|activities|outputs_metrics|quality_evidence|outcomes_review|section_refine|none",
  "model_patch": { ...optional logic model patch... },
  "confidence": 0.0,
  "evidence_refs": ["chunk-id"],
  "decision_summary": "short rationale without hidden reasoning",
  "state_assessment": {
    "currentPhase": "string",
    "knownFacts": ["string"],
    "missingFields": ["string"]
  },
  "contradiction_flags": ["asks_for_known_information|known_fact_overwrite|phase_regression|unsupported_patch"],
  "patch_provenance": ["user_stated|retrieved_guidance|assistant_inferred"]
}

Guidelines:
- Prioritize natural language understanding over rigid pattern matching.
- Keep assistant_reply concise, clear, and user-facing.
- Ask at most one focused question.
- If the user provided concrete logic-model facts this turn, include them in model_patch.
- Do not overwrite confirmed facts unless the user is revising them.
- Use retrieved_evidence and behavior_guidance as helpful context, not hard templates.
- If uncertain, avoid speculative patch fields and set question_intent to "none".`;

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
