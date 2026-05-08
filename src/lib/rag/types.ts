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

export interface KnowledgeChunk {
  id: string;
  title: string;
  text: string;
  tags: string[];
  source: "knowledge-base";
  topic: KnowledgeChunkTopic;
}

export interface RetrievedChunk extends KnowledgeChunk {
  score: number;
}
