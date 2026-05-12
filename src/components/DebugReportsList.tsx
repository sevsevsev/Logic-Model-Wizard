"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type {
  ConceptCodingReviewEntry,
  StoredDebugSnapshotRecord,
} from "@/lib/feedback/types";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function reviewKey(spanText: string, chunkId: string): string {
  return `${spanText}::${chunkId}`;
}

function buildReviewMap(entries: ConceptCodingReviewEntry[] = []): Record<string, ConceptCodingReviewEntry> {
  const out: Record<string, ConceptCodingReviewEntry> = {};
  for (const entry of entries) {
    out[reviewKey(entry.spanText, entry.chunkId)] = entry;
  }
  return out;
}

function ReportCard({ entry }: { entry: StoredDebugSnapshotRecord }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [activeView, setActiveView] = useState<"table" | "relationships" | "timeline">("table");
  const [reviewMap, setReviewMap] = useState<Record<string, ConceptCodingReviewEntry>>(
    buildReviewMap(entry.capture.conceptCodingReview?.entries)
  );

  const report = entry.capture.feedbackReport;
  const messageCount = entry.capture.session.messageCount;
  const quickReplyCount = entry.capture.ui.activeQuickReplies.length;
  const latestLlmCall = entry.capture.llm?.recentCalls?.[entry.capture.llm.recentCalls.length - 1];
  const conceptEvents =
    entry.capture.llm?.recentCalls
      ?.filter((call) => call.trace?.conceptCoding)
      .map((call) => ({
        atIso: call.atIso,
        path: call.path,
        conceptCoding: call.trace!.conceptCoding!,
      })) ?? [];
  const isAddressed = Boolean(entry.addressedAt);

  const analytics = useMemo(() => {
    const rows = conceptEvents.flatMap((event) => event.conceptCoding.spans);
    const links = rows.flatMap((span) => span.matchedChunks);

    const byTopic: Record<string, number> = {};
    let noMatch = 0;
    for (const link of links) {
      byTopic[link.topic] = (byTopic[link.topic] ?? 0) + 1;
      if (link.decision === "no-match") noMatch += 1;
    }

    const topTopics = Object.entries(byTopic)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      spanCount: rows.length,
      linkCount: links.length,
      noMatch,
      topTopics,
      unmatchedSpanCount: conceptEvents.reduce(
        (sum, event) => sum + (event.conceptCoding.unmatchedSpans ?? 0),
        0
      ),
    };
  }, [conceptEvents]);

  async function handleToggleAddressed() {
    setBusy(true);
    try {
      await fetch(`/api/feedback/debug/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addressed: !isAddressed }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function updateReview(spanText: string, chunkId: string, verdict: ConceptCodingReviewEntry["verdict"]) {
    const key = reviewKey(spanText, chunkId);
    const updated: ConceptCodingReviewEntry = {
      spanText,
      chunkId,
      verdict,
      reviewedAtIso: new Date().toISOString(),
    };

    const next = {
      ...reviewMap,
      [key]: updated,
    };

    setReviewMap(next);
    setBusy(true);
    try {
      await fetch(`/api/feedback/debug/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codingReview: {
            entries: Object.values(next),
          },
        }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this debug report? This cannot be undone.")) return;
    setBusy(true);
    try {
      await fetch(`/api/feedback/debug/${entry.id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <details
      key={entry.id}
      className="rounded-lg border border-[#c6deed] bg-[#fbfdff] p-3"
    >
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-[#0b315b]">
                {report.description.slice(0, 110)}
                {report.description.length > 110 ? "..." : ""}
              </p>
              {isAddressed && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                  Addressed
                </span>
              )}
            </div>
            <p className="text-xs text-[#48617c]">Saved: {formatDate(entry.createdAt)}</p>
            {isAddressed && entry.addressedAt && (
              <p className="text-xs text-green-600">Addressed: {formatDate(entry.addressedAt)}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-[#48617c]">
              user: {entry.userId} | msgs: {messageCount} | chips: {quickReplyCount}
            </span>
            <button
              onClick={(e) => {
                e.preventDefault();
                handleToggleAddressed();
              }}
              disabled={busy}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                isAddressed
                  ? "bg-green-100 text-green-700 hover:bg-green-200"
                  : "bg-[#eef4f9] text-[#0b315b] hover:bg-[#d7e8f3]"
              }`}
            >
              {isAddressed ? "Unmark" : "Mark addressed"}
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={busy}
              className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      </summary>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-[#d7e8f3] bg-white p-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#48617c]">Issue Description</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-[#0b315b]">{report.description}</p>
        </div>

        <div className="rounded-md border border-[#d7e8f3] bg-white p-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#48617c]">Session Summary</h2>
          <ul className="mt-2 space-y-1 text-sm text-[#0b315b]">
            <li>Total messages: {entry.capture.session.messageCount}</li>
            <li>Assistant messages: {entry.capture.session.assistantMessageCount}</li>
            <li>User messages: {entry.capture.session.userMessageCount}</li>
            <li>
              Latest model: {latestLlmCall ? `${latestLlmCall.model} (${latestLlmCall.path})` : "n/a"}
            </li>
            {latestLlmCall?.fallbackReason && (
              <li>Fallback reason: {latestLlmCall.fallbackReason}</li>
            )}
            {latestLlmCall?.trace?.finalIntent && (
              <li>Resolved intent: {latestLlmCall.trace.finalIntent}</li>
            )}
            <li>Last URL: {entry.capture.browser?.url ?? "n/a"}</li>
            <li>Timezone: {entry.capture.browser?.timeZone ?? "n/a"}</li>
          </ul>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-[#d7e8f3] bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#48617c]">
            Concept Coding Traceability
          </h2>
          <div className="flex items-center gap-1">
            {[
              { key: "table", label: "Table" },
              { key: "relationships", label: "Relationships" },
              { key: "timeline", label: "Timeline" },
            ].map((view) => (
              <button
                key={view.key}
                className={`rounded px-2 py-1 text-xs ${
                  activeView === view.key
                    ? "bg-[#0b315b] text-white"
                    : "bg-[#eef4f9] text-[#0b315b]"
                }`}
                onClick={() => setActiveView(view.key as "table" | "relationships" | "timeline")}
              >
                {view.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-2 rounded bg-[#f6fbff] p-2 text-xs text-[#0b315b]">
          <p>
            Spans: {analytics.spanCount} | Links: {analytics.linkCount} | Unmatched spans: {analytics.unmatchedSpanCount}
          </p>
          {analytics.topTopics.length > 0 && (
            <p>
              Top concepts: {analytics.topTopics.map(([topic, count]) => `${topic} (${count})`).join(", ")}
            </p>
          )}
        </div>

        {conceptEvents.length === 0 ? (
          <p className="mt-3 text-sm text-[#48617c]">No concept coding traces captured in this report.</p>
        ) : activeView === "table" ? (
          <div className="mt-3 space-y-3">
            {conceptEvents.map((event, eventIndex) => (
              <div key={`${event.atIso}-${eventIndex}`} className="rounded border border-[#d7e8f3] p-2">
                <p className="text-xs text-[#48617c]">
                  {formatDate(event.atIso)} ({event.path})
                </p>
                {event.conceptCoding.spans.map((span, spanIndex) => (
                  <div key={`${span.spanText}-${spanIndex}`} className="mt-2 rounded bg-[#fbfdff] p-2">
                    <p className="text-sm text-[#0b315b]">{span.spanText}</p>
                    <p className="mt-1 text-xs text-[#48617c]">{span.rationale}</p>
                    <div className="mt-1 space-y-1">
                      {span.matchedChunks.map((link) => {
                        const existing = reviewMap[reviewKey(span.spanText, link.chunkId)];
                        return (
                          <div key={link.chunkId} className="rounded border border-[#e1edf5] bg-white p-2">
                            <p className="text-xs text-[#0b315b]">
                              {link.title} [{link.topic}] | decision: {link.decision} | retrieval: {link.score.toFixed(3)} | overlap: {link.matchScore}
                            </p>
                            <div className="mt-1 flex gap-1">
                              {[
                                { verdict: "confirmed", label: "Confirm" },
                                { verdict: "rejected", label: "Reject" },
                                { verdict: "needs-review", label: "Needs review" },
                              ].map((option) => (
                                <button
                                  key={option.verdict}
                                  disabled={busy}
                                  onClick={() =>
                                    updateReview(
                                      span.spanText,
                                      link.chunkId,
                                      option.verdict as ConceptCodingReviewEntry["verdict"]
                                    )
                                  }
                                  className={`rounded px-2 py-0.5 text-[11px] ${
                                    existing?.verdict === option.verdict
                                      ? "bg-[#0b315b] text-white"
                                      : "bg-[#eef4f9] text-[#0b315b]"
                                  }`}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : activeView === "relationships" ? (
          <div className="mt-3 space-y-2">
            {conceptEvents.flatMap((event) => event.conceptCoding.spans).map((span, idx) => (
              <div key={`${span.spanText}-${idx}`} className="rounded border border-[#d7e8f3] bg-[#fbfdff] p-2">
                <p className="text-sm text-[#0b315b]">{span.spanText}</p>
                <ul className="mt-1 text-xs text-[#48617c]">
                  {span.matchedChunks.map((link) => (
                    <li key={`${span.spanText}-${link.chunkId}`}>
                      {"->"} {link.topic} / {link.title} ({link.decision})
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {conceptEvents.map((event, idx) => (
              <div key={`${event.atIso}-${idx}`} className="rounded border border-[#d7e8f3] bg-[#fbfdff] p-2">
                <p className="text-xs text-[#48617c]">{formatDate(event.atIso)} ({event.path})</p>
                <p className="text-sm text-[#0b315b]">
                  spans: {event.conceptCoding.spans.length}, unmatched: {event.conceptCoding.unmatchedSpans}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 rounded-md border border-[#d7e8f3] bg-white p-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[#48617c]">Raw Snapshot JSON</h2>
        <pre className="mt-2 max-h-80 overflow-auto rounded bg-[#f1f6fa] p-2 text-[11px] leading-relaxed text-[#0b315b]">
          {JSON.stringify(entry.capture, null, 2)}
        </pre>
      </div>
    </details>
  );
}

export function DebugReportsList({ snapshots }: { snapshots: StoredDebugSnapshotRecord[] }) {
  if (snapshots.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-[#c6deed] bg-[#f8fbfe] px-4 py-3 text-sm text-[#48617c]">
        No debug reports found yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {snapshots.map((entry) => (
        <ReportCard key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
