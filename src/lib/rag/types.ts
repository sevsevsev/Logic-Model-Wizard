export type KnowledgeChunkTopic =
  | "framework-foundation"
  | "geography"
  | "population"
  | "intended-impact"
  | "resources"
  | "activities"
  | "outputs"
  | "outcomes"
  | "fidelity-quality"
  | "stakeholders"
  | "examples"
  | "errors-misconceptions";

export type KnowledgeSource = "knowledge-base" | "user-upload";

export interface KnowledgeChunk {
  id: string;
  title: string;
  text: string;
  tags: string[];
  source: KnowledgeSource;
  topic: KnowledgeChunkTopic;
}

export interface RetrievedChunk extends KnowledgeChunk {
  score: number;
}
