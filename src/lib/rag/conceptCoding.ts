import type { ConceptCodingChunkLink, ConceptCodingTrace } from "@/lib/feedback/types";
import type { RetrievedChunk } from "@/lib/rag/types";

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function sentenceSplit(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 6);
}

function overlapScore(spanTokens: Set<string>, chunk: RetrievedChunk): number {
  const chunkTokens = new Set([
    ...tokenize(chunk.title),
    ...tokenize(chunk.text),
    ...chunk.tags.flatMap((tag) => tokenize(tag)),
    ...tokenize(chunk.topic),
  ]);

  let overlap = 0;
  for (const token of spanTokens) {
    if (chunkTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap;
}

function classifyDecision(matchScore: number): ConceptCodingChunkLink["decision"] {
  if (matchScore >= 5) return "direct-match";
  if (matchScore >= 3) return "partial-match";
  if (matchScore >= 1) return "weak-match";
  return "no-match";
}

function classifyActionHint(bestDecision: ConceptCodingChunkLink["decision"]) {
  if (bestDecision === "direct-match") return "accept-and-continue" as const;
  if (bestDecision === "partial-match") return "defer-and-revisit" as const;
  return "ask-clarifying-question" as const;
}

export function buildConceptCodingTrace(input: {
  userText: string;
  retrievedChunks: RetrievedChunk[];
  evidenceRefs?: string[];
}): ConceptCodingTrace {
  const spans = sentenceSplit(input.userText);
  const evidenceRefSet = new Set((input.evidenceRefs ?? []).map((id) => id.trim()));
  const candidateChunks =
    evidenceRefSet.size > 0
      ? input.retrievedChunks.filter((chunk) => evidenceRefSet.has(chunk.id))
      : input.retrievedChunks;

  const spanRows = spans.map((spanText) => {
    const spanTokens = new Set(tokenize(spanText));

    const matchedChunks: ConceptCodingChunkLink[] = candidateChunks
      .map((chunk) => {
        const matchScore = overlapScore(spanTokens, chunk);
        return {
          chunkId: chunk.id,
          title: chunk.title,
          topic: chunk.topic,
          source: chunk.source,
          score: chunk.score,
          matchScore,
          decision: classifyDecision(matchScore),
        };
      })
      .sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        return b.score - a.score;
      })
      .slice(0, 3);

    const top = matchedChunks[0];
    const topDecision = top?.decision ?? "no-match";
    const actionHint = classifyActionHint(topDecision);
    const rationale =
      top && top.matchScore > 0
        ? `Top match selected by overlap (${top.matchScore}) and retrieval score (${top.score.toFixed(3)}).`
        : "No strong conceptual overlap detected; clarification is recommended.";

    return {
      spanText,
      matchedChunks,
      rationale,
      actionHint,
    };
  });

  const unmatchedSpans = spanRows.filter(
    (row) => row.matchedChunks.length === 0 || row.matchedChunks[0].decision === "no-match"
  ).length;

  return {
    queryText: input.userText,
    spans: spanRows,
    retrievedChunkIds: input.retrievedChunks.map((chunk) => chunk.id),
    unmatchedSpans,
  };
}
