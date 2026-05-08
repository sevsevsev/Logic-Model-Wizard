import { KNOWLEDGE_CHUNKS } from "@/lib/rag/source";
import { embedText } from "@/lib/rag/embeddings";
import { countVectorChunks, upsertVectorChunk } from "@/lib/rag/vectorStore";

export type KnowledgeIngestResult = {
  inserted: number;
  total: number;
  skippedEmptyEmbeddings: number;
  failedEmbeddings: number;
  failedUpserts: number;
  dbConfigured: boolean;
};

export async function ingestKnowledgeChunks(): Promise<KnowledgeIngestResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required to ingest vector knowledge.");
  }

  let inserted = 0;
  let skippedEmptyEmbeddings = 0;
  let failedEmbeddings = 0;
  let failedUpserts = 0;

  for (const chunk of KNOWLEDGE_CHUNKS) {
    let embedding: number[] | null;
    try {
      embedding = await embedText(apiKey, `${chunk.title}\n${chunk.text}`);
    } catch {
      failedEmbeddings += 1;
      continue;
    }

    if (!embedding || embedding.length === 0) {
      skippedEmptyEmbeddings += 1;
      continue;
    }

    try {
      await upsertVectorChunk(chunk, embedding);
      inserted += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[ingest] Upsert failed for chunk "${chunk.id}":`, err instanceof Error ? err.message : err);
      failedUpserts += 1;
    }
  }

  const total = await countVectorChunks();
  return {
    inserted,
    total,
    skippedEmptyEmbeddings,
    failedEmbeddings,
    failedUpserts,
    dbConfigured: Boolean(process.env.DATABASE_URL?.trim()),
  };
}
