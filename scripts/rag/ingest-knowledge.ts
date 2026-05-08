import { ingestKnowledgeChunks } from "@/lib/rag/ingest";

// .env.local is loaded by tsx via --env-file flag in package.json
async function main() {
  const result = await ingestKnowledgeChunks();
  // eslint-disable-next-line no-console
  console.log(
    [
      `Ingest complete. Upserted: ${result.inserted}, total chunks: ${result.total}`,
      `dbConfigured=${result.dbConfigured}`,
      `failedEmbeddings=${result.failedEmbeddings}`,
      `skippedEmptyEmbeddings=${result.skippedEmptyEmbeddings}`,
      `failedUpserts=${result.failedUpserts}`,
    ].join(" | ")
  );
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to ingest RAG knowledge:", error instanceof Error ? error.message : error);
  process.exit(1);
});
