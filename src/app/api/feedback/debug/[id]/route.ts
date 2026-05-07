import { NextRequest, NextResponse } from "next/server";
import {
  deleteDebugSnapshot,
  markDebugSnapshotAddressed,
} from "@/lib/server/cloudDraftStore";

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
  let addressed = true;
  try {
    const body = await req.json();
    if (typeof body.addressed === "boolean") {
      addressed = body.addressed;
    }
  } catch {
    // default to true if body is missing/invalid
  }
  const updated = await markDebugSnapshotAddressed(id, addressed);
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}
