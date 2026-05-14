/**
 * Transcript management for conversation-based model extraction.
 * Stores raw conversation turns, enabling analysis pass to extract structure.
 */

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  domain?: string; // Response domain for assistant turns
}

export interface ConversationTranscript {
  turns: ConversationTurn[];
  /** Questions already asked by the agent (to avoid repetition) */
  questionsAsked: Array<{ domain: string; askedAtTurn: number }>;
  /** Topics covered so far */
  topicsCovered: string[];
}

/**
 * Add a turn to the transcript.
 */
export function addTurn(
  transcript: ConversationTranscript,
  role: "user" | "assistant",
  content: string | null | undefined,
  domain?: string
): ConversationTranscript {
  if (!content?.trim()) return transcript;
  return {
    ...transcript,
    turns: [
      ...transcript.turns,
      {
        role,
        content,
        timestamp: Date.now(),
        domain,
      },
    ],
  };
}

/**
 * Track a question the agent asked (prevents repetition).
 */
export function recordQuestionAsked(
  transcript: ConversationTranscript,
  domain: string
): ConversationTranscript {
  return {
    ...transcript,
    questionsAsked: [
      ...transcript.questionsAsked,
      { domain, askedAtTurn: transcript.turns.length },
    ],
  };
}

/**
 * Get all user messages in order.
 */
export function getUserMessages(transcript: ConversationTranscript): string[] {
  return transcript.turns
    .filter((t) => t.role === "user")
    .map((t) => t.content);
}

/**
 * Get the full conversation as a string (for LLM analysis).
 */
export function transcriptToString(transcript: ConversationTranscript): string {
  return transcript.turns
    .map((turn) => `${turn.role === "user" ? "User" : "Agent"}: ${turn.content}`)
    .join("\n\n");
}

/**
 * Check if a topic has been covered.
 */
export function hasTopicBeenCovered(
  transcript: ConversationTranscript,
  topic: string
): boolean {
  return transcript.topicsCovered.some((entry) => entry.toLowerCase() === topic.toLowerCase());
}

/**
 * Normalizes potentially stale/partial transcript payloads from clients.
 */
export function normalizeTranscript(value: unknown): ConversationTranscript {
  if (!value || typeof value !== "object") {
    return createEmptyTranscript();
  }

  const raw = value as {
    turns?: Array<Partial<ConversationTurn>>;
    questionsAsked?: Array<{ domain?: unknown; askedAtTurn?: unknown }>;
    topicsCovered?: unknown;
  };

  const turns: ConversationTurn[] = Array.isArray(raw.turns)
    ? raw.turns
        .filter((turn): turn is Partial<ConversationTurn> => Boolean(turn && typeof turn === "object"))
        .map<ConversationTurn>((turn) => ({
          role: (turn.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
          content: typeof turn.content === "string" ? turn.content : "",
          timestamp: typeof turn.timestamp === "number" ? turn.timestamp : Date.now(),
          domain: typeof turn.domain === "string" ? turn.domain : undefined,
        }))
        .filter((turn) => turn.content.trim().length > 0)
    : [];

  const questionsAsked = Array.isArray(raw.questionsAsked)
    ? raw.questionsAsked
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => ({
          domain: typeof entry.domain === "string" ? entry.domain : "",
          askedAtTurn: typeof entry.askedAtTurn === "number" ? entry.askedAtTurn : turns.length,
        }))
        .filter((entry) => entry.domain.length > 0)
    : [];

  const topicsCovered = Array.isArray(raw.topicsCovered)
    ? raw.topicsCovered.filter((topic): topic is string => typeof topic === "string")
    : [];

  return {
    turns,
    questionsAsked,
    topicsCovered,
  };
}

/**
 * Create a new empty transcript.
 */
export function createEmptyTranscript(): ConversationTranscript {
  return {
    turns: [],
    questionsAsked: [],
    topicsCovered: [],
  };
}
