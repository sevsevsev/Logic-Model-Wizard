import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { AgentRevisionLifecycle, AgentRevisionProposal } from "@/lib/agent/types";
import type { ConversationTranscript } from "@/lib/chat/transcript";
import { createEmptyTranscript } from "@/lib/chat/transcript";

// ---------------------------------------------------------------------------
// Domain types — mirror schema-definition.json
// ---------------------------------------------------------------------------

export interface Resource {
  human: string[];
  material: string[];
  financial: string[];
  knowledge: string[];
}

export interface Stakeholder {
  id: string;
  label: string;
  type?: string;
}

export interface Activity {
  item: string;
  category?: string;
  actions: string[];
  outputs: Array<{ text: string; category?: string }>;
  stakeholderIds?: string[];
}

export interface OutcomeEntry {
  statement: string;
  stakeholderIds?: string[];
}

export interface Implementation {
  resources: Resource;
  activities: Activity[];
  outputs_metrics?: string[];
  quality_fidelity: {
    fidelity: string[];
    quality: string[];
  };
}

export interface Outcomes {
  short_term: OutcomeEntry[];
  medium_term: OutcomeEntry[];
  long_term: OutcomeEntry[];
}

export interface IntendedImpact {
  population: string;
  geography: string;
  long_term_goal: string;
  compiled_statement: string;
}

export interface LogicModel {
  intended_impact: IntendedImpact;
  stakeholders: Stakeholder[];
  implementation: Implementation;
  outcomes: Outcomes;
}

export type ConversationFocusSection =
  | "impact"
  | "resources"
  | "activities"
  | "outputs_metrics"
  | "quality_fidelity"
  | "outcomes"
  | "stakeholders";

export interface ConversationFocusLock {
  section: ConversationFocusSection;
  reason: "bootstrap_recommendation" | "user_section_selection" | "carry_forward";
  acquiredAtTurn: number;
}

export type RetentionSection =
  | "impact"
  | "resources"
  | "activities"
  | "outputs_metrics"
  | "quality_fidelity"
  | "outcomes"
  | "stakeholders";

export type RetentionClaimStatus = "proposed" | "confirmed" | "conflicted" | "superseded";

export interface RetentionClaimRecord {
  id: string;
  turnIndex: number;
  section: RetentionSection;
  fieldPath: string;
  value: string;
  normalizedValue: string;
  confidence: number;
  provenance: "user_stated" | "assistant_inferred" | "retrieved_guidance";
  status: RetentionClaimStatus;
  sourceText: string;
}

export interface RetentionConflict {
  id: string;
  fieldPath: string;
  section: RetentionSection;
  existingValue: string;
  incomingValue: string;
  status: "open" | "resolved";
  createdTurnIndex: number;
  resolvedTurnIndex?: number;
}

export interface RetentionQuestion {
  id: string;
  section: RetentionSection;
  prompt: string;
  reason: "conflict" | "confirmation";
  status: "open" | "resolved";
  conflictId?: string;
  createdTurnIndex: number;
  resolvedTurnIndex?: number;
}

export interface RetentionMemory {
  claims: RetentionClaimRecord[];
  conflicts: RetentionConflict[];
  questions: RetentionQuestion[];
  lastUpdatedTurnIndex: number;
}

type ResourcePatch = {
  [K in keyof Resource]?: Resource[K] | string;
};

interface LogicModelPatch {
  intended_impact?: Partial<IntendedImpact>;
  stakeholders?: Array<
    Stakeholder | string | { label: string; type?: string }
  >;
  implementation?: {
    resources?: ResourcePatch;
    activities?: Array<
      | Activity
      | {
          item?: string;
          category?: string;
          subcategory?: string;
          actions?: string[];
          outputs?: Array<string | { text: string; category?: string; subcategory?: string }>;
          stakeholderLabels?: string[];
        }
    >;
    outputs_metrics?: string[];
    quality_fidelity?: {
      fidelity?: string[];
      quality?: string[];
    };
  };
  outcomes?: Partial<{
    [K in keyof Outcomes]: Array<
      OutcomeEntry | string | { statement: string; stakeholderIds?: string[]; stakeholderLabels?: string[] }
    >;
  }>;
}

// ---------------------------------------------------------------------------
// Chat message type
// ---------------------------------------------------------------------------

export type MessageRole = "user" | "assistant";

export type QuickReplyAction = "send" | "open-input" | "prefill";

export interface QuickReply {
  label: string;
  value: string;
  action?: QuickReplyAction;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  quickReplies?: QuickReply[];
}

export interface LogicModelDraft {
  model: LogicModel;
  messages: ChatMessage[];
  retentionMemory?: RetentionMemory;
  focusLock?: ConversationFocusLock | null;
  transcript?: ConversationTranscript;
}

// ---------------------------------------------------------------------------
// Store state & actions
// ---------------------------------------------------------------------------

interface LogicModelState {
  model: LogicModel;
  messages: ChatMessage[];
  retentionMemory: RetentionMemory;
  focusLock: ConversationFocusLock | null;
  transcript: ConversationTranscript; // New: conversation transcript for analysis
  isLoading: boolean;
  activeRevisionProposal: AgentRevisionProposal | null;
  revisionLifecycle: AgentRevisionLifecycle;

  // Domain-level partial update actions
  updateIntendedImpact: (patch: Partial<IntendedImpact>) => void;
  updateResources: (patch: Partial<Resource>) => void;
  addActivity: (activity: Activity) => void;
  updateActivity: (index: number, patch: Partial<Activity>) => void;
  removeActivity: (index: number) => void;
  removeResourceItem: (bucket: keyof Resource, index: number) => void;
  removeOutcomeItem: (key: keyof Outcomes, index: number) => void;
  updateOutcomes: (patch: Partial<Outcomes>) => void;

  // Convenience: apply a full model patch from the AI JSON update
  applyModelPatch: (patch: LogicModelPatch) => void;

  // Chat actions
  addMessage: (role: MessageRole, content: string, quickReplies?: QuickReply[]) => void;
  applyRetentionMemory: (memory: RetentionMemory) => void;
  setFocusLock: (lock: ConversationFocusLock | null) => void;
  setLoading: (loading: boolean) => void;
  setActiveRevisionProposal: (proposal: AgentRevisionProposal | null) => void;
  setRevisionLifecycle: (lifecycle: AgentRevisionLifecycle) => void;
  getDraftSnapshot: () => LogicModelDraft;
  restoreDraft: (draft: LogicModelDraft) => void;
  resetModel: () => void;

  // Transcript actions (new)
  addTranscriptTurn: (role: "user" | "assistant", content: string, domain?: string) => void;
  setTranscript: (transcript: ConversationTranscript) => void;
}

// ---------------------------------------------------------------------------
// Default / empty model
// ---------------------------------------------------------------------------

const defaultModel: LogicModel = {
  intended_impact: {
    population: "",
    geography: "",
    long_term_goal: "",
    compiled_statement: "",
  },
  stakeholders: [],
  implementation: {
    resources: {
      human: [],
      material: [],
      financial: [],
      knowledge: [],
    },
    activities: [],
    outputs_metrics: [],
    quality_fidelity: {
      fidelity: [],
      quality: [],
    },
  },
  outcomes: {
    short_term: [],
    medium_term: [],
    long_term: [],
  },
};

const welcomeMessage: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "Tell me about your program — what does it do, and who does it serve?",
  timestamp: 0,
};

function createEmptyRetentionMemory(): RetentionMemory {
  return {
    claims: [],
    conflicts: [],
    questions: [],
    lastUpdatedTurnIndex: 0,
  };
}

function isRetentionMemory(value: unknown): value is RetentionMemory {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.claims) &&
    Array.isArray(v.conflicts) &&
    Array.isArray(v.questions) &&
    typeof v.lastUpdatedTurnIndex === "number"
  );
}

function getWelcomeMessages(): ChatMessage[] {
  return [structuredClone(welcomeMessage)];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ensureStakeholder(
  model: LogicModel,
  rawLabel: string,
  type?: string
): string | null {
  const label = rawLabel.trim();
  if (!label) return null;

  const existing = model.stakeholders.find(
    (s) => s.label.toLowerCase() === label.toLowerCase()
  );
  if (existing) {
    if (type && !existing.type) existing.type = type;
    return existing.id;
  }

  const base = slugify(label) || `stakeholder-${model.stakeholders.length + 1}`;
  let id = base;
  let suffix = 2;
  while (model.stakeholders.some((s) => s.id === id)) {
    id = `${base}-${suffix++}`;
  }

  model.stakeholders.push({ id, label, type });
  return id;
}

function normalizeOutcomeEntry(
  model: LogicModel,
  incoming: unknown
): OutcomeEntry | null {
  if (typeof incoming === "string") {
    const statement = incoming.trim();
    return statement ? { statement, stakeholderIds: [] } : null;
  }

  if (!incoming || typeof incoming !== "object") return null;
  const maybe = incoming as {
    statement?: unknown;
    stakeholderIds?: unknown;
    stakeholderLabels?: unknown;
  };

  if (typeof maybe.statement !== "string" || !maybe.statement.trim()) return null;

  const stakeholderIds = new Set<string>();
  if (Array.isArray(maybe.stakeholderIds)) {
    for (const id of maybe.stakeholderIds) {
      if (typeof id === "string" && id.trim()) stakeholderIds.add(id.trim());
    }
  }
  if (Array.isArray(maybe.stakeholderLabels)) {
    for (const label of maybe.stakeholderLabels) {
      if (typeof label !== "string") continue;
      const id = ensureStakeholder(model, label);
      if (id) stakeholderIds.add(id);
    }
  }

  return {
    statement: maybe.statement.trim(),
    stakeholderIds: Array.from(stakeholderIds),
  };
}

function normalizeActivity(
  model: LogicModel,
  incoming: unknown
): Activity | null {
  if (!incoming || typeof incoming !== "object") return null;
  const maybe = incoming as {
    item?: unknown;
    actions?: unknown;
    outputs?: unknown;
    stakeholderIds?: unknown;
    stakeholderLabels?: unknown;
  };

  const item = typeof maybe.item === "string" && maybe.item.trim().length > 0 ? maybe.item.trim() : "";
  if (!item) return null;

  const actions = Array.isArray(maybe.actions)
    ? maybe.actions.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    : [];
  const outputs = Array.isArray(maybe.outputs)
    ? maybe.outputs
        .map((v) => {
          if (typeof v === "string") {
            const text = v.trim();
            return text ? { text } : null;
          }
          if (v && typeof v === "object") {
            const o = v as { text?: unknown };
            const text = typeof o.text === "string" ? o.text.trim() : "";
            if (!text) return null;
            return { text };
          }
          return null;
        })
        .filter((v): v is { text: string } => Boolean(v))
    : [];

  const stakeholderIds = new Set<string>();
  if (Array.isArray(maybe.stakeholderIds)) {
    for (const id of maybe.stakeholderIds) {
      if (typeof id === "string" && id.trim()) stakeholderIds.add(id.trim());
    }
  }
  if (Array.isArray(maybe.stakeholderLabels)) {
    for (const label of maybe.stakeholderLabels) {
      if (typeof label !== "string") continue;
      const id = ensureStakeholder(model, label);
      if (id) stakeholderIds.add(id);
    }
  }

  return {
    item,
    category: undefined,
    actions,
    outputs,
    stakeholderIds: Array.from(stakeholderIds),
  };
}

function normalizeKey(text: string | undefined): string {
  return (text || "").trim().toLowerCase();
}

function mergeUniqueStringValues(base: string[] = [], incoming: string[] = []): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const value of [...base, ...incoming]) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = normalizeKey(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(trimmed);
  }

  return merged;
}

function mergeUniqueOutputs(
  base: Array<{ text: string }> = [],
  incoming: Array<{ text: string }> = []
): Array<{ text: string }> {
  const seen = new Set<string>();
  const merged: Array<{ text: string }> = [];

  for (const output of [...base, ...incoming]) {
    const text = output.text?.trim();
    if (!text) continue;
    const key = normalizeKey(text);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ text });
  }

  return merged;
}

function findMatchingActivityIndex(existing: Activity[], incoming: Activity): number {
  const incomingActionKeys = new Set(incoming.actions.map((action) => normalizeKey(action)));

  return existing.findIndex((candidate) => {
    const sameNamedGroup =
      normalizeKey(candidate.item) === normalizeKey(incoming.item) &&
      normalizeKey(candidate.item) !== "__ungrouped__";

    const hasOverlappingAction = candidate.actions.some((action) =>
      incomingActionKeys.has(normalizeKey(action))
    );

    return sameNamedGroup || hasOverlappingAction;
  });
}

function mergeActivities(existing: Activity[], incoming: Activity[]): Activity[] {
  const merged = existing.map((activity) => ({
    ...activity,
    actions: [...activity.actions],
    outputs: [...activity.outputs],
    stakeholderIds: [...(activity.stakeholderIds ?? [])],
  }));

  for (const activity of incoming) {
    const matchIndex = findMatchingActivityIndex(merged, activity);
    if (matchIndex === -1) {
      merged.push({
        ...activity,
        actions: [...activity.actions],
        outputs: [...activity.outputs],
        stakeholderIds: [...(activity.stakeholderIds ?? [])],
      });
      continue;
    }

    const target = merged[matchIndex];
    target.actions = mergeUniqueStringValues(target.actions, activity.actions);
    target.outputs = mergeUniqueOutputs(target.outputs, activity.outputs);
    target.stakeholderIds = mergeUniqueStringValues(
      target.stakeholderIds ?? [],
      activity.stakeholderIds ?? []
    );
  }

  return merged;
}

function mergeOutcomes(existing: OutcomeEntry[], incoming: OutcomeEntry[]): OutcomeEntry[] {
  const merged = new Map<string, OutcomeEntry>();

  for (const outcome of [...existing, ...incoming]) {
    const statement = outcome.statement.trim();
    if (!statement) continue;
    const key = normalizeKey(statement);
    const prior = merged.get(key);
    merged.set(key, {
      statement,
      stakeholderIds: mergeUniqueStringValues(prior?.stakeholderIds ?? [], outcome.stakeholderIds ?? []),
    });
  }

  return Array.from(merged.values());
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useLogicModelStore = create<LogicModelState>()(
  immer((set, get) => ({
    model: structuredClone(defaultModel),
    messages: getWelcomeMessages(),
    retentionMemory: createEmptyRetentionMemory(),
    focusLock: null,
    transcript: createEmptyTranscript(), // New: empty transcript
    isLoading: false,
    activeRevisionProposal: null,
    revisionLifecycle: { status: "none" },

    // ---- Intended Impact --------------------------------------------------
    updateIntendedImpact: (patch) =>
      set((state) => {
        Object.assign(state.model.intended_impact, patch);
      }),

    // ---- Resources --------------------------------------------------------
    updateResources: (patch) =>
      set((state) => {
        Object.assign(state.model.implementation.resources, patch);
      }),

    // ---- Activities -------------------------------------------------------
    addActivity: (activity) =>
      set((state) => {
        state.model.implementation.activities.push(activity);
      }),

    updateActivity: (index, patch) =>
      set((state) => {
        const existing = state.model.implementation.activities[index];
        if (existing) Object.assign(existing, patch);
      }),

    removeActivity: (index) =>
      set((state) => {
        state.model.implementation.activities.splice(index, 1);
      }),

    removeResourceItem: (bucket, index) =>
      set((state) => {
        state.model.implementation.resources[bucket].splice(index, 1);
      }),

    removeOutcomeItem: (key, index) =>
      set((state) => {
        state.model.outcomes[key].splice(index, 1);
      }),

    // ---- Outcomes ---------------------------------------------------------
    updateOutcomes: (patch) =>
      set((state) => {
        Object.assign(state.model.outcomes, patch);
      }),

    // ---- Full patch (used by AI JSON Update call) -------------------------
    applyModelPatch: (patch) => {
      set((state) => {
        if (patch.intended_impact) {
          Object.assign(state.model.intended_impact, patch.intended_impact);
        }
        if (patch.stakeholders) {
          for (const raw of patch.stakeholders) {
            if (typeof raw === "string") {
              ensureStakeholder(state.model, raw);
              continue;
            }

            if (raw && typeof raw === "object") {
              const maybe = raw as { id?: string; label?: string; type?: string };
              const label = typeof maybe.label === "string" ? maybe.label.trim() : "";
              if (!label) continue;

              if (typeof maybe.id === "string" && maybe.id.trim()) {
                const id = maybe.id.trim();
                if (!state.model.stakeholders.some((s) => s.id === id)) {
                  state.model.stakeholders.push({
                    id,
                    label,
                    type: maybe.type,
                  });
                }
              } else {
                ensureStakeholder(state.model, label, maybe.type);
              }
            }
          }
        }
        if (patch.implementation) {
          if (patch.implementation.resources) {
            const res = patch.implementation.resources;
            const buckets = ["human", "material", "financial", "knowledge"] as const;
            for (const bucket of buckets) {
              if (res[bucket] !== undefined) {
                const val = res[bucket];
                if (Array.isArray(val)) {
                  // Preserve existing resource memory when patch provides empty arrays.
                  if (val.length > 0) {
                    state.model.implementation.resources[bucket] = val;
                  }
                  continue;
                }

                if (typeof val === "string" && val.length > 0) {
                  state.model.implementation.resources[bucket] = [val];
                }
              }
            }
          }
          if (patch.implementation.activities) {
            const incomingActivities = patch.implementation.activities
              .map((a) => normalizeActivity(state.model, a))
              .filter((a): a is Activity => Boolean(a));

            state.model.implementation.activities = mergeActivities(
              state.model.implementation.activities,
              incomingActivities
            );
          }
          if (Array.isArray(patch.implementation.outputs_metrics)) {
            state.model.implementation.outputs_metrics = mergeUniqueStringValues(
              state.model.implementation.outputs_metrics ?? [],
              patch.implementation.outputs_metrics
            );
          }
          if (patch.implementation.quality_fidelity) {
            const qualityPatch = patch.implementation.quality_fidelity;
            if (Array.isArray(qualityPatch.fidelity)) {
              state.model.implementation.quality_fidelity.fidelity = mergeUniqueStringValues(
                state.model.implementation.quality_fidelity.fidelity,
                qualityPatch.fidelity
              );
            }
            if (Array.isArray(qualityPatch.quality)) {
              state.model.implementation.quality_fidelity.quality = mergeUniqueStringValues(
                state.model.implementation.quality_fidelity.quality,
                qualityPatch.quality
              );
            }
          }
        }
        if (patch.outcomes) {
          const keys: Array<keyof Outcomes> = ["short_term", "medium_term", "long_term"];
          for (const key of keys) {
            const incoming = patch.outcomes[key];
            if (!Array.isArray(incoming)) continue;

            const normalizedIncoming = incoming
              .map((o) => normalizeOutcomeEntry(state.model, o))
              .filter((o): o is OutcomeEntry => Boolean(o));

            state.model.outcomes[key] = mergeOutcomes(
              state.model.outcomes[key],
              normalizedIncoming
            );
          }
        }
      });
    },

    // ---- Chat -------------------------------------------------------------
    addMessage: (role, content, quickReplies?) =>
      set((state) => {
        state.messages.push({
          id: crypto.randomUUID(),
          role,
          content,
          timestamp: Date.now(),
          quickReplies: role === "assistant" && quickReplies && quickReplies.length > 0
            ? quickReplies
            : undefined,
        });
      }),

    applyRetentionMemory: (memory) =>
      set((state) => {
        state.retentionMemory = isRetentionMemory(memory)
          ? structuredClone(memory)
          : createEmptyRetentionMemory();
      }),

    setFocusLock: (lock) =>
      set((state) => {
        state.focusLock = lock ? structuredClone(lock) : null;
      }),

    setLoading: (loading) =>
      set((state) => {
        state.isLoading = loading;
      }),

    setActiveRevisionProposal: (proposal) =>
      set((state) => {
        state.activeRevisionProposal = proposal ? structuredClone(proposal) : null;
      }),

    setRevisionLifecycle: (lifecycle) =>
      set((state) => {
        state.revisionLifecycle = {
          ...structuredClone(lifecycle),
          updatedAt: lifecycle.updatedAt ?? Date.now(),
        };
      }),

    getDraftSnapshot: () => ({
      model: structuredClone(get().model),
      messages: structuredClone(get().messages),
      retentionMemory: structuredClone(get().retentionMemory),
      focusLock: structuredClone(get().focusLock),
      transcript: structuredClone(get().transcript),
    }),

    restoreDraft: (draft) =>
      set((state) => {
        const restored = structuredClone(draft.model) as LogicModel;

        if (!Array.isArray(restored.stakeholders)) {
          restored.stakeholders = [];
        }

        restored.implementation.activities = (restored.implementation.activities || [])
          .map((a) => normalizeActivity(restored, a))
          .filter((a): a is Activity => Boolean(a));

        if (!restored.implementation.quality_fidelity) {
          restored.implementation.quality_fidelity = { fidelity: [], quality: [] };
        }
        if (!Array.isArray(restored.implementation.outputs_metrics)) {
          restored.implementation.outputs_metrics = [];
        }
        if (!Array.isArray(restored.implementation.quality_fidelity.fidelity)) {
          restored.implementation.quality_fidelity.fidelity = [];
        }
        if (!Array.isArray(restored.implementation.quality_fidelity.quality)) {
          restored.implementation.quality_fidelity.quality = [];
        }

        const outcomeKeys: Array<keyof Outcomes> = ["short_term", "medium_term", "long_term"];
        for (const key of outcomeKeys) {
          const incoming = Array.isArray(restored.outcomes[key]) ? restored.outcomes[key] : [];
          restored.outcomes[key] = incoming
            .map((item) => normalizeOutcomeEntry(restored, item))
            .filter((item): item is OutcomeEntry => Boolean(item));
        }

        state.model = restored;
        state.messages =
          draft.messages.length > 0
            ? structuredClone(draft.messages)
            : getWelcomeMessages();
        state.retentionMemory = isRetentionMemory(draft.retentionMemory)
          ? structuredClone(draft.retentionMemory)
          : createEmptyRetentionMemory();
        state.focusLock = draft.focusLock ? structuredClone(draft.focusLock) : null;
        state.transcript = draft.transcript
          ? structuredClone(draft.transcript)
          : createEmptyTranscript();
        state.activeRevisionProposal = null;
        state.revisionLifecycle = { status: "none" };
      }),

    resetModel: () =>
      set((state) => {
        state.model = structuredClone(defaultModel);
        state.messages = getWelcomeMessages();
        state.retentionMemory = createEmptyRetentionMemory();
        state.focusLock = null;
        state.transcript = createEmptyTranscript();
        state.activeRevisionProposal = null;
        state.revisionLifecycle = { status: "none" };
      }),

    // ---- Transcript -------------------------------------------------------
    addTranscriptTurn: (role, content, domain?) =>
      set((state) => {
        state.transcript.turns.push({
          role,
          content,
          timestamp: Date.now(),
          domain,
        });
      }),

    setTranscript: (transcript) =>
      set((state) => {
        state.transcript = structuredClone(transcript);
      }),
  }))
);
