"use client";

import { useMemo, useState } from "react";
import { useLogicModelStore } from "@/store/useLogicModelStore";
import { Check, Plus, Target, Wrench, Zap, TrendingUp, X } from "lucide-react";
import DraftControls from "@/components/DraftControls";

const DEFAULT_ACTIVITY_GROUP = "__ungrouped__";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader({
  icon,
  title,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  color: string;
}) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-t-lg ${color}`}>
      <span className="opacity-80">{icon}</span>
      <h3 className="text-xs font-bold uppercase tracking-wider">{title}</h3>
    </div>
  );
}

function PillList({
  items,
  empty,
  onRemove,
  onAdd,
  onEdit,
}: {
  items: string[] | undefined | null;
  empty: string;
  onRemove?: (index: number) => void;
  onAdd?: (value: string) => void;
  onEdit?: (index: number, value: string) => void;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const safeItems = Array.isArray(items) ? items : [];

  const startEditing = (index: number) => {
    setEditingIndex(index);
    setDraftValue(safeItems[index] || "");
    setIsAdding(false);
  };

  const saveEdit = () => {
    if (editingIndex === null || !onEdit) return;
    const value = draftValue.trim();
    if (value) onEdit(editingIndex, value);
    setEditingIndex(null);
    setDraftValue("");
  };

  const saveAdd = () => {
    if (!onAdd) return;
    const value = draftValue.trim();
    if (value) onAdd(value);
    setIsAdding(false);
    setDraftValue("");
  };

  if (safeItems.length === 0) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs italic text-slate-400 px-1">{empty}</p>
        {onAdd && (
          isAdding ? (
            <div className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-1">
              <input
                value={draftValue}
                onChange={(e) => setDraftValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveAdd();
                  if (e.key === "Escape") {
                    setIsAdding(false);
                    setDraftValue("");
                  }
                }}
                placeholder="Add item..."
                className="w-36 text-xs outline-none"
                autoFocus
              />
              <button onClick={saveAdd} className="text-[#22779f] hover:text-[#0b315b]">
                <Check size={12} />
              </button>
              <button
                onClick={() => {
                  setIsAdding(false);
                  setDraftValue("");
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setIsAdding(true);
                setEditingIndex(null);
                setDraftValue("");
              }}
              className="inline-flex items-center gap-1 text-xs rounded-full border border-dashed border-slate-300 bg-white px-2.5 py-0.5 text-slate-500 hover:bg-slate-50"
            >
              <Plus size={11} /> Add item
            </button>
          )
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {safeItems.map((item, i) => (
        editingIndex === i ? (
          <div
            key={i}
            className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-1"
          >
            <input
              value={draftValue}
              onChange={(e) => setDraftValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit();
                if (e.key === "Escape") {
                  setEditingIndex(null);
                  setDraftValue("");
                }
              }}
              className="w-36 text-xs outline-none"
              autoFocus
            />
            <button onClick={saveEdit} className="text-[#22779f] hover:text-[#0b315b]">
              <Check size={12} />
            </button>
            <button
              onClick={() => {
                setEditingIndex(null);
                setDraftValue("");
              }}
              className="text-slate-400 hover:text-slate-600"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <div
            key={i}
            className="inline-flex items-center gap-1 text-xs bg-white border border-slate-200 rounded-full pl-2.5 pr-1.5 py-0.5 text-slate-700 shadow-sm"
          >
            <button
              onClick={() => onEdit && startEditing(i)}
              className={`text-left ${onEdit ? "hover:text-[#0b315b]" : "cursor-default"}`}
            >
              {item}
            </button>
            {onRemove && (
              <button
                onClick={() => onRemove(i)}
                aria-label={`Remove ${item}`}
                className="ml-0.5 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 p-0.5 transition-colors"
              >
                <X size={9} />
              </button>
            )}
          </div>
        )
      ))}

      {onAdd && (
        isAdding ? (
          <div className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-1">
            <input
              value={draftValue}
              onChange={(e) => setDraftValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveAdd();
                if (e.key === "Escape") {
                  setIsAdding(false);
                  setDraftValue("");
                }
              }}
              placeholder="Add item..."
              className="w-36 text-xs outline-none"
              autoFocus
            />
            <button onClick={saveAdd} className="text-[#22779f] hover:text-[#0b315b]">
              <Check size={12} />
            </button>
            <button
              onClick={() => {
                setIsAdding(false);
                setDraftValue("");
              }}
              className="text-slate-400 hover:text-slate-600"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setIsAdding(true);
              setEditingIndex(null);
              setDraftValue("");
            }}
            className="inline-flex items-center gap-1 text-xs rounded-full border border-dashed border-slate-300 bg-white px-2.5 py-0.5 text-slate-500 hover:bg-slate-50"
          >
            <Plus size={11} /> Add item
          </button>
        )
      )}
    </div>
  );
}

function Card({
  header,
  children,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 shadow-sm overflow-hidden">
      {header}
      <div className="bg-slate-50 p-3 space-y-2">{children}</div>
    </div>
  );
}

function OutcomeList({
  items,
  empty,
  stakeholderLabel,
  onRemove,
  onAdd,
  onEdit,
}: {
  items: Array<{ statement: string; stakeholderIds?: string[] }> | undefined | null;
  empty: string;
  stakeholderLabel: (id: string) => string;
  onRemove?: (index: number) => void;
  onAdd?: (statement: string) => void;
  onEdit?: (index: number, statement: string) => void;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const safeItems = Array.isArray(items) ? items : [];

  const startEditing = (index: number) => {
    setEditingIndex(index);
    setDraftValue(safeItems[index]?.statement || "");
    setIsAdding(false);
  };

  const saveEdit = () => {
    if (editingIndex === null || !onEdit) return;
    const value = draftValue.trim();
    if (value) onEdit(editingIndex, value);
    setEditingIndex(null);
    setDraftValue("");
  };

  const saveAdd = () => {
    if (!onAdd) return;
    const value = draftValue.trim();
    if (value) onAdd(value);
    setIsAdding(false);
    setDraftValue("");
  };

  if (safeItems.length === 0) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs italic text-slate-400 px-1">{empty}</p>
        {onAdd && (
          isAdding ? (
            <div className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-1">
              <input
                value={draftValue}
                onChange={(e) => setDraftValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveAdd();
                  if (e.key === "Escape") {
                    setIsAdding(false);
                    setDraftValue("");
                  }
                }}
                placeholder="Add item..."
                className="w-36 text-xs outline-none"
                autoFocus
              />
              <button onClick={saveAdd} className="text-[#22779f] hover:text-[#0b315b]">
                <Check size={12} />
              </button>
              <button
                onClick={() => {
                  setIsAdding(false);
                  setDraftValue("");
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setIsAdding(true);
                setEditingIndex(null);
                setDraftValue("");
              }}
              className="inline-flex items-center gap-1 text-xs rounded-full border border-dashed border-slate-300 bg-white px-2.5 py-0.5 text-slate-500 hover:bg-slate-50"
            >
              <Plus size={11} /> Add item
            </button>
          )
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {safeItems.map((item, i) => (
        editingIndex === i ? (
          <div
            key={`${item.statement}-${i}`}
            className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-1"
          >
            <input
              value={draftValue}
              onChange={(e) => setDraftValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit();
                if (e.key === "Escape") {
                  setEditingIndex(null);
                  setDraftValue("");
                }
              }}
              className="w-40 text-xs outline-none"
              autoFocus
            />
            <button onClick={saveEdit} className="text-[#22779f] hover:text-[#0b315b]">
              <Check size={12} />
            </button>
            <button
              onClick={() => {
                setEditingIndex(null);
                setDraftValue("");
              }}
              className="text-slate-400 hover:text-slate-600"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <div
            key={`${item.statement}-${i}`}
            className="inline-flex items-center gap-1 text-xs bg-white border border-slate-200 rounded-full pl-2.5 pr-1.5 py-0.5 text-slate-700 shadow-sm"
          >
            <button
              onClick={() => onEdit && startEditing(i)}
              className={`text-left ${onEdit ? "hover:text-[#0b315b]" : "cursor-default"}`}
            >
              {item.statement}
            </button>
            {Array.isArray(item.stakeholderIds) && item.stakeholderIds.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#edf3f8] text-[#0b315b] px-1.5 py-[1px] text-[10px]">
                {item.stakeholderIds
                  .map((id) => stakeholderLabel(id))
                  .filter(Boolean)
                  .join(" + ")}
              </span>
            )}
            {onRemove && (
              <button
                onClick={() => onRemove(i)}
                aria-label={`Remove ${item.statement}`}
                className="ml-0.5 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 p-0.5 transition-colors"
              >
                <X size={9} />
              </button>
            )}
          </div>
        )
      ))}

      {onAdd && (
        isAdding ? (
          <div className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-1">
            <input
              value={draftValue}
              onChange={(e) => setDraftValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveAdd();
                if (e.key === "Escape") {
                  setIsAdding(false);
                  setDraftValue("");
                }
              }}
              placeholder="Add chip..."
              className="w-40 text-xs outline-none"
              autoFocus
            />
            <button onClick={saveAdd} className="text-[#22779f] hover:text-[#0b315b]">
              <Check size={12} />
            </button>
            <button
              onClick={() => {
                setIsAdding(false);
                setDraftValue("");
              }}
              className="text-slate-400 hover:text-slate-600"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setIsAdding(true);
              setEditingIndex(null);
              setDraftValue("");
            }}
            className="inline-flex items-center gap-1 text-xs rounded-full border border-dashed border-slate-300 bg-white px-2.5 py-0.5 text-slate-500 hover:bg-slate-50"
          >
            <Plus size={11} /> Add chip
          </button>
        )
      )}
    </div>
  );
}

function OutputList({
  items,
  empty,
  onRemove,
  onAdd,
  onEdit,
}: {
  items: Array<{ text: string; category?: string }> | undefined | null;
  empty: string;
  onRemove?: (index: number) => void;
  onAdd?: (value: { text: string; category?: string }) => void;
  onEdit?: (index: number, value: { text: string; category?: string }) => void;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftSubcategory, setDraftSubcategory] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const safeItems = Array.isArray(items) ? items : [];

  const startEditing = (index: number) => {
    setEditingIndex(index);
    setDraftText(safeItems[index]?.text || "");
    setDraftSubcategory(safeItems[index]?.category || "");
    setIsAdding(false);
  };

  const saveEdit = () => {
    if (editingIndex === null || !onEdit) return;
    const text = draftText.trim();
    if (!text) return;
    const subcategory = draftSubcategory.trim();
    onEdit(editingIndex, { text, category: subcategory || undefined });
    setEditingIndex(null);
    setDraftText("");
    setDraftSubcategory("");
  };

  const saveAdd = () => {
    if (!onAdd) return;
    const text = draftText.trim();
    if (!text) return;
    const subcategory = draftSubcategory.trim();
    onAdd({ text, category: subcategory || undefined });
    setIsAdding(false);
    setDraftText("");
    setDraftSubcategory("");
  };

  const editor = (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2 py-1">
      <input
        value={draftSubcategory}
        onChange={(e) => setDraftSubcategory(e.target.value)}
        placeholder="Category"
        className="w-20 text-xs outline-none text-slate-600"
      />
      <input
        value={draftText}
        onChange={(e) => setDraftText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (editingIndex !== null) saveEdit();
            else saveAdd();
          }
          if (e.key === "Escape") {
            setEditingIndex(null);
            setIsAdding(false);
            setDraftText("");
            setDraftSubcategory("");
          }
        }}
        placeholder="Item text..."
        className="w-36 text-xs outline-none"
        autoFocus
      />
      <button
        onClick={() => (editingIndex !== null ? saveEdit() : saveAdd())}
        className="text-[#22779f] hover:text-[#0b315b]"
      >
        <Check size={12} />
      </button>
      <button
        onClick={() => {
          setEditingIndex(null);
          setIsAdding(false);
          setDraftText("");
          setDraftSubcategory("");
        }}
        className="text-slate-400 hover:text-slate-600"
      >
        <X size={12} />
      </button>
    </div>
  );

  if (safeItems.length === 0) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs italic text-slate-400 px-1">{empty}</p>
        {onAdd &&
          (isAdding ? (
            editor
          ) : (
            <button
              onClick={() => {
                setIsAdding(true);
                setEditingIndex(null);
                setDraftText("");
                setDraftSubcategory("");
              }}
              className="inline-flex items-center gap-1 text-xs rounded-full border border-dashed border-slate-300 bg-white px-2.5 py-0.5 text-slate-500 hover:bg-slate-50"
            >
              <Plus size={11} /> Add item
            </button>
          ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {safeItems.map((item, i) =>
        editingIndex === i ? (
          <div key={`${item.text}-${i}`}>{editor}</div>
        ) : (
          <div
            key={`${item.text}-${i}`}
            className="inline-flex items-center gap-1 text-xs bg-white border border-slate-200 rounded-full pl-2.5 pr-1.5 py-0.5 text-slate-700 shadow-sm"
          >
            {item.category && (
              <span className="rounded-full bg-[#fff3df] text-[#0b315b] px-1.5 py-[1px] text-[10px] border border-[#ffd08e]">
                {item.category}
              </span>
            )}
            <button
              onClick={() => onEdit && startEditing(i)}
              className={`text-left ${onEdit ? "hover:text-[#0b315b]" : "cursor-default"}`}
            >
              {item.text}
            </button>
            {onRemove && (
              <button
                onClick={() => onRemove(i)}
                aria-label={`Remove ${item.text}`}
                className="ml-0.5 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 p-0.5 transition-colors"
              >
                <X size={9} />
              </button>
            )}
          </div>
        )
      )}

      {onAdd &&
        (isAdding ? (
          editor
        ) : (
          <button
            onClick={() => {
              setIsAdding(true);
              setEditingIndex(null);
              setDraftText("");
              setDraftSubcategory("");
            }}
            className="inline-flex items-center gap-1 text-xs rounded-full border border-dashed border-slate-300 bg-white px-2.5 py-0.5 text-slate-500 hover:bg-slate-50"
          >
            <Plus size={11} /> Add item
          </button>
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function LogicMirror() {
  const model = useLogicModelStore((s) => s.model);
  const activeRevisionProposal = useLogicModelStore((s) => s.activeRevisionProposal);
  const addActivity = useLogicModelStore((s) => s.addActivity);
  const removeResourceItem = useLogicModelStore((s) => s.removeResourceItem);
  const removeOutcomeItem = useLogicModelStore((s) => s.removeOutcomeItem);
  const updateActivity = useLogicModelStore((s) => s.updateActivity);
  const updateResources = useLogicModelStore((s) => s.updateResources);
  const updateOutcomes = useLogicModelStore((s) => s.updateOutcomes);
  const updateIntendedImpact = useLogicModelStore((s) => s.updateIntendedImpact);
  const setActiveRevisionProposal = useLogicModelStore((s) => s.setActiveRevisionProposal);
  const setRevisionLifecycle = useLogicModelStore((s) => s.setRevisionLifecycle);
  const { intended_impact, implementation, outcomes } = model;
  const { resources, activities } = implementation;
  const [editingImpact, setEditingImpact] = useState(false);
  const [impactDraft, setImpactDraft] = useState(
    intended_impact.compiled_statement || intended_impact.long_term_goal
  );
  const [editingActivityMeta, setEditingActivityMeta] = useState<number | null>(null);
  const [activityItemDraft, setActivityItemDraft] = useState("");
  const [activityCategoryDraft, setActivityCategoryDraft] = useState("");
  const [creatingActivity, setCreatingActivity] = useState(false);
  const [topLevelMode, setTopLevelMode] = useState<"activity" | "output" | null>(null);
  const [addingActivityForGroup, setAddingActivityForGroup] = useState<number | null>(null);
  const [activityTextDraft, setActivityTextDraft] = useState("");
  const [addingOutputForActivity, setAddingOutputForActivity] = useState<number | null>(null);
  const [outputTextDraft, setOutputTextDraft] = useState("");
  const [outputCategoryDraft, setOutputCategoryDraft] = useState("");

  const stakeholderNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const stakeholder of model.stakeholders) {
      map.set(stakeholder.id, stakeholder.label);
    }
    return map;
  }, [model.stakeholders]);

  const stakeholderLabel = (id: string) => stakeholderNames.get(id) || id;

  function findOrCreateGroupIndex(groupName?: string): number {
    const normalized = (groupName || "").trim();
    const targetName = normalized || DEFAULT_ACTIVITY_GROUP;
    const existingIndex = activities.findIndex((act) => act.item === targetName);
    if (existingIndex >= 0) return existingIndex;

    addActivity({
      item: targetName,
      actions: [],
      outputs: [],
      stakeholderIds: [],
    });

    const nextActivities = useLogicModelStore.getState().model.implementation.activities;
    return nextActivities.findIndex((act) => act.item === targetName);
  }

  return (
    <div className="h-full overflow-y-auto bg-[linear-gradient(180deg,#f7fbff_0,#eef4f9_100%)] p-4">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Header bar */}
        <div className="text-center pb-1">
          <h1 className="font-display text-2xl font-semibold text-[#0b315b]">Logic Model Builder</h1>
          <p className="text-xs text-[#48617c]">Live workspace for building and refining your logic model</p>
        </div>

        <DraftControls />

        {activeRevisionProposal?.revisedText && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                  Proposed rewrite
                </p>
                <p className="text-xs text-slate-700">
                  The assistant found a close fit and is suggesting a cleaner version that stays close to your wording.
                </p>
              </div>
              <button
                onClick={() => {
                  setRevisionLifecycle({
                    status: "dismissed",
                    originalText: activeRevisionProposal.originalText,
                    revisedText: activeRevisionProposal.revisedText,
                    rationale: activeRevisionProposal.rationale,
                  });
                  setActiveRevisionProposal(null);
                }}
                className="rounded-full px-2 py-1 text-[11px] text-amber-900 hover:bg-amber-100"
              >
                Dismiss
              </button>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <div className="rounded-md border border-amber-200 bg-white p-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Original</p>
                <p className="mt-1 text-xs text-slate-700">{activeRevisionProposal.originalText || "Your last wording"}</p>
              </div>
              <div className="rounded-md border border-amber-300 bg-white p-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8f5a00]">Suggested</p>
                <p className="mt-1 text-xs text-[#0b315b]">{activeRevisionProposal.revisedText}</p>
              </div>
            </div>

            {activeRevisionProposal.rationale && (
              <p className="mt-2 text-[11px] text-slate-600">Why: {activeRevisionProposal.rationale}</p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  updateIntendedImpact({ compiled_statement: activeRevisionProposal.revisedText?.trim() ?? "" });
                  setRevisionLifecycle({
                    status: "accepted",
                    originalText: activeRevisionProposal.originalText,
                    revisedText: activeRevisionProposal.revisedText,
                    rationale: activeRevisionProposal.rationale,
                  });
                  setActiveRevisionProposal(null);
                }}
                className="inline-flex items-center gap-1 rounded-md bg-[#0b315b] px-2.5 py-1 text-[11px] text-white hover:bg-[#082746]"
              >
                <Check size={11} /> Accept rewrite
              </button>
              <button
                onClick={() => {
                  setRevisionLifecycle({
                    status: "dismissed",
                    originalText: activeRevisionProposal.originalText,
                    revisedText: activeRevisionProposal.revisedText,
                    rationale: activeRevisionProposal.rationale,
                  });
                  setActiveRevisionProposal(null);
                }}
                className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] text-amber-900 hover:bg-amber-100"
              >
                Keep my wording
              </button>
            </div>
          </div>
        )}

        {/* Intended Impact */}
        <Card
          header={
            <SectionHeader
              icon={<Target size={14} />}
              title="Intended Impact"
              color="bg-[#edf3f8] text-[#0b315b]"
            />
          }
        >
          <p className="text-xs text-slate-500">
            Capture the intended impact as one clear statement. The assistant can derive supporting details like population and geography behind the scenes.
          </p>
          {(intended_impact.compiled_statement || intended_impact.long_term_goal || editingImpact) && (
            editingImpact ? (
              <div className="mt-2 p-2 bg-white border border-[#9fc3da] rounded-md space-y-2">
                <textarea
                  value={impactDraft}
                  onChange={(e) => setImpactDraft(e.target.value)}
                  className="w-full min-h-16 text-xs text-slate-700 outline-none"
                  autoFocus
                />
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    onClick={() => {
                      updateIntendedImpact({ compiled_statement: impactDraft.trim() });
                      setEditingImpact(false);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] rounded-md bg-[#0b315b] text-white px-2 py-1 hover:bg-[#082746]"
                  >
                    <Check size={11} /> Save
                  </button>
                  <button
                    onClick={() => {
                      setImpactDraft(intended_impact.compiled_statement || intended_impact.long_term_goal);
                      setEditingImpact(false);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] rounded-md border border-slate-300 bg-white px-2 py-1 hover:bg-slate-100"
                  >
                    <X size={11} /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  setImpactDraft(intended_impact.compiled_statement || intended_impact.long_term_goal);
                  setEditingImpact(true);
                }}
                className="mt-2 p-2 bg-[#edf3f8] border border-[#9fc3da] rounded-md text-xs text-[#0b315b] italic hover:bg-[#dcebf5] text-left w-full"
              >
                &ldquo;{intended_impact.compiled_statement || intended_impact.long_term_goal}&rdquo;
              </button>
            )
          )}
          {!intended_impact.compiled_statement && !editingImpact && (
            <button
              onClick={() => {
                setImpactDraft(intended_impact.long_term_goal || "");
                setEditingImpact(true);
              }}
              className="mt-2 inline-flex items-center gap-1 text-xs rounded-full border border-dashed border-[#47aad8] bg-white px-2.5 py-1 text-[#0b315b] hover:bg-[#edf3f8]"
            >
              <Plus size={11} /> Draft impact statement
            </button>
          )}
        </Card>

        {/* Resources */}
        <Card
          header={
            <SectionHeader
              icon={<Wrench size={14} />}
              title="Resources (Inputs)"
              color="bg-[#e4f2fb] text-[#0b315b]"
            />
          }
        >
          <div className="grid grid-cols-2 gap-3">
            {(["human", "material", "financial", "knowledge"] as const).map(
              (bucket) => (
                <div key={bucket}>
                  <p className="text-[10px] font-semibold uppercase text-slate-400 mb-1 capitalize">
                    {bucket}
                  </p>
                  <PillList
                    items={resources[bucket]}
                    empty="None added yet"
                    onRemove={(idx) => removeResourceItem(bucket, idx)}
                    onAdd={(value) =>
                      updateResources({
                        [bucket]: [...resources[bucket], value],
                      })
                    }
                    onEdit={(idx, value) =>
                      updateResources({
                        [bucket]: resources[bucket].map((item, i) => (i === idx ? value : item)),
                      })
                    }
                  />
                </div>
              )
            )}
          </div>
        </Card>

        {/* Activities and Outputs */}
        <Card
          header={
            <SectionHeader
              icon={<Zap size={14} />}
              title="Activities & Outputs"
              color="bg-[#fff3df] text-[#0b315b]"
            />
          }
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setTopLevelMode("activity");
                  setActivityTextDraft("");
                  setActivityCategoryDraft("");
                  setCreatingActivity(false);
                }}
                className="inline-flex items-center gap-1 text-xs rounded-full border border-dashed border-[#ffaa30] bg-white px-2.5 py-1 text-[#0b315b] hover:bg-[#fff3df]"
              >
                <Plus size={11} /> Add activity
              </button>
              <button
                onClick={() => {
                  setTopLevelMode("output");
                  setOutputTextDraft("");
                  setOutputCategoryDraft("");
                  setCreatingActivity(false);
                }}
                className="inline-flex items-center gap-1 text-xs rounded-full border border-dashed border-slate-300 bg-white px-2.5 py-1 text-slate-600 hover:bg-slate-50"
              >
                <Plus size={11} /> Add output
              </button>
              <button
                onClick={() => {
                  setCreatingActivity(true);
                  setTopLevelMode(null);
                  setActivityItemDraft("");
                  setActivityCategoryDraft("");
                }}
                className="inline-flex items-center gap-1 text-xs rounded-full border border-dashed border-slate-300 bg-white px-2.5 py-1 text-slate-600 hover:bg-slate-50"
              >
                <Plus size={11} /> Add group
              </button>
            </div>

            {topLevelMode === "activity" && (
              <div className="rounded-md border border-[#9fc3da] bg-white p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    value={activityTextDraft}
                    onChange={(e) => setActivityTextDraft(e.target.value)}
                    placeholder="Activity"
                    className="text-xs font-semibold text-[#0b315b] outline-none border border-[#9fc3da] rounded-md px-2 py-1 bg-[#edf3f8]"
                    autoFocus
                  />
                  <input
                    value={activityCategoryDraft}
                    onChange={(e) => setActivityCategoryDraft(e.target.value)}
                    placeholder="Group / category (optional)"
                    className="text-xs text-slate-600 outline-none border border-slate-300 rounded-md px-2 py-1"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      const text = activityTextDraft.trim();
                      if (!text) return;
                      const groupIndex = findOrCreateGroupIndex(activityCategoryDraft);
                      if (groupIndex < 0) return;
                      const target = useLogicModelStore.getState().model.implementation.activities[groupIndex];
                      updateActivity(groupIndex, {
                        actions: [...(target.actions ?? []), text],
                      });
                      setTopLevelMode(null);
                      setActivityTextDraft("");
                      setActivityCategoryDraft("");
                    }}
                    className="inline-flex items-center gap-1 text-[11px] rounded-md bg-[#0b315b] text-white px-2 py-1 hover:bg-[#082746]"
                  >
                    <Check size={11} /> Add activity
                  </button>
                  <button
                    onClick={() => {
                      setTopLevelMode(null);
                      setActivityTextDraft("");
                      setActivityCategoryDraft("");
                    }}
                    className="inline-flex items-center gap-1 text-[11px] rounded-md border border-slate-300 bg-white px-2 py-1 hover:bg-slate-100"
                  >
                    <X size={11} /> Cancel
                  </button>
                </div>
              </div>
            )}

            {topLevelMode === "output" && (
              <div className="rounded-md border border-slate-200 bg-white p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    value={outputTextDraft}
                    onChange={(e) => setOutputTextDraft(e.target.value)}
                    placeholder="Output"
                    className="text-xs font-semibold text-slate-700 outline-none border border-slate-300 rounded-md px-2 py-1 bg-slate-50"
                    autoFocus
                  />
                  <input
                    value={outputCategoryDraft}
                    onChange={(e) => setOutputCategoryDraft(e.target.value)}
                    placeholder="Group / category (optional)"
                    className="text-xs text-slate-600 outline-none border border-slate-300 rounded-md px-2 py-1"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      const text = outputTextDraft.trim();
                      if (!text) return;
                      const groupIndex = findOrCreateGroupIndex(outputCategoryDraft);
                      if (groupIndex < 0) return;
                      const target = useLogicModelStore.getState().model.implementation.activities[groupIndex];
                      updateActivity(groupIndex, {
                        outputs: [...(target.outputs ?? []), { text }],
                      });
                      setTopLevelMode(null);
                      setOutputTextDraft("");
                      setOutputCategoryDraft("");
                    }}
                    className="inline-flex items-center gap-1 text-[11px] rounded-md bg-slate-700 text-white px-2 py-1 hover:bg-slate-800"
                  >
                    <Check size={11} /> Add output
                  </button>
                  <button
                    onClick={() => {
                      setTopLevelMode(null);
                      setOutputTextDraft("");
                      setOutputCategoryDraft("");
                    }}
                    className="inline-flex items-center gap-1 text-[11px] rounded-md border border-slate-300 bg-white px-2 py-1 hover:bg-slate-100"
                  >
                    <X size={11} /> Cancel
                  </button>
                </div>
              </div>
            )}

            {creatingActivity ? (
              <div className="rounded-md border border-[#9fc3da] bg-white p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    value={activityItemDraft}
                    onChange={(e) => setActivityItemDraft(e.target.value)}
                    placeholder="Group / category"
                    className="text-xs font-semibold text-[#0b315b] outline-none border border-[#9fc3da] rounded-md px-2 py-1 bg-[#edf3f8]"
                    autoFocus
                  />
                  <input
                    value={activityCategoryDraft}
                    onChange={(e) => setActivityCategoryDraft(e.target.value)}
                    placeholder="Notes (optional)"
                    className="text-xs text-slate-600 outline-none border border-slate-300 rounded-md px-2 py-1"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Create a group/category card first, then add activities and outputs inside it.
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      const item = activityItemDraft.trim();
                      if (!item) return;
                      addActivity({
                        item,
                        category:
                          activityCategoryDraft.trim().length > 0
                            ? activityCategoryDraft.trim()
                            : undefined,
                        actions: [],
                        outputs: [],
                        stakeholderIds: [],
                      });
                      setCreatingActivity(false);
                      setActivityItemDraft("");
                      setActivityCategoryDraft("");
                    }}
                    className="inline-flex items-center gap-1 text-[11px] rounded-md bg-[#0b315b] text-white px-2 py-1 hover:bg-[#082746]"
                  >
                    <Check size={11} /> Add group
                  </button>
                  <button
                    onClick={() => {
                      setCreatingActivity(false);
                      setActivityItemDraft("");
                      setActivityCategoryDraft("");
                    }}
                    className="inline-flex items-center gap-1 text-[11px] rounded-md border border-slate-300 bg-white px-2 py-1 hover:bg-slate-100"
                  >
                    <X size={11} /> Cancel
                  </button>
                </div>
              </div>
            ) : activities.length === 0 ? (
              <div className="space-y-2">
                <p className="text-xs italic text-slate-400">No activities or outputs added yet</p>
              </div>
            ) : null}

            {activities.length > 0 && (
              <div className="space-y-3">
              {activities.map((act, i) => (
                <div
                  key={i}
                  className="border border-slate-200 rounded-md p-2.5 bg-white space-y-2"
                >
                  {act.item !== DEFAULT_ACTIVITY_GROUP && (
                    editingActivityMeta === i ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <input
                          value={activityItemDraft}
                          onChange={(e) => setActivityItemDraft(e.target.value)}
                          placeholder="Group / category"
                          className="text-xs font-semibold text-[#0b315b] outline-none border border-[#9fc3da] rounded-md px-2 py-1 bg-[#edf3f8]"
                        />
                        <input
                          value={activityCategoryDraft}
                          onChange={(e) => setActivityCategoryDraft(e.target.value)}
                          placeholder="Notes (optional)"
                          className="text-xs text-slate-600 outline-none border border-slate-300 rounded-md px-2 py-1"
                        />
                        <button
                          onClick={() => {
                            updateActivity(i, {
                              item: activityItemDraft.trim() || act.item,
                              category:
                                activityCategoryDraft.trim().length > 0
                                  ? activityCategoryDraft.trim()
                                  : undefined,
                            });
                            setEditingActivityMeta(null);
                          }}
                          className="text-[#22779f] hover:text-[#0b315b]"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          onClick={() => setEditingActivityMeta(null)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingActivityMeta(i);
                          setActivityItemDraft(act.item);
                          setActivityCategoryDraft(act.category || "");
                        }}
                        className="text-left"
                      >
                        <span className="block text-[10px] uppercase font-semibold text-slate-400 mb-0.5">
                          Group / Category
                        </span>
                        <span className="text-xs font-semibold text-[#0b315b] hover:text-[#082746]">
                          {act.item}
                        </span>
                        {act.category && (
                          <span className="ml-1.5 rounded-full bg-[#fff3df] text-[#0b315b] px-1.5 py-[1px] text-[10px] border border-[#ffd08e] align-middle">
                            Note: {act.category}
                          </span>
                        )}
                      </button>
                    )
                  )}
                  {Array.isArray(act.stakeholderIds) && act.stakeholderIds.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {act.stakeholderIds.map((id) => (
                        <span
                          key={id}
                          className="text-[10px] rounded-full px-1.5 py-0.5 bg-[#fff3df] text-[#0b315b] border border-[#ffd08e]"
                        >
                          {stakeholderLabel(id)}
                        </span>
                      ))}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-[10px] uppercase font-semibold text-slate-400">
                        Activities
                      </p>
                      <button
                        onClick={() => {
                          setAddingActivityForGroup(i);
                          setActivityTextDraft("");
                        }}
                        className="inline-flex items-center gap-1 text-[10px] rounded-full border border-dashed border-slate-300 bg-white px-2 py-0.5 text-slate-500 hover:bg-slate-50"
                      >
                        <Plus size={10} /> Add activity
                      </button>
                    </div>
                    {addingActivityForGroup === i && (
                      <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2 py-1">
                        <input
                          value={activityTextDraft}
                          onChange={(e) => setActivityTextDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const text = activityTextDraft.trim();
                              if (!text) return;
                              updateActivity(i, {
                                actions: [...(act.actions ?? []), text],
                              });
                              setAddingActivityForGroup(null);
                              setActivityTextDraft("");
                            }
                            if (e.key === "Escape") {
                              setAddingActivityForGroup(null);
                              setActivityTextDraft("");
                            }
                          }}
                          placeholder="Activity text..."
                          className="w-40 text-xs outline-none"
                          autoFocus
                        />
                        <button
                          onClick={() => {
                            const text = activityTextDraft.trim();
                            if (!text) return;
                            updateActivity(i, {
                              actions: [...(act.actions ?? []), text],
                            });
                            setAddingActivityForGroup(null);
                            setActivityTextDraft("");
                          }}
                          className="text-[#22779f] hover:text-[#0b315b]"
                        >
                          <Check size={12} />
                        </button>
                        <button
                          onClick={() => {
                            setAddingActivityForGroup(null);
                            setActivityTextDraft("");
                          }}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )}
                    <PillList
                      items={act.actions ?? []}
                      empty="None"
                      onRemove={(idx) =>
                        updateActivity(i, {
                          actions: (act.actions ?? []).filter((_, k) => k !== idx),
                        })
                      }
                      onEdit={(idx, value) =>
                        updateActivity(i, {
                          actions: (act.actions ?? []).map((item, k) => (k === idx ? value : item)),
                        })
                      }
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-[10px] uppercase font-semibold text-slate-400">
                        Outputs
                      </p>
                      <button
                        onClick={() => {
                          setAddingOutputForActivity(i);
                          setOutputTextDraft("");
                          setOutputCategoryDraft("");
                        }}
                        className="inline-flex items-center gap-1 text-[10px] rounded-full border border-dashed border-slate-300 bg-white px-2 py-0.5 text-slate-500 hover:bg-slate-50"
                      >
                        <Plus size={10} /> Add output
                      </button>
                    </div>
                    {addingOutputForActivity === i && (
                      <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2 py-1">
                        <input
                          value={outputCategoryDraft}
                          onChange={(e) => setOutputCategoryDraft(e.target.value)}
                          placeholder="Category"
                          className="w-20 text-xs outline-none text-slate-600"
                        />
                        <input
                          value={outputTextDraft}
                          onChange={(e) => setOutputTextDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const text = outputTextDraft.trim();
                              if (!text) return;
                              updateActivity(i, {
                                outputs: [
                                  ...(act.outputs ?? []),
                                  {
                                    text,
                                    category:
                                      outputCategoryDraft.trim().length > 0
                                        ? outputCategoryDraft.trim()
                                        : undefined,
                                  },
                                ],
                              });
                              setAddingOutputForActivity(null);
                              setOutputTextDraft("");
                              setOutputCategoryDraft("");
                            }
                            if (e.key === "Escape") {
                              setAddingOutputForActivity(null);
                              setOutputTextDraft("");
                              setOutputCategoryDraft("");
                            }
                          }}
                          placeholder="Item text..."
                          className="w-36 text-xs outline-none"
                          autoFocus
                        />
                        <button
                          onClick={() => {
                            const text = outputTextDraft.trim();
                            if (!text) return;
                            updateActivity(i, {
                              outputs: [
                                ...(act.outputs ?? []),
                                {
                                  text,
                                  category:
                                    outputCategoryDraft.trim().length > 0
                                      ? outputCategoryDraft.trim()
                                      : undefined,
                                },
                              ],
                            });
                            setAddingOutputForActivity(null);
                            setOutputTextDraft("");
                            setOutputCategoryDraft("");
                          }}
                          className="text-[#22779f] hover:text-[#0b315b]"
                        >
                          <Check size={12} />
                        </button>
                        <button
                          onClick={() => {
                            setAddingOutputForActivity(null);
                            setOutputTextDraft("");
                            setOutputCategoryDraft("");
                          }}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )}
                    <OutputList
                      items={act.outputs ?? []}
                      empty="None"
                      onRemove={(idx) =>
                        updateActivity(i, {
                          outputs: (act.outputs ?? []).filter((_, k) => k !== idx),
                        })
                      }
                      onAdd={(value) =>
                        updateActivity(i, {
                          outputs: [...(act.outputs ?? []), value],
                        })
                      }
                      onEdit={(idx, value) =>
                        updateActivity(i, {
                          outputs: (act.outputs ?? []).map((item, k) => (k === idx ? value : item)),
                        })
                      }
                    />
                  </div>
                </div>
              ))}
              </div>
            )}
          </div>
        </Card>

        {/* Outcomes */}
        <Card
          header={
            <SectionHeader
              icon={<TrendingUp size={14} />}
              title="Outcomes"
              color="bg-[#e7f6ea] text-[#0b315b]"
            />
          }
        >
          {(
            [
              { key: "short_term", label: "Short-term", sub: "Knowledge / Awareness", color: "text-[#22779f]" },
              { key: "medium_term", label: "Medium-term", sub: "Skills / Behavior", color: "text-[#22779f]" },
              { key: "long_term", label: "Long-term", sub: "Condition / Status", color: "text-[#0b315b]" },
            ] as const
          ).map(({ key, label, sub, color }) => (
            <div key={key}>
              <p className={`text-xs font-semibold ${color} mb-0.5`}>
                {label}{" "}
                <span className="font-normal text-slate-400 text-[10px]">({sub})</span>
              </p>
              <OutcomeList
                items={outcomes[key]}
                empty="Not yet defined"
                stakeholderLabel={stakeholderLabel}
                onRemove={(idx) => removeOutcomeItem(key, idx)}
                onAdd={(statement) =>
                  updateOutcomes({
                    [key]: [...outcomes[key], { statement, stakeholderIds: [] }],
                  })
                }
                onEdit={(idx, statement) =>
                  updateOutcomes({
                    [key]: outcomes[key].map((entry, i) =>
                      i === idx ? { ...entry, statement } : entry
                    ),
                  })
                }
              />
            </div>
          ))}
        </Card>

        {/* Flow arrow legend */}
        <div className="flex items-center justify-center gap-2 text-[10px] text-slate-400 py-1">
          <span className="font-medium text-slate-500">Resources</span>
          <span>-&gt;</span>
          <span className="font-medium text-slate-500">Activities</span>
          <span>-&gt;</span>
          <span className="font-medium text-slate-500">Outputs</span>
          <span>-&gt;</span>
          <span className="font-medium text-slate-500">Outcomes</span>
        </div>
      </div>
    </div>
  );
}



