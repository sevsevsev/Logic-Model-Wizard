"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Download, Upload, Save, Clock3 } from "lucide-react";
import {
  type LogicModelDraft,
  useLogicModelStore,
} from "@/store/useLogicModelStore";
import {
  createPersistedDraft,
  isValidPersistedDraft,
  LOCAL_CLOUD_DRAFT_ID_KEY,
  LOCAL_CLOUD_USER_KEY,
  LOCAL_DRAFT_STORAGE_KEY,
  type PersistedDraft,
  type CloudDraftRecord,
} from "@/lib/drafts/types";

type SaveStatus = "idle" | "saving" | "saved" | "error";

function isPristineDraft(draft: LogicModelDraft): boolean {
  const { model, messages } = draft;
  const hasImpact =
    model.intended_impact.population ||
    model.intended_impact.geography ||
    model.intended_impact.long_term_goal ||
    model.intended_impact.compiled_statement;

  const hasResources =
    model.implementation.resources.human.length > 0 ||
    model.implementation.resources.material.length > 0 ||
    model.implementation.resources.financial.length > 0 ||
    model.implementation.resources.knowledge.length > 0;

  const hasActivities = model.implementation.activities.length > 0;
  const hasOutcomes =
    model.outcomes.short_term.length > 0 ||
    model.outcomes.medium_term.length > 0 ||
    model.outcomes.long_term.length > 0;

  const hasOnlyWelcomeMessage =
    messages.length === 1 &&
    messages[0]?.role === "assistant" &&
    messages[0]?.id === "welcome";

  return !hasImpact && !hasResources && !hasActivities && !hasOutcomes && hasOnlyWelcomeMessage;
}

export default function DraftControls() {
  const model = useLogicModelStore((s) => s.model);
  const messages = useLogicModelStore((s) => s.messages);
  const restoreDraft = useLogicModelStore((s) => s.restoreDraft);
  const reviewMode = useLogicModelStore((s) => s.reviewMode);
  const setReviewMode = useLogicModelStore((s) => s.setReviewMode);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [resumeCandidate, setResumeCandidate] = useState<PersistedDraft | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [cloudStatus, setCloudStatus] = useState<string>("Local only");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const hydratedRef = useRef(false);
  const resumeDecisionPendingRef = useRef(false);

  const draft = useMemo<LogicModelDraft>(() => ({ model, messages }), [model, messages]);

  useEffect(() => {
    if (hydratedRef.current || typeof window === "undefined") return;
    hydratedRef.current = true;

    const raw = window.localStorage.getItem(LOCAL_DRAFT_STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      if (!isValidPersistedDraft(parsed)) return;

      setSavedAt(parsed.savedAt);
      if (isPristineDraft(draft)) {
        resumeDecisionPendingRef.current = true;
        setResumeCandidate(parsed);
      }
    } catch {
      // Ignore invalid local data
    }
  }, [draft]);

  useEffect(() => {
    if (!hydratedRef.current || typeof window === "undefined") return;
    if (resumeDecisionPendingRef.current) return;

    const timer = window.setTimeout(() => {
      setSaveStatus("saving");
      const payload: PersistedDraft = {
        ...createPersistedDraft(draft),
      };

      try {
        window.localStorage.setItem(LOCAL_DRAFT_STORAGE_KEY, JSON.stringify(payload));
        setSaveStatus("saved");
        setSavedAt(payload.savedAt);
      } catch {
        setSaveStatus("error");
      }
    }, 800);

    return () => window.clearTimeout(timer);
  }, [draft]);

  function handleResumeSavedDraft() {
    if (!resumeCandidate) return;
    resumeDecisionPendingRef.current = false;
    restoreDraft(resumeCandidate.draft);
    setResumeCandidate(null);
  }

  function handleStartFresh() {
    resumeDecisionPendingRef.current = false;
    setResumeCandidate(null);
  }

  function handleExport() {
    if (typeof window === "undefined") return;

    const payload: PersistedDraft = createPersistedDraft(draft);

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    anchor.href = url;
    anchor.download = `logic-model-draft-${timestamp}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function triggerImport() {
    setImportError(null);
    fileInputRef.current?.click();
  }

  function requireCloudUserId(): string | null {
    if (typeof window === "undefined") return null;
    const existing = window.localStorage.getItem(LOCAL_CLOUD_USER_KEY);
    if (existing) return existing;

    const entered = window.prompt("Enter your cloud user ID for sync:");
    if (!entered) return null;

    const normalized = entered.trim();
    if (!normalized) return null;
    window.localStorage.setItem(LOCAL_CLOUD_USER_KEY, normalized);
    return normalized;
  }

  async function syncToCloud() {
    if (typeof window === "undefined") return;

    const userId = requireCloudUserId();
    if (!userId) return;

    const persistedDraft = createPersistedDraft(draft);
    const existingDraftId = window.localStorage.getItem(LOCAL_CLOUD_DRAFT_ID_KEY);
    const endpoint = existingDraftId ? `/api/drafts/${existingDraftId}` : "/api/drafts";
    const method = existingDraftId ? "PUT" : "POST";

    setCloudStatus("Syncing...");
    try {
      const res = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({ persistedDraft }),
      });

      if (!res.ok) {
        throw new Error("Cloud sync request failed");
      }

      const data = (await res.json()) as { draft?: CloudDraftRecord };
      if (data.draft?.id) {
        window.localStorage.setItem(LOCAL_CLOUD_DRAFT_ID_KEY, data.draft.id);
        setSavedAt(data.draft.savedAt);
      }
      setCloudStatus("Cloud synced");
    } catch {
      setCloudStatus("Cloud sync failed");
    }
  }

  async function loadFromCloud() {
    if (typeof window === "undefined") return;

    const userId = requireCloudUserId();
    if (!userId) return;

    setCloudStatus("Loading cloud draft...");
    try {
      const existingDraftId = window.localStorage.getItem(LOCAL_CLOUD_DRAFT_ID_KEY);
      let record: CloudDraftRecord | null = null;

      if (existingDraftId) {
        const detailRes = await fetch(`/api/drafts/${existingDraftId}`, {
          headers: { "x-user-id": userId },
        });
        if (detailRes.ok) {
          const detailData = (await detailRes.json()) as { draft?: CloudDraftRecord };
          record = detailData.draft ?? null;
        }
      }

      if (!record) {
        const listRes = await fetch("/api/drafts", {
          headers: { "x-user-id": userId },
        });
        if (!listRes.ok) {
          throw new Error("Cloud list request failed");
        }
        const listData = (await listRes.json()) as { drafts?: CloudDraftRecord[] };
        record = listData.drafts?.[0] ?? null;
      }

      if (!record) {
        setCloudStatus("No cloud draft found");
        return;
      }

      restoreDraft(record.draft);
      setSavedAt(record.savedAt);
      window.localStorage.setItem(LOCAL_CLOUD_DRAFT_ID_KEY, record.id);
      setCloudStatus("Cloud draft loaded");
    } catch {
      setCloudStatus("Cloud load failed");
    }
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!isValidPersistedDraft(parsed)) {
        setImportError("Invalid draft format. Please import a Logic Model Wizard JSON draft.");
        return;
      }

      restoreDraft(parsed.draft);
      setSavedAt(parsed.savedAt);
      setResumeCandidate(null);
      setImportError(null);
    } catch {
      setImportError("Could not read this file. Please check that it is valid JSON.");
    }
  }

  const saveStatusText =
    saveStatus === "saving"
      ? "Saving..."
      : saveStatus === "saved"
        ? "Saved"
        : saveStatus === "error"
          ? "Save failed"
          : "Autosave on";

  return (
    <div className="space-y-2">
      {resumeCandidate && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-center justify-between gap-3">
          <span>
            Resume your previous draft from {new Date(resumeCandidate.savedAt).toLocaleString()}?
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleResumeSavedDraft}
              className="rounded-md bg-amber-600 text-white px-2 py-1 hover:bg-amber-700"
            >
              Resume
            </button>
            <button
              onClick={handleStartFresh}
              className="rounded-md border border-amber-300 bg-white px-2 py-1 hover:bg-amber-100"
            >
              Start fresh
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 flex items-center justify-between gap-3">
        <div className="text-xs text-slate-500 flex items-center gap-2">
          <Clock3 size={13} />
          <span>{saveStatusText}</span>
          {savedAt && <span>· {new Date(savedAt).toLocaleTimeString()}</span>}
          <span>· {cloudStatus}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Draft / Review toggle */}
          <div className="flex items-center gap-0.5 rounded-full border border-slate-200 bg-slate-50 p-0.5">
            <button
              onClick={() => setReviewMode(false)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                !reviewMode
                  ? "bg-white shadow-sm text-[#0b315b] border border-slate-200"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Draft
            </button>
            <button
              onClick={() => setReviewMode(true)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                reviewMode
                  ? "bg-[#0b315b] text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Review
            </button>
          </div>

          <button
            onClick={triggerImport}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            <Upload size={13} />
            Import
          </button>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            <Download size={13} />
            Export
          </button>
          <button
            onClick={loadFromCloud}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            Load Cloud
          </button>
          <button
            onClick={syncToCloud}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            Sync Cloud
          </button>
          <div className="inline-flex items-center gap-1 text-[11px] text-slate-400">
            <Save size={12} />
            JSON
          </div>
        </div>
      </div>

      {importError && (
        <p className="text-xs text-red-600 px-1">{importError}</p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={handleImportFile}
      />
    </div>
  );
}
