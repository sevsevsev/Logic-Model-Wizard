export interface AgentPolicyChunk {
  id: string;
  title: string;
  text: string;
  tags: string[];
}

const AGENT_POLICY_CHUNKS: AgentPolicyChunk[] = [
  {
    id: "policy-role-memory",
    title: "Use the turn brief as working memory",
    text: "Treat the turn brief as the authoritative working memory for this turn. Preserve confirmed facts unless the user explicitly revises them. Prefer building on known context instead of re-asking for it.",
    tags: ["role", "memory", "confirmed facts", "preserve context"],
  },
  {
    id: "policy-one-question",
    title: "Ask one focused next-step question",
    text: "Ask at most one focused question. Choose the next question based on the most important missing field or the next required phase, not by restarting the conversation from earlier steps.",
    tags: ["questioning", "sequencing", "one question", "phase"],
  },
  {
    id: "policy-patch-faithfulness",
    title: "Patch only what the user actually supplied",
    text: "Only write model_patch fields supported by the latest user turn, retrieved evidence, or explicitly confirmed prior state. If a field is ambiguous, leave it unchanged and ask a targeted follow-up instead of guessing.",
    tags: ["patch", "faithfulness", "ambiguity", "grounding"],
  },
  {
    id: "policy-no-known-fact-regression",
    title: "Avoid known-fact regressions",
    text: "Do not ask for population, geography, or long-term change again when those are already confirmed in the turn brief. If the user is refining wording, preserve the underlying field rather than replacing it with a malformed extraction.",
    tags: ["regression", "population", "geography", "long-term goal"],
  },
  {
    id: "policy-retrieval-usage",
    title: "Use retrieved knowledge as coaching support",
    text: "Use retrieved framework knowledge to sharpen coaching, examples, and distinctions. Do not treat retrieved guidance as user-confirmed project facts unless the user adopts it.",
    tags: ["retrieval", "knowledge", "coaching", "provenance"],
  },
  {
    id: "policy-review-before-advance",
    title: "Review before advancing past intended impact",
    text: "When population, geography, and long-term change are all present, synthesize the draft impact statement and confirm it before moving into resources or later sections.",
    tags: ["impact_review", "sequencing", "confirmation"],
  },
  {
    id: "policy-accept-partial-answers",
    title: "Accept and capture partial answers, then ask a targeted follow-up",
    text: "When a user provides a partial answer (e.g., only names the people involved but not funding or materials), capture what they gave and ask one specific follow-up about the most important missing piece. Do not re-ask the same open-ended question. Acknowledge what was shared before asking for more.",
    tags: ["partial", "resources", "activities", "outcomes", "follow-up", "incomplete"],
  },
  {
    id: "policy-extract-from-context",
    title: "Extract model facts from conversational phrasing",
    text: "Users often provide model facts in plain language rather than structured form. Extract resources from phrases like 'we need volunteers' or 'program staff', extract activities from phrases like 'we run workshops' or 'we provide tutoring', and extract outcomes from phrases like 'students gain skills' or 'families become stable'. Always populate model_patch with what the user stated, even if phrased informally.",
    tags: ["extraction", "heuristic", "resources", "activities", "outcomes", "informal"],
  },
  {
    id: "policy-advance-on-any-resource-answer",
    title: "Advance past resources when at least one bucket is captured",
    text: "Resources do not need to be exhaustive to move forward. If the user has named at least one person, material, funding source, or type of expertise, capture it and either ask about one specific missing bucket or advance to activities. Do not stay stuck on the same resources question if the user has already responded.",
    tags: ["resources", "sequencing", "advance", "partial", "loop"],
  },
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

export function retrieveAgentPolicy(query: string, topK = 3): AgentPolicyChunk[] {
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) {
    return AGENT_POLICY_CHUNKS.slice(0, topK);
  }

  return AGENT_POLICY_CHUNKS
    .map((chunk) => {
      const haystack = new Set([...tokenize(chunk.title), ...tokenize(chunk.text), ...chunk.tags.map((tag) => tag.toLowerCase())]);
      let score = 0;
      for (const token of queryTokens) {
        if (haystack.has(token)) score += 1;
      }
      return { chunk, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ chunk }) => chunk);
}

export function formatAgentPolicy(chunks: AgentPolicyChunk[]): string {
  return chunks.map((chunk) => `- [${chunk.id}] ${chunk.title}: ${chunk.text}`).join("\n");
}