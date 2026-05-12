import type { ChatMessage, LogicModel } from "@/store/useLogicModelStore";

export type FeedbackRating = "up" | "down";

export type ConceptCodingDecision = "direct-match" | "partial-match" | "weak-match" | "no-match";
export type ConceptCodingActionHint = "ask-clarifying-question" | "accept-and-continue" | "defer-and-revisit";
export type ConceptCodingVerdict = "confirmed" | "rejected" | "needs-review";

export interface ConceptCodingChunkLink {
  chunkId: string;
  title: string;
  topic: string;
  source: string;
  score: number;
  matchScore: number;
  decision: ConceptCodingDecision;
}

export interface ConceptCodingSpan {
  spanText: string;
  matchedChunks: ConceptCodingChunkLink[];
  rationale: string;
  actionHint: ConceptCodingActionHint;
}

export interface ConceptCodingTrace {
  queryText: string;
  spans: ConceptCodingSpan[];
  retrievedChunkIds: string[];
  unmatchedSpans: number;
}

export interface ConceptCodingReviewEntry {
  spanText: string;
  chunkId: string;
  verdict: ConceptCodingVerdict;
  reviewerNote?: string;
  reviewedAtIso: string;
}

export interface ConceptCodingReview {
  entries: ConceptCodingReviewEntry[];
}

export interface LlmTraceMeta {
  stateIntent?: string | null;
  initialIntent?: string | null;
  finalIntent?: string | null;
  resolutionSource?: string | null;
  contradictionFlags?: string[];
  questionPlan?: {
    shouldAsk?: boolean;
    targetField?: string | null;
    goal?: string | null;
    draftQuestion?: string | null;
    conceptualTopics?: string[];
  } | null;
  decisionSummary?: string | null;
  usedExtractionFallback?: boolean;
  usedHeuristicMerge?: boolean;
  routeRewritesEnabled?: boolean;
  conceptCoding?: ConceptCodingTrace | null;
}

export interface FeedbackCapture {
  assistantMessageId: string;
  assistantMessage: string;
  rating: FeedbackRating;
  reason?: string;
  comment?: string;
  precedingUserMessage?: string;
  history: ChatMessage[];
  modelSnapshot: LogicModel;
  submittedAt: string;
}

export interface StoredFeedbackRecord {
  id: string;
  userId: string;
  createdAt: string;
  capture: FeedbackCapture;
}

export interface DebugSnapshotCapture {
  schemaVersion: "logic-model-debug-snapshot-v1";
  exportedAtIso: string;
  exportedAtUnixMs: number;
  app: {
    name: string;
    runtime: string;
  };
  llm?: {
    recentCalls: Array<{
      atIso: string;
      model: string;
      path: "agentic" | "legacy" | "unknown";
      fallbackReason?: string | null;
      trace?: LlmTraceMeta;
    }>;
  };
  session: {
    userId: string | null;
    messageCount: number;
    assistantMessageCount: number;
    userMessageCount: number;
  };
  browser:
    | {
        userAgent: string;
        language: string;
        url: string;
        timeZone: string;
      }
    | null;
  ui: {
    isLoading: boolean;
    activeQuickReplies: unknown[];
  };
  model: LogicModel;
  messages: ChatMessage[];
  draftSnapshot: {
    model: LogicModel;
    messages: ChatMessage[];
  };
  feedbackReport: {
    description: string;
    capturedAtIso: string;
  };
  conceptCodingReview?: ConceptCodingReview;
  notes: string[];
}

export interface StoredDebugSnapshotRecord {
  id: string;
  userId: string;
  createdAt: string;
  addressedAt: string | null;
  capture: DebugSnapshotCapture;
}

export function isChatMessageArray(value: unknown): value is ChatMessage[] {
  return (
    Array.isArray(value) &&
    value.every(
      (m) =>
        m &&
        typeof m === "object" &&
        typeof (m as Record<string, unknown>).id === "string" &&
        ((m as Record<string, unknown>).role === "user" ||
          (m as Record<string, unknown>).role === "assistant") &&
        typeof (m as Record<string, unknown>).content === "string" &&
        typeof (m as Record<string, unknown>).timestamp === "number"
    )
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isValidLogicModel(value: unknown): value is LogicModel {
  if (!value || typeof value !== "object") return false;

  const v = value as Record<string, unknown>;
  const intended = v.intended_impact as Record<string, unknown> | undefined;
  const implementation = v.implementation as Record<string, unknown> | undefined;
  const outcomes = v.outcomes as Record<string, unknown> | undefined;

  if (!intended || !implementation || !outcomes) return false;

  const resources = implementation.resources as Record<string, unknown> | undefined;
  const activities = implementation.activities;

  if (!resources || !Array.isArray(activities)) return false;

  const activitiesAreValid = activities.every((a) => {
    const activity = a as Record<string, unknown>;
    const outputs = activity.outputs;
    const outputsAreValid =
      Array.isArray(outputs) &&
      outputs.every((o) => {
        if (!o || typeof o !== "object") return false;
        const output = o as Record<string, unknown>;
        return typeof output.text === "string";
      });

    return (
      activity &&
      typeof activity.item === "string" &&
      isStringArray(activity.actions) &&
      outputsAreValid
    );
  });

  const outcomesAreValid = (["short_term", "medium_term", "long_term"] as const).every((key) => {
    const bucket = outcomes[key];
    return (
      Array.isArray(bucket) &&
      bucket.every((entry) => {
        if (!entry || typeof entry !== "object") return false;
        const item = entry as Record<string, unknown>;
        return typeof item.statement === "string";
      })
    );
  });

  return (
    typeof intended.population === "string" &&
    typeof intended.geography === "string" &&
    typeof intended.long_term_goal === "string" &&
    typeof intended.compiled_statement === "string" &&
    Array.isArray(v.stakeholders) &&
    isStringArray(resources.human) &&
    isStringArray(resources.material) &&
    isStringArray(resources.financial) &&
    isStringArray(resources.knowledge) &&
    activitiesAreValid &&
    outcomesAreValid
  );
}

export function isValidFeedbackCapture(value: unknown): value is FeedbackCapture {
  if (!value || typeof value !== "object") return false;

  const v = value as Record<string, unknown>;

  return (
    typeof v.assistantMessageId === "string" &&
    v.assistantMessageId.trim().length > 0 &&
    typeof v.assistantMessage === "string" &&
    v.assistantMessage.trim().length > 0 &&
    (v.rating === "up" || v.rating === "down") &&
    (v.reason === undefined || typeof v.reason === "string") &&
    (v.comment === undefined || typeof v.comment === "string") &&
    (v.precedingUserMessage === undefined || typeof v.precedingUserMessage === "string") &&
    isChatMessageArray(v.history) &&
    isValidLogicModel(v.modelSnapshot) &&
    typeof v.submittedAt === "string"
  );
}

export function isValidDebugSnapshotCapture(value: unknown): value is DebugSnapshotCapture {
  if (!value || typeof value !== "object") return false;

  const v = value as Record<string, unknown>;
  const app = v.app as Record<string, unknown> | undefined;
  const session = v.session as Record<string, unknown> | undefined;
  const ui = v.ui as Record<string, unknown> | undefined;
  const feedbackReport = v.feedbackReport as Record<string, unknown> | undefined;
  const draftSnapshot = v.draftSnapshot as Record<string, unknown> | undefined;
  const browser = v.browser;
  const llm = v.llm as Record<string, unknown> | undefined;

  const browserIsValid =
    browser === null ||
    (
      typeof browser === "object" &&
      browser !== null &&
      typeof (browser as Record<string, unknown>).userAgent === "string" &&
      typeof (browser as Record<string, unknown>).language === "string" &&
      typeof (browser as Record<string, unknown>).url === "string" &&
      typeof (browser as Record<string, unknown>).timeZone === "string"
    );

  const draftIsValid =
    !!draftSnapshot &&
    isValidLogicModel(draftSnapshot.model) &&
    isChatMessageArray(draftSnapshot.messages);

  const llmIsValid =
    llm === undefined ||
    (
      typeof llm === "object" &&
      llm !== null &&
      Array.isArray(llm.recentCalls) &&
      llm.recentCalls.every((call) => {
        if (!call || typeof call !== "object") return false;
        const c = call as Record<string, unknown>;
        return (
          typeof c.atIso === "string" &&
          typeof c.model === "string" &&
          (c.path === "agentic" || c.path === "legacy" || c.path === "unknown") &&
          (c.fallbackReason === undefined || c.fallbackReason === null || typeof c.fallbackReason === "string") &&
          (c.trace === undefined || (typeof c.trace === "object" && c.trace !== null))
        );
      })
    );

  return (
    v.schemaVersion === "logic-model-debug-snapshot-v1" &&
    typeof v.exportedAtIso === "string" &&
    typeof v.exportedAtUnixMs === "number" &&
    !!app &&
    typeof app.name === "string" &&
    typeof app.runtime === "string" &&
    !!session &&
    (session.userId === null || typeof session.userId === "string") &&
    typeof session.messageCount === "number" &&
    typeof session.assistantMessageCount === "number" &&
    typeof session.userMessageCount === "number" &&
    browserIsValid &&
    !!ui &&
    typeof ui.isLoading === "boolean" &&
    Array.isArray(ui.activeQuickReplies) &&
    isValidLogicModel(v.model) &&
    isChatMessageArray(v.messages) &&
    draftIsValid &&
    llmIsValid &&
    !!feedbackReport &&
    typeof feedbackReport.description === "string" &&
    feedbackReport.description.trim().length >= 20 &&
    typeof feedbackReport.capturedAtIso === "string" &&
    Array.isArray(v.notes) &&
    v.notes.every((item) => typeof item === "string")
  );
}
