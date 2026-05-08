import { createHash } from "crypto";
import { chunkPlainText } from "@/lib/rag/chunking";
import { embedText } from "@/lib/rag/embeddings";
import { upsertVectorChunk, deleteExpiredUserChunks } from "@/lib/rag/vectorStore";

/** Default TTL in days for user-uploaded document chunks. */
const USER_CHUNK_TTL_DAYS = 30;

export interface UserDocumentInput {
  userId: string;
  fileName: string;
  text: string;
}

export interface UserDocumentIngestResult {
  userId: string;
  docId: string;
  chunksAttempted: number;
  chunksUpserted: number;
  failedEmbeddings: number;
  failedUpserts: number;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
}

function buildDocId(userId: string, fileName: string, text: string): string {
  const digest = createHash("sha1").update(`${userId}|${fileName}|${text}`).digest("hex").slice(0, 12);
  return `doc-${digest}`;
}

export async function ingestUserDocument(input: UserDocumentInput): Promise<UserDocumentIngestResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required to ingest user documents.");
  }

  const userId = input.userId.trim();
  if (!userId) {
    throw new Error("userId is required to ingest user documents.");
  }

  const normalizedText = input.text.replace(/\s+/g, " ").trim();
  if (!normalizedText) {
    throw new Error("Document text is empty.");
  }

  // Opportunistically purge expired user chunks on every ingest (non-fatal).
  deleteExpiredUserChunks(USER_CHUNK_TTL_DAYS).catch(() => undefined);

  const docId = buildDocId(userId, input.fileName, normalizedText);
  const prefix = `user-${slug(userId)}-${docId}`;
  const chunks = chunkPlainText(normalizedText, prefix, 600, "framework-foundation", "user-upload");

  let chunksUpserted = 0;
  let failedEmbeddings = 0;
  let failedUpserts = 0;

  for (const chunk of chunks) {
    let embedding: number[] | null;
    try {
      embedding = await embedText(apiKey, `${input.fileName}\n${chunk.text}`);
    } catch {
      failedEmbeddings += 1;
      continue;
    }

    if (!embedding || embedding.length === 0) {
      failedEmbeddings += 1;
      continue;
    }

    try {
      await upsertVectorChunk(
        {
          ...chunk,
          title: `${input.fileName} — ${chunk.title}`,
          tags: ["user-upload", `file:${input.fileName}`],
        },
        embedding,
        {
          userId,
          docId,
        }
      );
      chunksUpserted += 1;
    } catch {
      failedUpserts += 1;
    }
  }

  return {
    userId,
    docId,
    chunksAttempted: chunks.length,
    chunksUpserted,
    failedEmbeddings,
    failedUpserts,
  };
}
