"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StoredDebugSnapshotRecord } from "@/lib/feedback/types";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function ReportCard({ entry }: { entry: StoredDebugSnapshotRecord }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const report = entry.capture.feedbackReport;
  const messageCount = entry.capture.session.messageCount;
  const quickReplyCount = entry.capture.ui.activeQuickReplies.length;
  const latestLlmCall = entry.capture.llm?.recentCalls?.[entry.capture.llm.recentCalls.length - 1];
  const isAddressed = Boolean(entry.addressedAt);

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
            <li>Last URL: {entry.capture.browser?.url ?? "n/a"}</li>
            <li>Timezone: {entry.capture.browser?.timeZone ?? "n/a"}</li>
          </ul>
        </div>
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
