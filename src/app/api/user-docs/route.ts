import { NextRequest, NextResponse } from "next/server";
import { deleteUserChunks, listUserDocs } from "@/lib/rag/vectorStore";

export const runtime = "nodejs";

function getUserId(req: NextRequest): string | null {
  const id = req.headers.get("x-user-id")?.trim();
  return id ? id : null;
}

/**
 * GET /api/user-docs
 * Lists all documents the authenticated user has uploaded.
 * Requires x-user-id header.
 */
export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) {
    return NextResponse.json(
      { error: "Authentication required. Provide x-user-id header." },
      { status: 401 }
    );
  }

  const docs = await listUserDocs(userId);
  return NextResponse.json({ docs }, { status: 200 });
}

/**
 * DELETE /api/user-docs
 * Deletes all uploaded documents for the authenticated user.
 * Pass ?docId=<id> to delete a single document instead of all.
 * Requires x-user-id header.
 */
export async function DELETE(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) {
    return NextResponse.json(
      { error: "Authentication required. Provide x-user-id header." },
      { status: 401 }
    );
  }

  const docId = req.nextUrl.searchParams.get("docId")?.trim() || undefined;
  const deleted = await deleteUserChunks(userId, docId);
  return NextResponse.json({ deleted }, { status: 200 });
}
