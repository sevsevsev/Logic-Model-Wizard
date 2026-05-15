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
  metadataRerankEnabled?: boolean;
  scoringDiagnostics?: Array<{
    chunkId: string;
    source: string;
    topic: string;
    rawScore: number;
    metadataBoost: number;
    finalScore: number;
    qualityScore?: number;
    sourceWeight?: number;
    preferredSource?: boolean;
    canonicalDomain?: string;
    queryDomain?: string | null;
    domainMatch?: boolean;
  }>;
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  trace: RetrievalTrace;
}

// Prefer vector retrieval by default; allow explicit opt-out with ENABLE_RAG_RETRIEVAL=false.
const ENABLE_RAG_RETRIEVAL = process.env.ENABLE_RAG_RETRIEVAL !== "false";
const ENABLE_METADATA_RERANK = process.env.ENABLE_METADATA_RERANK !== "false";

const SOURCE_WEIGHT_KEYS = [
  "sourceWeight",
  "source_weight",
  "priorityWeight",
  "priority_weight",
  "retrievalWeight",
  "retrieval_weight",
  "weight",
] as const;

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function inferCanonicalDomain(query: string): string | null {
  const lower = query.toLowerCase();
  if (/impact|intended impact|population|geography|north star|mission/.test(lower)) {
    return "intended impact";
  }
  if (/resource|staff|funding|material|knowledge|input/.test(lower)) {
    return "resources (inputs)";
  }
  if (/activit|strategy|delivery|session|workshop/.test(lower)) {
    return "activities";
  }
  if (/output|metric|dosage|reach/.test(lower)) {
    return "outputs";
  }
  if (/outcome|short term|medium term|long term/.test(lower)) {
    return "outcomes";
  }
  return null;
}

function extractSourceWeight(metadata: Record<string, unknown> | undefined): number {
  if (!metadata) return 0;
  for (const key of SOURCE_WEIGHT_KEYS) {
    const value = toFiniteNumber(metadata[key]);
    if (value !== null) {
      return Math.max(-2, Math.min(2, value));
    }
  }
  return 0;
}

function computeMetadataFeatures(chunk: RetrievedChunk, query: string): {
  metadataBoost: number;
  qualityScore?: number;
  sourceWeight?: number;
  preferredSource?: boolean;
  canonicalDomain?: string;
  queryDomain?: string | null;
  domainMatch?: boolean;
} {
  const metadata = chunk.metadata;
  let metadataBoost = 0;
  let qualityScore: number | undefined;
  let sourceWeight: number | undefined;
  let preferredSource: boolean | undefined;
  let canonicalDomain: string | undefined;
  let queryDomain: string | null | undefined;
  let domainMatch: boolean | undefined;

  if (metadata) {
    // Source-priority weighting from metadata lets trusted corpus items outrank peers.
    sourceWeight = extractSourceWeight(metadata);
    metadataBoost += sourceWeight * 0.05;

    const rawQuality = toFiniteNumber(metadata.qualityScore);
    if (rawQuality !== null) {
      qualityScore = Math.max(0, Math.min(10, rawQuality));
      const normalizedQuality = qualityScore / 10;
      metadataBoost += normalizedQuality * 0.04;
    }

    preferredSource = metadata.preferredSource === true;
    if (preferredSource) {
      metadataBoost += 0.04;
    }

    queryDomain = inferCanonicalDomain(query);
    canonicalDomain = typeof metadata.canonicalDomain === "string"
      ? metadata.canonicalDomain.trim().toLowerCase()
      : "";
    domainMatch = Boolean(queryDomain && canonicalDomain && canonicalDomain === queryDomain);
    if (domainMatch) {
      metadataBoost += 0.03;
    }
  }

  return {
    metadataBoost,
    qualityScore,
    sourceWeight,
    preferredSource,
    canonicalDomain,
    queryDomain,
    domainMatch,
  };
}

function rerankByMetadata(
  chunks: RetrievedChunk[],
  query: string,
  topK: number
): {
  chunks: RetrievedChunk[];
  diagnostics: RetrievalTrace["scoringDiagnostics"];
} {
  if (!ENABLE_METADATA_RERANK || chunks.length <= 1) {
    return {
      chunks: chunks.slice(0, topK),
      diagnostics: chunks.slice(0, topK).map((chunk) => ({
        chunkId: chunk.id,
        source: chunk.source,
        topic: chunk.topic,
        rawScore: chunk.score,
        metadataBoost: 0,
        finalScore: chunk.score,
      })),
    };
  }

  const reranked = chunks
    .map((chunk) => {
      const features = computeMetadataFeatures(chunk, query);
      const finalScore = chunk.score + features.metadataBoost;
      return {
        chunk: {
          ...chunk,
          score: finalScore,
        },
        diagnostics: {
          chunkId: chunk.id,
          source: chunk.source,
          topic: chunk.topic,
          rawScore: chunk.score,
          metadataBoost: features.metadataBoost,
          finalScore,
          qualityScore: features.qualityScore,
          sourceWeight: features.sourceWeight,
          preferredSource: features.preferredSource,
          canonicalDomain: features.canonicalDomain,
          queryDomain: features.queryDomain,
          domainMatch: features.domainMatch,
        },
      };
    })
    .sort((a, b) => b.chunk.score - a.chunk.score)
    .slice(0, topK);

  return {
    chunks: reranked.map((entry) => entry.chunk),
    diagnostics: reranked.map((entry) => entry.diagnostics),
  };
}

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

    const reranked = rerankByMetadata(
      [...userResults, ...knowledgeBaseResults],
      query,
      topK
    );

    if (reranked.chunks.length > 0) {
      return {
        chunks: reranked.chunks,
        trace: {
          mode: "vector",
          reason: "vector_success",
          topK,
          metadataRerankEnabled: ENABLE_METADATA_RERANK,
          scoringDiagnostics: reranked.diagnostics,
        },
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
