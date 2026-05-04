import type {
  ChatMessage,
  LogicModel,
  LogicModelDraft,
} from "@/store/useLogicModelStore";

export const DRAFT_SCHEMA_VERSION = 1;
export const LOCAL_DRAFT_STORAGE_KEY = "logic-model-wizard:draft:v1";
export const LOCAL_CLOUD_USER_KEY = "logic-model-wizard:cloud-user-id";
export const LOCAL_CLOUD_DRAFT_ID_KEY = "logic-model-wizard:cloud-draft-id";

export interface PersistedDraft {
  schemaVersion: number;
  savedAt: string;
  draft: LogicModelDraft;
}

export interface CloudDraftRecord extends PersistedDraft {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function isChatMessageArray(value: unknown): value is ChatMessage[] {
  return (
    Array.isArray(value) &&
    value.every(
      (m) =>
        m &&
        typeof m === "object" &&
        typeof m.id === "string" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        typeof m.timestamp === "number"
    )
  );
}

export function isValidLogicModel(value: unknown): value is LogicModel {
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
    return (
      activity &&
      typeof activity.category === "string" &&
      isStringArray(activity.actions) &&
      isStringArray(activity.outputs)
    );
  });

  return (
    typeof intended.population === "string" &&
    typeof intended.geography === "string" &&
    typeof intended.long_term_goal === "string" &&
    typeof intended.compiled_statement === "string" &&
    isStringArray(resources.human) &&
    isStringArray(resources.material) &&
    isStringArray(resources.financial) &&
    isStringArray(resources.knowledge) &&
    activitiesAreValid &&
    isStringArray(outcomes.short_term) &&
    isStringArray(outcomes.medium_term) &&
    isStringArray(outcomes.long_term)
  );
}

export function isValidPersistedDraft(value: unknown): value is PersistedDraft {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const draft = v.draft as Record<string, unknown> | undefined;

  return (
    typeof v.schemaVersion === "number" &&
    typeof v.savedAt === "string" &&
    !!draft &&
    isValidLogicModel(draft.model) &&
    isChatMessageArray(draft.messages)
  );
}

export function createPersistedDraft(draft: LogicModelDraft): PersistedDraft {
  return {
    schemaVersion: DRAFT_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    draft,
  };
}
