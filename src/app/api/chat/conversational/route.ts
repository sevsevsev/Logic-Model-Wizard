/**
 * NEW CONVERSATIONAL CHAT ENDPOINT
 * 
 * This is a simplified chat route that:
 * 1. Collects user messages into a transcript
 * 2. Uses natural conversational agent instructions
 * 3. Stores agent responses as-is (no JSON parsing)
 * 4. Runs analysis to extract model from full transcript
 * 
 * Usage: POST /api/chat/conversational
 * Body: { message: string, conversationId?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { runConversationalTurn } from "@/lib/chat/conversationalPipeline";
import { normalizeTranscript, type ConversationTranscript } from "@/lib/chat/transcript";
import type { LogicModel } from "@/store/useLogicModelStore";

interface ConversationalChatRequest {
  message: string;
  transcript?: ConversationTranscript;
  model?: LogicModel; // Current model snapshot for context
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ConversationalChatRequest;
    const { message, transcript: incomingTranscript } = body;

    if (!message?.trim()) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const result = await runConversationalTurn({
      apiKey,
      message,
      transcript: normalizeTranscript(incomingTranscript),
      topK: 8,
      modelSnapshot: body.model,
    });

    return NextResponse.json({
      reply: result.reply,
      transcript: result.transcript,
      analysis: result.analysis,
      retrieval: result.retrieval,
      llmMeta: {
        path: "agentic",
        model: result.modelUsed,
        fallbackReason: null,
      },
      timestamp: Date.now(),
    });

  } catch (error) {
    console.error("Error in /api/chat/conversational:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
