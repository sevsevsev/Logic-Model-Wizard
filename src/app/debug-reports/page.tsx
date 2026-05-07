import { listAllDebugSnapshots } from "@/lib/server/cloudDraftStore";
import { DebugReportsList } from "@/components/DebugReportsList";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
          <DebugReportsList snapshots={snapshots} />
        </div>
      </div>
    </main>
  );
}
