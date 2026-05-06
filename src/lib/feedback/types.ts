import type { ChatMessage, LogicModel } from "@/store/useLogicModelStore";

export type FeedbackRating = "up" | "down";

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
