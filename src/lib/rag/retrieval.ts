import { KNOWLEDGE_CHUNKS } from "@/lib/rag/source";
import { embedText } from "@/lib/rag/embeddings";
import { queryVectorChunks } from "@/lib/rag/vectorStore";
import type { RetrievedChunk } from "@/lib/rag/types";

export interface RetrievalOptions {
  userId?: string;
}

export interface RetrievalTrace {
  mode: "vector" | "keyword";
  reason:
    | "vector_disabled"
    | "missing_runtime_config"
    | "empty_embedding"
    | "vector_error"
    | "vector_no_matches"
    | "keyword_success"
    | "vector_success";
  topK: number;
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  trace: RetrievalTrace;
}

// Prefer vector retrieval by default; allow explicit opt-out with ENABLE_RAG_RETRIEVAL=false.
const ENABLE_RAG_RETRIEVAL = process.env.ENABLE_RAG_RETRIEVAL !== "false";

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
}

function scoreChunk(queryTokens: Set<string>, chunkText: string, tags: string[]): number {
  const haystack = new Set([...tokenize(chunkText), ...tags.map((t) => t.toLowerCase())]);
  let score = 0;
  for (const token of queryTokens) {
    if (haystack.has(token)) score += 1;
  }
  return score;
}

function retrieveKnowledgeKeyword(query: string, topK = 5): RetrievedChunk[] {
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) {
    return KNOWLEDGE_CHUNKS.slice(0, topK).map((chunk) => ({ ...chunk, score: 0 }));
  }

  return KNOWLEDGE_CHUNKS
    .map((chunk) => ({
      ...chunk,
      score: scoreChunk(queryTokens, chunk.text, chunk.tags),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export async function retrieveKnowledgeWithTrace(
  query: string,
  topK = 5,
  options?: RetrievalOptions
): Promise<RetrievalResult> {
  if (!ENABLE_RAG_RETRIEVAL) {
    return {
      chunks: retrieveKnowledgeKeyword(query, topK),
      trace: { mode: "keyword", reason: "vector_disabled", topK },
    };
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!apiKey || !databaseUrl) {
    return {
      chunks: retrieveKnowledgeKeyword(query, topK),
      trace: { mode: "keyword", reason: "missing_runtime_config", topK },
    };
  }

  try {
    const embedding = await embedText(apiKey, query);
    if (!embedding || embedding.length === 0) {
      return {
        chunks: retrieveKnowledgeKeyword(query, topK),
        trace: { mode: "keyword", reason: "empty_embedding", topK },
      };
    }

    const knowledgeBaseResults = await queryVectorChunks(embedding, topK, {
      source: "knowledge-base",
    });

    const userResults = options?.userId
      ? await queryVectorChunks(embedding, topK, {
          source: "user-upload",
          userId: options.userId,
        })
      : [];

    const merged = [...userResults, ...knowledgeBaseResults]
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    if (merged.length > 0) {
      return {
        chunks: merged,
        trace: { mode: "vector", reason: "vector_success", topK },
      };
    }
  } catch {
    return {
      chunks: retrieveKnowledgeKeyword(query, topK),
      trace: { mode: "keyword", reason: "vector_error", topK },
    };
  }

  return {
    chunks: retrieveKnowledgeKeyword(query, topK),
    trace: { mode: "keyword", reason: "vector_no_matches", topK },
  };
}

export async function retrieveKnowledge(
  query: string,
  topK = 5,
  options?: RetrievalOptions
): Promise<RetrievedChunk[]> {
  const result = await retrieveKnowledgeWithTrace(query, topK, options);
  return result.chunks;
}
