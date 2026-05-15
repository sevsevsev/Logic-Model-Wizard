import { generateGeminiContentWithFallback } from "@/lib/llm/generate";
import { getConversationalAgentInstruction } from "@/lib/agent/conversationalInstructions";
import type { LogicModel } from "@/store/useLogicModelStore";
import {
  addTurn,
  createEmptyTranscript,
  normalizeTranscript,
  transcriptToString,
  type ConversationTranscript,
} from "@/lib/chat/transcript";
import { extractModelFromTranscript } from "@/lib/chat/modelExtractor";
import { retrieveKnowledgeWithTrace } from "@/lib/rag/retrieval";

interface RunConversationalTurnInput {
  apiKey: string;
  message: string;
  transcript?: ConversationTranscript;
  topK?: number;
  retainedFactsContext?: string;
  sectionFocus?: string;
  modelSnapshot?: LogicModel;
}

function buildImpactDraftContext(modelSnapshot?: LogicModel): string {
  const impact = modelSnapshot?.intended_impact;
  if (!impact) return "";

  const lines: string[] = [];
  if (impact.population?.trim()) lines.push(`Population draft: ${impact.population.trim()}`);
  if (impact.geography?.trim()) lines.push(`Geography draft: ${impact.geography.trim()}`);
  if (impact.long_term_goal?.trim()) lines.push(`Long-term change draft: ${impact.long_term_goal.trim()}`);
  if (impact.compiled_statement?.trim()) lines.push(`Compiled impact statement: ${impact.compiled_statement.trim()}`);

  return lines.length > 0 ? `\n\nWORKING IMPACT DRAFT:\n${lines.map((line) => `- ${line}`).join("\n")}` : "";
}

export function buildComparisonRetrievalQuery(
  message: string,
  sectionFocus?: string,
  modelSnapshot?: LogicModel
): string {
  const normalizedMessage = message.trim().toLowerCase();
  const normalizedFocus = sectionFocus?.trim().toLowerCase() ?? "";
  const combined = `${normalizedFocus}\n${normalizedMessage}`;

  if (/quality|fidelity|standard|checklist|adherence|implementation quality/.test(combined)) {
    return [
      "logic model program quality fidelity",
      "strong example weak example bad example anti-pattern",
      "observed facilitation quality participant experience",
      "fidelity indicators quality indicators thresholds",
    ].join("\n");
  }

  if (/activity|activities|strategy|deliver|tutoring|mentoring|workshop|session|program delivery|chunk/.test(combined)) {
    return [
      "logic model activities strategy categories",
      "strong example weak example bad example anti-pattern",
      "grouping tasks into manageable strategy buckets",
      "verb phrase activity examples",
    ].join("\n");
  }

  if (/output|outputs|dosage|reach|count|metric|measure|evaluation/.test(combined)) {
    return [
      "logic model outputs metrics dosage reach",
      "strong example weak example bad example anti-pattern",
      "evaluation metric versus logic model outcome",
      "sessions delivered participants reached quality and dosage",
    ].join("\n");
  }

  if (/outcome|outcomes|short term|medium term|long term|change/.test(combined)) {
    return [
      "logic model outcomes short medium long-term",
      "strong example weak example bad example anti-pattern",
      "outcome horizon mismatch metric versus outcome",
      "missing intermediate steps in theory of change",
    ].join("\n");
  }

  if (/resource|resources|staff|volunteer|funding|material|knowledge|capacity/.test(combined)) {
    return [
      "logic model resources capacity ceiling",
      "strong example weak example bad example anti-pattern",
      "human material financial knowledge resources",
      "resources connect to activities outputs and dosage",
    ].join("\n");
  }

  if (/impact|intended impact|population|geography|north star|mission/.test(combined)) {
    const hasImpactDraft = Boolean(
      modelSnapshot?.intended_impact?.population?.trim() ||
        modelSnapshot?.intended_impact?.geography?.trim() ||
        modelSnapshot?.intended_impact?.long_term_goal?.trim() ||
        modelSnapshot?.intended_impact?.compiled_statement?.trim()
    );

    if (hasImpactDraft) {
      return [
        "logic model intended impact draft review acknowledgement",
        "working draft of intended impact statement",
        "acknowledge the draft then ask one targeted follow-up question",
        "draft intended impact statement needs refinement impact_review",
      ].join("\n");
    }

    return [
      "logic model intended impact example",
      "strong example weak example bad example anti-pattern",
      "population geography long-term change",
      "activity is not intended impact",
    ].join("\n");
  }

  return [
    "logic model gold standard example anti-pattern",
    "strong example weak example bad example",
    "framework comparison evidence for recommendation quality",
  ].join("\n");
}

export interface ConversationalTurnResult {
  reply: string;
  transcript: ConversationTranscript;
  analysis: Awaited<ReturnType<typeof extractModelFromTranscript>>;
  retrieval: {
    knowledgeChunkCount: number;
    trace: Awaited<ReturnType<typeof retrieveKnowledgeWithTrace>>["trace"];
  };
  modelUsed: string;
}

export async function runConversationalTurn(
  input: RunConversationalTurnInput
): Promise<ConversationalTurnResult> {
  const transcript = normalizeTranscript(input.transcript ?? createEmptyTranscript());
  const topK = input.topK ?? 8;

  const withUserTurn = addTurn(transcript, "user", input.message.trim());

  const comparisonQuery = buildComparisonRetrievalQuery(input.message, input.sectionFocus);
  const [primaryRetrieval, comparisonRetrieval] = await Promise.all([
    retrieveKnowledgeWithTrace(input.message, topK),
    retrieveKnowledgeWithTrace(
      comparisonQuery,
      Math.max(4, Math.min(topK, 6))
    ),
  ]);
  const { chunks: relevantKnowledge, trace: retrievalTrace } = primaryRetrieval;
  const { chunks: comparisonKnowledge } = comparisonRetrieval;

  const systemInstruction = getConversationalAgentInstruction();
  const impactDraftContext = buildImpactDraftContext(input.modelSnapshot);
  const retainedFactsContext = input.retainedFactsContext?.trim()
    ? `\n\nRETAINED FACTS (for consistency):\n${input.retainedFactsContext.trim()}`
    : "";
  const sectionFocus = input.sectionFocus?.trim()
    ? `\n\nCURRENT FOCUS SECTION: ${input.sectionFocus.trim()}`
    : "";
  const knowledgeContext = relevantKnowledge.length > 0
    ? `\n\nRELEVANT FRAMEWORK GUIDANCE:\n${relevantKnowledge
        .map((chunk) => `- ${chunk.text}`)
        .join("\n")}`
    : "";
  const comparisonContext = comparisonKnowledge.length > 0
    ? `\n\nCOMPARISON EXAMPLES AND ANTI-PATTERNS:\n${comparisonKnowledge
        .map((chunk) => `- ${chunk.text}`)
        .join("\n")}`
    : "";

  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          {
              text: `${systemInstruction}\n\n---\n\nCONVERSATION SO FAR:\n${transcriptToString(withUserTurn)}${retainedFactsContext}${sectionFocus}${impactDraftContext}\n\nRespond naturally to continue the conversation.${knowledgeContext}${comparisonContext}`,
          },
        ],
      },
    ],
  };

  const { response, model: modelUsed } = await generateGeminiContentWithFallback(
    input.apiKey,
    payload,
    "chat"
  );

  const resultJson = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const reply = resultJson.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!reply) {
    throw new Error("Agent failed to generate response");
  }

  const withAssistantTurn = addTurn(withUserTurn, "assistant", reply);
  const analysis = await extractModelFromTranscript(withAssistantTurn);

  return {
    reply,
    transcript: withAssistantTurn,
    analysis,
    retrieval: {
      knowledgeChunkCount: relevantKnowledge.length + comparisonKnowledge.length,
      trace: retrievalTrace,
    },
    modelUsed,
  };
}
