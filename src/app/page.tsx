"use client";

import { useState } from "react";
import MainLayout from "@/components/MainLayout";
import LandingPage from "@/components/LandingPage";
import {
  getNextGapQuestion,
  type BootstrapExtractionResponse,
} from "@/lib/bootstrap/types";
import { buildPatchFromSuggestions, describeDetected, describeGaps } from "@/lib/bootstrap/patch";
import { useLogicModelStore } from "@/store/useLogicModelStore";

interface LandingSubmitPayload {
  description: string;
  files: FileList | null;
}

export default function Home() {
  const [started, setStarted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [landingError, setLandingError] = useState<string | null>(null);

  const addMessage = useLogicModelStore((s) => s.addMessage);
  const applyModelPatch = useLogicModelStore((s) => s.applyModelPatch);
  const setLoading = useLogicModelStore((s) => s.setLoading);

  async function runDocumentBootstrap(files: FileList) {
    const formData = new FormData();
    Array.from(files)
      .slice(0, 3)
      .forEach((f) => formData.append("files", f));

    const res = await fetch("/api/bootstrap", { method: "POST", body: formData });
    const raw = await res.text();
    let data: (BootstrapExtractionResponse & { error?: string }) | null = null;

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

    const model = useLogicModelStore.getState().model;
    const detected = describeDetected(patch);
    const gaps = describeGaps(model);
    const nextQuestion = getNextGapQuestion(model);

    let message = "I reviewed your document and pre-filled your logic model";
    if (detected.length > 0) message += ` with **${detected.join(", ")}**`;
    message += ".";
    if (gaps.length > 0) {
      message += ` I'll ask follow-up questions to fill in what's still missing: ${gaps.join(", ")}.`;
    } else {
      message += " Your logic model looks complete — nice work!";
    }
    message += `\n\n${nextQuestion}`;
    addMessage("assistant", message);
  }

  async function runDescriptionKickoff(description: string) {
    addMessage("user", description);
    setLoading(true);
    try {
      const history = useLogicModelStore.getState().messages;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: description, history }),
      });

      const raw = await res.text();
      let data: { reply?: string; modelPatch?: unknown; error?: string } | null = null;
      try {
        data = raw ? (JSON.parse(raw) as { reply?: string; modelPatch?: unknown; error?: string }) : null;
      } catch {
        const hint = !res.ok ? ` (HTTP ${res.status})` : "";
        throw new Error(`Server returned a non-JSON response${hint}.`);
      }

      if (!res.ok) throw new Error(data?.error || `Request failed (HTTP ${res.status}).`);
      if (!data?.reply) throw new Error("Response is missing assistant reply.");

      addMessage("assistant", data.reply);
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
        } catch (error) {
          firstError = error instanceof Error ? error.message : "Could not analyze files.";
        }
      }

      if (description.trim()) {
        try {
          await runDescriptionKickoff(description.trim());
          progressed = true;
        } catch (error) {
          if (!firstError) {
            firstError = error instanceof Error
              ? error.message
              : "Could not process your description.";
          }
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
