import { listAllDebugSnapshots } from "@/lib/server/cloudDraftStore";
import { DebugReportsList } from "@/components/DebugReportsList";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DebugReportsPage() {
  const snapshots = await listAllDebugSnapshots(200);
  const conceptEvents = snapshots.flatMap(
    (snapshot) => snapshot.capture.llm?.recentCalls?.filter((call) => call.trace?.conceptCoding) ?? []
  );
  const totalSpans = conceptEvents.reduce(
    (sum, call) => sum + (call.trace?.conceptCoding?.spans.length ?? 0),
    0
  );
  const totalUnmatchedSpans = conceptEvents.reduce(
    (sum, call) => sum + (call.trace?.conceptCoding?.unmatchedSpans ?? 0),
    0
  );

  const topicCounts = new Map<string, number>();
  for (const call of conceptEvents) {
    const spans = call.trace?.conceptCoding?.spans ?? [];
    for (const span of spans) {
      for (const link of span.matchedChunks) {
        topicCounts.set(link.topic, (topicCounts.get(link.topic) ?? 0) + 1);
      }
    }
  }

  const topTopics = Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7fbff_0,#eef4f9_100%)] px-4 py-6">
      <div className="mx-auto max-w-5xl rounded-xl border border-[#9fc3da] bg-white shadow-sm">
        <div className="border-b border-[#c6deed] px-5 py-4">
          <h1 className="font-display text-xl font-semibold text-[#0b315b]">Debug Reports</h1>
          <p className="mt-1 text-sm text-[#48617c]">
            Saved AI behavior reports with full state snapshots. Newest reports appear first.
          </p>
          <div className="mt-3 rounded-md bg-[#f6fbff] p-3 text-xs text-[#0b315b]">
            <p>
              Concept events: {conceptEvents.length} | coded spans: {totalSpans} | unmatched spans: {totalUnmatchedSpans}
            </p>
            {topTopics.length > 0 && (
              <p className="mt-1">Top concept topics: {topTopics.map(([topic, count]) => `${topic} (${count})`).join(", ")}</p>
            )}
          </div>
        </div>

        <div className="px-5 py-4">
          <DebugReportsList snapshots={snapshots} />
        </div>
      </div>
    </main>
  );
}
