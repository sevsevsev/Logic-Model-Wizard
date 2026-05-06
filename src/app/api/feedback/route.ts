import { NextRequest, NextResponse } from "next/server";
import { isValidFeedbackCapture } from "@/lib/feedback/types";
import { saveFeedbackForUser } from "@/lib/server/cloudDraftStore";

export const runtime = "nodejs";

function getRequestUserId(req: NextRequest): string | null {
  return req.headers.get("x-user-id");
}

export async function POST(req: NextRequest) {
  const userId = getRequestUserId(req);
  if (!userId) {
    return NextResponse.json(
      { error: "Authentication required. Provide x-user-id header." },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const capture = (body as { capture?: unknown }).capture;
  if (!isValidFeedbackCapture(capture)) {
    return NextResponse.json({ error: "Invalid feedback payload." }, { status: 400 });
  }

  const saved = await saveFeedbackForUser(userId, capture);
  return NextResponse.json({ feedback: saved }, { status: 201 });
}
