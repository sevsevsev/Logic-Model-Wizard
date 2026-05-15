import { Pool } from "pg";
import type { KnowledgeChunk, KnowledgeSource, RetrievedChunk } from "@/lib/rag/types";

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

export interface UpsertVectorChunkOptions {
  userId?: string;
  docId?: string;
}

export interface VectorQueryOptions {
  source?: KnowledgeSource;
  userId?: string;
}

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

  const connectionTimeoutMillis = Number.parseInt(process.env.PG_CONNECTION_TIMEOUT_MS ?? "3000", 10);
  const queryTimeoutMillis = Number.parseInt(process.env.PG_QUERY_TIMEOUT_MS ?? "5000", 10);

  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      max: 2,
      connectionTimeoutMillis: Number.isFinite(connectionTimeoutMillis) && connectionTimeoutMillis > 0 ? connectionTimeoutMillis : 3000,
      query_timeout: Number.isFinite(queryTimeoutMillis) && queryTimeoutMillis > 0 ? queryTimeoutMillis : 5000,
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

      // Migrate: add optional user/doc ownership metadata for uploaded user corpus.
      try {
        await db.query(`
          ALTER TABLE rag_knowledge_chunks
            ADD COLUMN IF NOT EXISTS user_id TEXT
        `);
      } catch {
        // noop
      }

      try {
        await db.query(`
          ALTER TABLE rag_knowledge_chunks
            ADD COLUMN IF NOT EXISTS doc_id TEXT
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
      await db.query(
        "CREATE INDEX IF NOT EXISTS rag_knowledge_chunks_user_source_idx ON rag_knowledge_chunks (user_id, source);"
      );
      await db.query(
        "CREATE INDEX IF NOT EXISTS rag_knowledge_chunks_doc_idx ON rag_knowledge_chunks (doc_id);"
      );
    })();
  }

  await schemaReady;
}

export async function upsertVectorChunk(
  chunk: KnowledgeChunk,
  embedding: number[],
  options?: UpsertVectorChunkOptions
): Promise<void> {
  if (!isPostgresEnabled()) return;
  await ensureVectorSchema();

  const db = getPool();
  const normalized = normalizeEmbedding(embedding);
  const embeddingLiteral = embeddingToSqlLiteral(normalized);

  await db.query(
    `
      INSERT INTO rag_knowledge_chunks (id, title, text_content, tags, source, topic, user_id, doc_id, embedding, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector, NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        title = EXCLUDED.title,
        text_content = EXCLUDED.text_content,
        tags = EXCLUDED.tags,
        source = EXCLUDED.source,
        topic = EXCLUDED.topic,
        user_id = EXCLUDED.user_id,
        doc_id = EXCLUDED.doc_id,
        embedding = EXCLUDED.embedding,
        updated_at = NOW()
    `,
    [
      chunk.id,
      chunk.title,
      chunk.text,
      chunk.tags,
      chunk.source,
      chunk.topic ?? "framework-foundation",
      options?.userId ?? null,
      options?.docId ?? null,
      embeddingLiteral,
    ]
  );
}

export async function queryVectorChunks(
  embedding: number[],
  topK: number,
  sourceOrOptions?: KnowledgeSource | VectorQueryOptions
): Promise<RetrievedChunk[]> {
  if (!isPostgresEnabled()) return [];
  await ensureVectorSchema();

  const db = getPool();
  const normalized = normalizeEmbedding(embedding);
  const embeddingLiteral = embeddingToSqlLiteral(normalized);

  const options: VectorQueryOptions =
    typeof sourceOrOptions === "string" ? { source: sourceOrOptions } : sourceOrOptions ?? {};

  type VectorRow = {
    id: string;
    title: string;
    text_content: string;
    tags: string[];
    source: KnowledgeSource;
    topic: string;
    similarity: number;
  };

  let result;

  if (options.source && options.userId) {
    result = await db.query<VectorRow>(
      `
        SELECT id, title, text_content, tags, source, topic,
               1 - (embedding <=> $1::vector) AS similarity
        FROM rag_knowledge_chunks
        WHERE source = $2 AND user_id = $3
        ORDER BY embedding <=> $1::vector ASC
        LIMIT $4
      `,
      [embeddingLiteral, options.source, options.userId, topK]
    );
  } else if (options.source) {
    result = await db.query<VectorRow>(
      `
        SELECT id, title, text_content, tags, source, topic,
               1 - (embedding <=> $1::vector) AS similarity
        FROM rag_knowledge_chunks
        WHERE source = $2
        ORDER BY embedding <=> $1::vector ASC
        LIMIT $3
      `,
      [embeddingLiteral, options.source, topK]
    );
  } else {
    result = await db.query<VectorRow>(
      `
        SELECT id, title, text_content, tags, source, topic,
               1 - (embedding <=> $1::vector) AS similarity
        FROM rag_knowledge_chunks
        ORDER BY embedding <=> $1::vector ASC
        LIMIT $2
      `,
      [embeddingLiteral, topK]
    );
  }

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

/** Delete all uploaded chunks for a user, or only chunks belonging to a specific document. */
export async function deleteUserChunks(userId: string, docId?: string): Promise<number> {
  if (!isPostgresEnabled()) return 0;
  await ensureVectorSchema();
  const db = getPool();

  let result;
  if (docId) {
    result = await db.query<{ count: string }>(
      `DELETE FROM rag_knowledge_chunks WHERE user_id = $1 AND doc_id = $2 AND source = 'user-upload'`,
      [userId, docId]
    );
  } else {
    result = await db.query<{ count: string }>(
      `DELETE FROM rag_knowledge_chunks WHERE user_id = $1 AND source = 'user-upload'`,
      [userId]
    );
  }

  return result.rowCount ?? 0;
}

export interface UserDocSummary {
  docId: string;
  title: string;
  updatedAt: string;
  chunkCount: number;
}

/** List all documents a user has uploaded, with their most-recent update timestamp. */
export async function listUserDocs(userId: string): Promise<UserDocSummary[]> {
  if (!isPostgresEnabled()) return [];
  await ensureVectorSchema();
  const db = getPool();

  const result = await db.query<{ doc_id: string; title: string; updated_at: Date; chunk_count: string }>(
    `
      SELECT
        doc_id,
        MIN(title) AS title,
        MAX(updated_at) AS updated_at,
        COUNT(*)::text AS chunk_count
      FROM rag_knowledge_chunks
      WHERE user_id = $1 AND source = 'user-upload'
      GROUP BY doc_id
      ORDER BY MAX(updated_at) DESC
    `,
    [userId]
  );

  return result.rows.map((row) => ({
    docId: row.doc_id,
    title: row.title,
    updatedAt: row.updated_at.toISOString(),
    chunkCount: Number.parseInt(row.chunk_count, 10) || 0,
  }));
}

/**
 * Delete user-upload chunks that have not been updated within the given number of days.
 * Runs opportunistically on each ingest to prevent unbounded DB growth.
 * Returns the number of chunks deleted.
 */
export async function deleteExpiredUserChunks(maxAgeDays = 30): Promise<number> {
  if (!isPostgresEnabled()) return 0;
  await ensureVectorSchema();
  const db = getPool();

  const result = await db.query(
    `DELETE FROM rag_knowledge_chunks
     WHERE source = 'user-upload'
       AND updated_at < NOW() - ($1 || ' days')::INTERVAL`,
    [maxAgeDays]
  );

  return result.rowCount ?? 0;
}
