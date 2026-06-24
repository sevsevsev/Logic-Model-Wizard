import { NextRequest, NextResponse } from "next/server";
import { getConceptMapGraph } from "@/lib/server/conceptMapStore";
import type { LogicStage } from "@/lib/concept-map/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STAGES = new Set<LogicStage | "all">([
  "all",
  "resource",
  "activity",
  "output",
  "short_term",
  "medium_term",
  "long_term",
  "impact",
  "other",
]);

export async function GET(req: NextRequest) {
  const rawMinWeight = Number(req.nextUrl.searchParams.get("minWeight") ?? "0.7");
  const minWeight = Number.isFinite(rawMinWeight)
    ? Math.min(1, Math.max(0, rawMinWeight))
    : 0.7;

  const rawMaxNodes = Number(req.nextUrl.searchParams.get("maxNodes") ?? "50");
  const maxNodes = Number.isFinite(rawMaxNodes)
    ? Math.min(250, Math.max(1, Math.floor(rawMaxNodes)))
    : 50;

  const rawStage = (req.nextUrl.searchParams.get("stage") ?? "all").trim() as LogicStage | "all";
  const stage: LogicStage | "all" = VALID_STAGES.has(rawStage) ? rawStage : "all";

  try {
    const graph = await getConceptMapGraph({ minWeight, maxNodes, stage });
    return NextResponse.json(graph, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load concept map graph.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
