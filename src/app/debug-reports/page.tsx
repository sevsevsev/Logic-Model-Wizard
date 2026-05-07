import { listAllDebugSnapshots } from "@/lib/server/cloudDraftStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default async function DebugReportsPage() {
  const snapshots = await listAllDebugSnapshots(200);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7fbff_0,#eef4f9_100%)] px-4 py-6">
      <div className="mx-auto max-w-5xl rounded-xl border border-[#9fc3da] bg-white shadow-sm">
        <div className="border-b border-[#c6deed] px-5 py-4">
          <h1 className="font-display text-xl font-semibold text-[#0b315b]">Debug Reports</h1>
          <p className="mt-1 text-sm text-[#48617c]">
            Saved AI behavior reports with full state snapshots. Newest reports appear first.
          </p>
        </div>

        <div className="px-5 py-4">
          {snapshots.length === 0 ? (
            <p className="rounded-md border border-dashed border-[#c6deed] bg-[#f8fbfe] px-4 py-3 text-sm text-[#48617c]">
              No debug reports found yet.
            </p>
          ) : (
            <div className="space-y-3">
              {snapshots.map((entry) => {
                const report = entry.capture.feedbackReport;
                const messageCount = entry.capture.session.messageCount;
                const quickReplyCount = entry.capture.ui.activeQuickReplies.length;

                return (
                  <details
                    key={entry.id}
                    className="rounded-lg border border-[#c6deed] bg-[#fbfdff] p-3"
                  >
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-[#0b315b]">
                            {report.description.slice(0, 110)}
                            {report.description.length > 110 ? "..." : ""}
                          </p>
                          <p className="text-xs text-[#48617c]">
                            Saved: {formatDate(entry.createdAt)}
                          </p>
                        </div>
                        <div className="text-xs text-[#48617c]">
                          user: {entry.userId} | messages: {messageCount} | active chips: {quickReplyCount}
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
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
