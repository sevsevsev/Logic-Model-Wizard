import { NextRequest, NextResponse } from "next/server";
import {
  deleteDebugSnapshot,
  markDebugSnapshotAddressed,
  updateDebugSnapshotCodingReview,
} from "@/lib/server/cloudDraftStore";
import type { ConceptCodingReview } from "@/lib/feedback/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const deleted = await deleteDebugSnapshot(id);
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  let addressed: boolean | undefined;
  let codingReview: ConceptCodingReview | undefined;
  try {
    const body = await req.json();
    if (typeof body.addressed === "boolean") {
      addressed = body.addressed;
    }
    if (
      body.codingReview &&
      typeof body.codingReview === "object" &&
      Array.isArray((body.codingReview as { entries?: unknown }).entries)
    ) {
      const entries = (body.codingReview as { entries: Array<Record<string, unknown>> }).entries
        .filter((entry) => {
          return (
            entry &&
            typeof entry === "object" &&
            typeof entry.spanText === "string" &&
            typeof entry.chunkId === "string" &&
            (entry.verdict === "confirmed" || entry.verdict === "rejected" || entry.verdict === "needs-review") &&
            typeof entry.reviewedAtIso === "string" &&
            (entry.reviewerNote === undefined || typeof entry.reviewerNote === "string")
          );
        })
        .map((entry) => ({
          spanText: String(entry.spanText),
          chunkId: String(entry.chunkId),
          verdict: entry.verdict as "confirmed" | "rejected" | "needs-review",
          reviewerNote: typeof entry.reviewerNote === "string" ? entry.reviewerNote : undefined,
          reviewedAtIso: String(entry.reviewedAtIso),
        }));

      codingReview = { entries };
    }
  } catch {
    // leave undefined if body is missing/invalid
  }

  let updated = null;
  if (addressed !== undefined) {
    updated = await markDebugSnapshotAddressed(id, addressed);
  }
  if (codingReview) {
    updated = await updateDebugSnapshotCodingReview(id, codingReview);
  }
  if (!updated && addressed === undefined && !codingReview) {
    updated = await markDebugSnapshotAddressed(id, true);
  }

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}
