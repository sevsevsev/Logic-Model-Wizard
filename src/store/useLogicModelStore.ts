import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

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
}

// ---------------------------------------------------------------------------
// Store state & actions
// ---------------------------------------------------------------------------

interface LogicModelState {
  model: LogicModel;
  messages: ChatMessage[];
  isLoading: boolean;
  activeSection: string | null;
  reviewMode: boolean;

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
  setLoading: (loading: boolean) => void;
  getDraftSnapshot: () => LogicModelDraft;
  restoreDraft: (draft: LogicModelDraft) => void;
  resetModel: () => void;
  setActiveSection: (section: string | null) => void;
  setReviewMode: (mode: boolean) => void;
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
    category?: unknown;
    subcategory?: unknown;
    actions?: unknown;
    outputs?: unknown;
    stakeholderIds?: unknown;
    stakeholderLabels?: unknown;
  };

  const item =
    typeof maybe.item === "string" && maybe.item.trim().length > 0
      ? maybe.item.trim()
      : typeof maybe.category === "string" && maybe.category.trim().length > 0
        ? maybe.category.trim()
        : "";
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
            const o = v as { text?: unknown; category?: unknown; subcategory?: unknown };
            const text = typeof o.text === "string" ? o.text.trim() : "";
            if (!text) return null;
            return {
              text,
              category:
                typeof o.category === "string" && o.category.trim().length > 0
                  ? o.category.trim()
                  : typeof o.subcategory === "string" && o.subcategory.trim().length > 0
                    ? o.subcategory.trim()
                  : undefined,
            };
          }
          return null;
        })
        .filter(
          (v): v is { text: string; category?: string } => Boolean(v)
        )
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
    category:
      typeof maybe.category === "string" && maybe.category.trim().length > 0
        ? maybe.category.trim()
        : typeof maybe.subcategory === "string" && maybe.subcategory.trim().length > 0
          ? maybe.subcategory.trim()
        : undefined,
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
  base: Array<{ text: string; category?: string }> = [],
  incoming: Array<{ text: string; category?: string }> = []
): Array<{ text: string; category?: string }> {
  const seen = new Set<string>();
  const merged: Array<{ text: string; category?: string }> = [];

  for (const output of [...base, ...incoming]) {
    const text = output.text?.trim();
    if (!text) continue;
    const key = `${normalizeKey(text)}::${normalizeKey(output.category)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ text, category: output.category?.trim() || undefined });
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
    target.category = target.category || activity.category;
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
    isLoading: false,
    activeSection: null,
    reviewMode: false,

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
    applyModelPatch: (patch) =>
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
                state.model.implementation.resources[bucket] = Array.isArray(val)
                  ? val
                  : typeof val === "string" && val.length > 0
                    ? [val]
                    : state.model.implementation.resources[bucket];
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
      }),

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

    setLoading: (loading) =>
      set((state) => {
        state.isLoading = loading;
      }),

    getDraftSnapshot: () => ({
      model: structuredClone(get().model),
      messages: structuredClone(get().messages),
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
      }),

    resetModel: () =>
      set((state) => {
        state.model = structuredClone(defaultModel);
        state.messages = getWelcomeMessages();
      }),

    setActiveSection: (section) =>
      set((state) => {
        state.activeSection = section;
      }),

    setReviewMode: (mode) =>
      set((state) => {
        state.reviewMode = mode;
      }),
  }))
);
