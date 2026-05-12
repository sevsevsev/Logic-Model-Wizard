"use client";

import { useState } from "react";
import MainLayout from "@/components/MainLayout";
import LandingPage, { LANDING_DESCRIPTION_DRAFT_KEY } from "@/components/LandingPage";
import {
  getBootstrapStartOptions,
  getBootstrapStartRecommendation,
  getNextGapQuestion,
  type BootstrapExtractionResponse,
} from "@/lib/bootstrap/types";
import {
  buildPatchFromSuggestions,
  buildRefinementCoaching,
  describeGaps,
} from "@/lib/bootstrap/patch";
import { LOCAL_CLOUD_USER_KEY } from "@/lib/drafts/types";
import { useLogicModelStore, QuickReply, type LogicModel } from "@/store/useLogicModelStore";

function buildQualityNote(patch: Partial<LogicModel>): string | null {
  const acts = patch.implementation?.activities ?? [];
  const hasActivities = acts.length > 0;
  const hasOutputs = hasActivities && acts.some((a) => (a.outputs?.length ?? 0) > 0);
  const outcomes = patch.outcomes;
  const missingOutcomeTier =
    outcomes &&
    (outcomes.short_term?.length === 0 ||
      outcomes.medium_term?.length === 0 ||
      outcomes.long_term?.length === 0);

  if (hasActivities && !hasOutputs) {
    return "The activities section could use more detail on outputs — what does each activity actually produce?";
  }
  if (missingOutcomeTier) {
    return "The outcomes section is missing one or more time horizons (short-, medium-, or long-term).";
  }
  return null;
}

const MAX_BOOTSTRAP_FILE_BYTES = 4 * 1024 * 1024;

function validateBootstrapUpload(files: FileList): string | null {
  if (files.length === 0) {
    return "Please select a file.";
  }

  if (files[0].size > MAX_BOOTSTRAP_FILE_BYTES) {
    return "File is too large. Please keep it under 4 MB.";
  }

  return null;
}

interface LandingSubmitPayload {
  description: string;
  files: FileList | null;
}

function getCollaboratorId(): string | null {
  if (typeof window === "undefined") return null;
  const existing = window.localStorage.getItem(LOCAL_CLOUD_USER_KEY);
  if (existing) return existing;

  const generated =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? `collab-${crypto.randomUUID()}`
      : `collab-${Date.now()}`;
  window.localStorage.setItem(LOCAL_CLOUD_USER_KEY, generated);
  return generated;
}

export default function Home() {
  const [started, setStarted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [landingError, setLandingError] = useState<string | null>(null);

  const addMessage = useLogicModelStore((s) => s.addMessage);
  const applyModelPatch = useLogicModelStore((s) => s.applyModelPatch);
  const setLoading = useLogicModelStore((s) => s.setLoading);
  const model = useLogicModelStore((s) => s.model);

  async function runDocumentBootstrap(files: FileList) {
    const validationError = validateBootstrapUpload(files);
    if (validationError) {
      throw new Error(validationError);
    }

    const formData = new FormData();
    formData.append("files", files[0]);

    const collaboratorId = getCollaboratorId();
    const res = await fetch("/api/bootstrap", {
      method: "POST",
      headers: collaboratorId ? { "x-user-id": collaboratorId } : undefined,
      body: formData,
    });
    const raw = await res.text();
    let data: (BootstrapExtractionResponse & { error?: string }) | null = null;

    if (!res.ok && res.status === 413) {
      throw new Error(
        "Upload is too large. Please keep total file size under 4 MB or split into smaller files."
      );
    }

    try {
      data = raw ? (JSON.parse(raw) as BootstrapExtractionResponse & { error?: string }) : null;
    } catch {
      const hint = !res.ok ? ` (HTTP ${res.status})` : "";
      throw new Error(`Server returned a non-JSON response${hint}.`);
    }

    if (!res.ok) throw new Error(data?.error || `Could not analyze files (HTTP ${res.status}).`);

    const suggestions = data?.suggestions || [];
    if (suggestions.length === 0) {
      addMessage(
        "assistant",
        data?.summary || "I couldn't extract clear suggestions from those files yet."
      );
      return;
    }

    const patch = buildPatchFromSuggestions(suggestions);
    applyModelPatch(patch);
    const refinementCoaching = buildRefinementCoaching(suggestions);

    const model = useLogicModelStore.getState().model;
    const gaps = describeGaps(model);
    const startOptions = getBootstrapStartOptions(model, suggestions);
    const startRecommendation = startOptions
      ? getBootstrapStartRecommendation(model, suggestions)
      : null;

    if (gaps.length === 0) {
      // Model is fully populated — offer a quality pass.
      const qualityNote = buildQualityNote(patch);
      const message = qualityNote
        ? `I reviewed your document and filled in your logic model. ${qualityNote}\n\nWant to take a closer look at that section, or does everything look good?`
        : `I reviewed your document and filled in your logic model.${
            refinementCoaching ? ` ${refinementCoaching.note}` : ""
          } Take a look and let me know if anything needs adjusting.${
            refinementCoaching ? `\n\n${refinementCoaching.question}` : ""
          }`;
      addMessage("assistant", message, [
        { label: "Looks good", value: "Looks good — let's proceed." },
        { label: "Let me review it", value: "I'd like to review and refine the logic model." },
      ]);
    } else {
      // Model has gaps — ask the next question without enumerating every missing field.
      const nextQuestion = getNextGapQuestion(model);
      const followUpQuestion = startOptions
        ? `${startRecommendation?.prompt ?? "I can suggest a practical place to start."} Where would you like to begin refining?`
        : nextQuestion;
      addMessage(
        "assistant",
        `I reviewed your document and filled in what I could find.\n\n${followUpQuestion}`,
        startOptions ?? undefined
      );
    }
  }

  async function runDescriptionKickoff(description: string) {
    addMessage("user", description);
    setLoading(true);
    try {
      const historyWithLatest = useLogicModelStore.getState().messages;
      const history =
        historyWithLatest.length > 0 &&
        historyWithLatest[historyWithLatest.length - 1]?.role === "user" &&
        historyWithLatest[historyWithLatest.length - 1]?.content === description
          ? historyWithLatest.slice(0, -1)
          : historyWithLatest;
      const model = useLogicModelStore.getState().model;
      const collaboratorId = getCollaboratorId();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(collaboratorId ? { "x-user-id": collaboratorId } : {}),
        },
        body: JSON.stringify({ message: description, history, model }),
      });

      const raw = await res.text();
      let data: { reply?: string; modelPatch?: unknown; quickReplies?: QuickReply[]; error?: string } | null = null;
      try {
        data = raw ? (JSON.parse(raw) as { reply?: string; modelPatch?: unknown; quickReplies?: QuickReply[]; error?: string }) : null;
      } catch {
        const hint = !res.ok ? ` (HTTP ${res.status})` : "";
        throw new Error(`Server returned a non-JSON response${hint}.`);
      }

      if (!res.ok) throw new Error(data?.error || `Request failed (HTTP ${res.status}).`);
      if (!data?.reply) throw new Error("Response is missing assistant reply.");

      addMessage("assistant", data.reply, data.quickReplies);
      if (data.modelPatch) applyModelPatch(data.modelPatch);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      addMessage("assistant", `Sorry, I couldn't process that description yet. ${message}`);
      throw error;
    } finally {
      setLoading(false);
    }
  }

  async function handleLandingSubmit({ description, files }: LandingSubmitPayload) {
    setIsSubmitting(true);
    setLandingError(null);
    let progressed = false;
    let firstError: string | null = null;

    try {
      if (files && files.length > 0) {
        try {
          await runDocumentBootstrap(files);
          progressed = true;
          const refinementCoaching = buildRefinementCoaching(suggestions);
          firstError = error instanceof Error ? error.message : "Could not analyze files.";
        }
      }

      if (description.trim()) {
        try {
          await runDescriptionKickoff(description.trim());
          progressed = true;
        } catch (error) {
          if (!firstError) {
                  refinementCoaching ? ` ${refinementCoaching.note}` : ""
          }
                  refinementCoaching ? `\n\n${refinementCoaching.question}` : ""
        }
      }

      if (firstError && !progressed) {
        setLandingError(firstError);
        return;
      }

      if (firstError && progressed) {
        addMessage("assistant", `Setup completed with a warning: ${firstError}`);
      }

      if (progressed) {
        if (typeof window !== "undefined") {
          try {
            window.sessionStorage.removeItem(LANDING_DESCRIPTION_DRAFT_KEY);
          } catch {
            // Ignore sessionStorage access failures.
          }
        }
        setStarted(true);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!started) {
    return (
      <LandingPage
        isSubmitting={isSubmitting}
        onSubmit={handleLandingSubmit}
        error={landingError}
      />
    );
  }

  return <MainLayout />;
}
