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

/** Skill relevance metadata for skill-informed retrieval */
export interface SkillRelevanceMetadata {
  /** Skills that find this chunk relevant */
  skillRelevance?: string[];
  /** Specific skill gap this chunk addresses */
  skillGap?: string;
  /** Type of content: example, guidance, anti-pattern, etc. */
  type?: "example" | "guidance" | "anti_pattern" | "reference";
  /** Component focus (e.g., "population", "geography", "activities") */
  componentFocus?: string;
  /** Specificity level of the content */
  specificity?: "high" | "medium" | "low";
  /** Quality score for the content (0-10) */
  qualityScore?: number;
  /** Whether this is a preferred/trusted source */
  preferredSource?: boolean;
  /** Canonical domain from ImpactED framework */
  canonicalDomain?: string;
}

export interface KnowledgeChunk {
  id: string;
  title: string;
  text: string;
  tags: string[];
  source: KnowledgeSource;
  topic: KnowledgeChunkTopic;
  /** Optional skill relevance metadata for skill-informed retrieval */
  skillMetadata?: SkillRelevanceMetadata;
}

export interface RetrievedChunk extends KnowledgeChunk {
  score: number;
  metadata?: Record<string, unknown>;
}
