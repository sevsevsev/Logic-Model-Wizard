import { Pool } from "pg";
import type { KnowledgeChunk, RetrievedChunk } from "@/lib/rag/types";

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getDatabaseUrl(): string | null {
  const value = process.env.DATABASE_URL?.trim();
  return value ? value : null;
}

function isPostgresEnabled(): boolean {
  return Boolean(getDatabaseUrl());
}

function getPool(): Pool {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      max: 2,
    });
  }

  return pool;
}

function normalizeEmbedding(embedding: number[]): number[] {
  const mag = Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(mag) || mag === 0) return embedding;
  return embedding.map((value) => value / mag);
}

function embeddingToSqlLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export async function ensureVectorSchema(): Promise<void> {
  if (!isPostgresEnabled()) return;

  if (!schemaReady) {
    schemaReady = (async () => {
      const db = getPool();

      // pgvector extension may require superuser privileges; ignore failure and rely on fallback retrieval.
      try {
        await db.query("CREATE EXTENSION IF NOT EXISTS vector;");
      } catch {
        // noop
      }

      await db.query(`
        CREATE TABLE IF NOT EXISTS rag_knowledge_chunks (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          text_content TEXT NOT NULL,
          tags TEXT[] NOT NULL DEFAULT '{}',
          source TEXT NOT NULL,
          topic TEXT NOT NULL DEFAULT 'framework-foundation',
          embedding VECTOR(3072) NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // Migrate existing table if the column dimension is wrong (768 → 3072).
      try {
        await db.query(`
          ALTER TABLE rag_knowledge_chunks
            ALTER COLUMN embedding TYPE VECTOR(3072)
        `);
      } catch {
        // noop — table may not exist yet or already correct
      }

      // Migrate: add topic column if it does not exist yet.
      try {
        await db.query(`
          ALTER TABLE rag_knowledge_chunks
            ADD COLUMN IF NOT EXISTS topic TEXT NOT NULL DEFAULT 'framework-foundation'
        `);
      } catch {
        // noop
      }

      await db.query(
        "CREATE INDEX IF NOT EXISTS rag_knowledge_chunks_source_idx ON rag_knowledge_chunks (source);"
      );
      await db.query(
        "CREATE INDEX IF NOT EXISTS rag_knowledge_chunks_topic_idx ON rag_knowledge_chunks (topic);"
      );
    })();
  }

  await schemaReady;
}

export async function upsertVectorChunk(chunk: KnowledgeChunk, embedding: number[]): Promise<void> {
  if (!isPostgresEnabled()) return;
  await ensureVectorSchema();

  const db = getPool();
  const normalized = normalizeEmbedding(embedding);
  const embeddingLiteral = embeddingToSqlLiteral(normalized);

  await db.query(
    `
      INSERT INTO rag_knowledge_chunks (id, title, text_content, tags, source, topic, embedding, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7::vector, NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        title = EXCLUDED.title,
        text_content = EXCLUDED.text_content,
        tags = EXCLUDED.tags,
        source = EXCLUDED.source,
        topic = EXCLUDED.topic,
        embedding = EXCLUDED.embedding,
        updated_at = NOW()
    `,
    [chunk.id, chunk.title, chunk.text, chunk.tags, chunk.source, chunk.topic ?? "framework-foundation", embeddingLiteral]
  );
}

export async function queryVectorChunks(
  embedding: number[],
  topK: number,
  source?: string
): Promise<RetrievedChunk[]> {
  if (!isPostgresEnabled()) return [];
  await ensureVectorSchema();

  const db = getPool();
  const normalized = normalizeEmbedding(embedding);
  const embeddingLiteral = embeddingToSqlLiteral(normalized);

  type VectorRow = {
    id: string;
    title: string;
    text_content: string;
    tags: string[];
    source: "knowledge-base";
    topic: string;
    similarity: number;
  };

  const result = source
    ? await db.query<VectorRow>(
        `
          SELECT id, title, text_content, tags, source, topic,
                 1 - (embedding <=> $1::vector) AS similarity
          FROM rag_knowledge_chunks
          WHERE source = $2
          ORDER BY embedding <=> $1::vector ASC
          LIMIT $3
        `,
        [embeddingLiteral, source, topK]
      )
    : await db.query<VectorRow>(
        `
          SELECT id, title, text_content, tags, source, topic,
                 1 - (embedding <=> $1::vector) AS similarity
          FROM rag_knowledge_chunks
          ORDER BY embedding <=> $1::vector ASC
          LIMIT $2
        `,
        [embeddingLiteral, topK]
      );

  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    text: row.text_content,
    tags: row.tags,
    source: row.source,
    topic: (row.topic ?? "framework-foundation") as import("@/lib/rag/types").KnowledgeChunkTopic,
    score: Number.isFinite(row.similarity) ? row.similarity : 0,
  }));
}

export async function countVectorChunks(): Promise<number> {
  if (!isPostgresEnabled()) return 0;
  await ensureVectorSchema();
  const db = getPool();
  const result = await db.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM rag_knowledge_chunks");
  return Number.parseInt(result.rows[0]?.count ?? "0", 10) || 0;
}
