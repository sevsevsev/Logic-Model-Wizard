/**
 * API endpoint: Extract and analyze logic model from conversation transcript.
 * 
 * POST /api/analyze
 * Body: { transcript: ConversationTranscript }
 * Returns: { analysis: ExtractionAnalysis }
 */

import { NextRequest, NextResponse } from "next/server";
import { extractModelFromTranscript, ExtractionAnalysis } from "@/lib/chat/modelExtractor";
import { ConversationTranscript } from "@/lib/chat/transcript";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transcript } = body as { transcript?: ConversationTranscript };

    if (!transcript || !Array.isArray(transcript.turns)) {
      return NextResponse.json(
        { error: "Invalid transcript: must have 'turns' array" },
        { status: 400 }
      );
    }

    // Run deterministic analysis on the transcript
    const analysis = await extractModelFromTranscript(transcript);

    return NextResponse.json({
      analysis,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("Error in /api/analyze:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
