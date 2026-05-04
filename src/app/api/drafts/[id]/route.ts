import { NextRequest, NextResponse } from "next/server";
import {
  isValidPersistedDraft,
  type PersistedDraft,
} from "@/lib/drafts/types";
import {
  deleteCloudDraft,
  getCloudDraftById,
  saveCloudDraft,
} from "@/lib/server/cloudDraftStore";

export const runtime = "nodejs";

function getRequestUserId(req: NextRequest): string | null {
  return req.headers.get("x-user-id");
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const userId = getRequestUserId(req);
  if (!userId) {
    return NextResponse.json(
      { error: "Authentication required. Provide x-user-id header." },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  const draft = await getCloudDraftById(userId, id);

  if (!draft) {
    return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  }

  return NextResponse.json({ draft });
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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

  const { id } = await context.params;
  const saved = await saveCloudDraft(userId, persistedDraft as PersistedDraft, id);
  return NextResponse.json({ draft: saved });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const userId = getRequestUserId(req);
  if (!userId) {
    return NextResponse.json(
      { error: "Authentication required. Provide x-user-id header." },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  const deleted = await deleteCloudDraft(userId, id);

  if (!deleted) {
    return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
