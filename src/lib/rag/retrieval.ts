import { KNOWLEDGE_CHUNKS } from "@/lib/rag/source";
import { embedText } from "@/lib/rag/embeddings";
import { queryVectorChunks } from "@/lib/rag/vectorStore";
import type { RetrievedChunk } from "@/lib/rag/types";

export interface RetrievalOptions {
  userId?: string;
}

const ENABLE_RAG_RETRIEVAL = process.env.ENABLE_RAG_RETRIEVAL === "true";

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

export async function retrieveKnowledge(
  query: string,
  topK = 5,
  options?: RetrievalOptions
): Promise<RetrievedChunk[]> {
  if (!ENABLE_RAG_RETRIEVAL) {
    return retrieveKnowledgeKeyword(query, topK);
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!apiKey || !databaseUrl) {
    return retrieveKnowledgeKeyword(query, topK);
  }

  try {
    const embedding = await embedText(apiKey, query);
    if (!embedding || embedding.length === 0) {
      return retrieveKnowledgeKeyword(query, topK);
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
      return merged;
    }
  } catch {
    // Fall back to keyword retrieval on vector or embedding failures.
  }

  return retrieveKnowledgeKeyword(query, topK);
}
