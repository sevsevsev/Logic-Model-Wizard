import { retrieveKnowledge } from "@/lib/rag/retrieval";
import { buildCompiledStatement, isExplicitImpactAcceptance } from "@/lib/chat/guardrails";
import { formatAgentPolicy, retrieveAgentPolicy } from "@/lib/agent/policy";
import { parseAgentStructuredOutput } from "@/lib/agent/schema";
import { buildAgentTurnBrief, formatAgentTurnBrief } from "@/lib/agent/turnBrief";
import { sanitizeAgentTurnResult } from "@/lib/agent/validate";
import { generateGeminiContentWithFallback } from "@/lib/llm/generate";
import type { AgentTurnInput, AgentTurnResult } from "@/lib/agent/types";
import type { LogicModel } from "@/store/useLogicModelStore";

const AGENT_SYSTEM_INSTRUCTION = `You are an assistant for a logic model coaching wizard.
Return STRICT JSON only with this shape:
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
Rules:
- Be a capable, general language understanding assistant first: interpret natural user language semantically, not by rigid keyword matching.
- Ask one focused question at most.
- Keep assistant_reply concise and user-facing.
- Only include model_patch fields supported by the provided schema.
- If the latest user message provides concrete facts for logic model fields (for example population, geography, resources, activities, outputs, or outcomes), include those facts in model_patch this turn.
- Prefer extracting explicit user-provided facts over asking the user to restate the same information.
- Treat short confirmations and natural affirmations (for example "yes", "yep", "that works", "looks right") as acceptance when context makes that interpretation clear.
- Treat short revisions/refusals (for example "not quite", "revise", "change it") as non-acceptance when context makes that interpretation clear.
- Treat the provided turn_brief as external working memory for this turn.
- Do not ask for facts already listed in confirmed_facts or avoid_asking_for unless the user explicitly revises them.
- Use retrieved_evidence and behavior_guidance as support, but do not force citations when they are not needed for a concise, grounded response.
- If your planned question conflicts with the turn_brief, keep question_intent as none and set a contradiction flag.
- If uncertain, set question_intent to none and avoid speculative patch fields.`;

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

  if (!res.ok) return null;

  const data = await res.json();
  const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const parsed = parseAgentStructuredOutput(rawText);
  if (!parsed) return null;

  const draftResult: AgentTurnResult = {
    reply: parsed.assistant_reply,
    questionIntent: parsed.question_intent,
    modelPatch: parsed.model_patch ?? null,
    confidence: parsed.confidence,
    evidenceRefs: parsed.evidence_refs,
    stateAssessment: parsed.state_assessment,
    contradictionFlags: parsed.contradiction_flags,
    patchProvenance: parsed.patch_provenance,
    decisionSummary: parsed.decision_summary,
    modelUsed,
  };

  const sanitized = sanitizeAgentTurnResult(draftResult, {
    modelSnapshot: input.modelSnapshot,
    userMessage: input.userMessage,
    turnBrief,
  });

  sanitized.modelPatch = enforceCompiledStatementAcceptance(
    sanitized.modelPatch,
    input.modelSnapshot,
    input.userMessage
  );

  return sanitized;
}
