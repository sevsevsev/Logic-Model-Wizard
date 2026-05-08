import type { KnowledgeChunk, KnowledgeChunkTopic } from "@/lib/rag/types";

export function chunkPlainText(
  text: string,
  sourcePrefix: string,
  maxChars = 450,
  topic: KnowledgeChunkTopic = "framework-foundation"
): KnowledgeChunk[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const chunks: KnowledgeChunk[] = [];
  let index = 0;
  for (let start = 0; start < cleaned.length; start += maxChars) {
    const end = Math.min(cleaned.length, start + maxChars);
    chunks.push({
      id: `${sourcePrefix}-${index + 1}`,
      title: `Chunk ${index + 1}`,
      text: cleaned.slice(start, end),
      tags: ["imported"],
      source: "knowledge-base",
      topic,
    });
    index += 1;
  }

  return chunks;
}
