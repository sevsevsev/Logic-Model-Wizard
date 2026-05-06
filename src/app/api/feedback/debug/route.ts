import { NextRequest, NextResponse } from "next/server";
import { isValidDebugSnapshotCapture } from "@/lib/feedback/types";
import {
  listAllDebugSnapshots,
  listDebugSnapshotsByUser,
  saveDebugSnapshotForUser,
} from "@/lib/server/cloudDraftStore";

export const runtime = "nodejs";

function getRequestUserId(req: NextRequest): string | null {
  return req.headers.get("x-user-id");
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId")?.trim();
  const rawLimit = Number(req.nextUrl.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(rawLimit)
    ? Math.min(500, Math.max(1, Math.floor(rawLimit)))
    : 50;

  const snapshots = userId
    ? await listDebugSnapshotsByUser(userId, limit)
    : await listAllDebugSnapshots(limit);

  return NextResponse.json({ snapshots }, { status: 200 });
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
  if (!isValidDebugSnapshotCapture(capture)) {
    return NextResponse.json({ error: "Invalid debug snapshot payload." }, { status: 400 });
  }

  const saved = await saveDebugSnapshotForUser(userId, capture);
  return NextResponse.json({ snapshot: saved }, { status: 201 });
}
