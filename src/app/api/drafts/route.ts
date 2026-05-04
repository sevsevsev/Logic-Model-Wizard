import { NextRequest, NextResponse } from "next/server";
import {
  isValidPersistedDraft,
  type PersistedDraft,
} from "@/lib/drafts/types";
import {
  listCloudDraftsByUser,
  saveCloudDraft,
} from "@/lib/server/cloudDraftStore";

export const runtime = "nodejs";

function getRequestUserId(req: NextRequest): string | null {
  return req.headers.get("x-user-id");
}

export async function GET(req: NextRequest) {
  const userId = getRequestUserId(req);
  if (!userId) {
    return NextResponse.json(
      { error: "Authentication required. Provide x-user-id header." },
      { status: 401 }
    );
  }

  const drafts = await listCloudDraftsByUser(userId);
  return NextResponse.json({ drafts });
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

  const persistedDraft = (body as { persistedDraft?: unknown }).persistedDraft;
  if (!isValidPersistedDraft(persistedDraft)) {
    return NextResponse.json({ error: "Invalid persistedDraft payload." }, { status: 400 });
  }

  const saved = await saveCloudDraft(userId, persistedDraft as PersistedDraft);
  return NextResponse.json({ draft: saved }, { status: 201 });
}
