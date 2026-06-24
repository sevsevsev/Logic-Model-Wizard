import ConceptMapExplorer from "@/components/ConceptMapExplorer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ConceptMapPage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7fbff_0,#eef4f9_100%)] px-4 py-6">
      <div className="mx-auto max-w-6xl">
        <ConceptMapExplorer />
      </div>
    </main>
  );
}
