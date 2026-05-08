import { retrieveKnowledge } from "@/lib/rag/retrieval";
import { buildCompiledStatement, isExplicitImpactAcceptance } from "@/lib/chat/guardrails";
import { parseAgentStructuredOutput } from "@/lib/agent/schema";
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
  "decision_summary": "short rationale without hidden reasoning"
}
Rules:
- Ask one focused question at most.
- Keep assistant_reply concise and user-facing.
- Only include model_patch fields supported by the provided schema.
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
      (modelPatch.intended_impact.compiled_statement as any);
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
  const retrieved = await retrieveKnowledge(input.userMessage, 5);

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

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${input.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) return null;

  const data = await res.json();
  const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const parsed = parseAgentStructuredOutput(rawText);
  if (!parsed) return null;

  let modelPatch = parsed.model_patch ?? null;
  modelPatch = enforceCompiledStatementAcceptance(modelPatch, input.modelSnapshot, input.userMessage);

  return {
    reply: parsed.assistant_reply,
    questionIntent: parsed.question_intent,
    modelPatch,
    confidence: parsed.confidence,
    evidenceRefs: parsed.evidence_refs,
  };
}
