"use client";

import { useEffect, useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import {
  getNextGapQuestion,
  type BootstrapExtractionResponse,
} from "@/lib/bootstrap/types";
import { useLogicModelStore } from "@/store/useLogicModelStore";
import {
  buildPatchFromSuggestions,
  describeDetected,
  describeGaps,
} from "@/lib/bootstrap/patch";

export default function DocumentBootstrap() {
  const applyModelPatch = useLogicModelStore((s) => s.applyModelPatch);
  const addMessage = useLogicModelStore((s) => s.addMessage);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzingTick, setAnalyzingTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isAnalyzing) {
      setAnalyzingTick(0);
      return;
    }

    const timer = setInterval(() => {
      setAnalyzingTick((prev) => prev + 1);
    }, 900);

    return () => clearInterval(timer);
  }, [isAnalyzing]);

  const analysisSteps = [
    "Uploading",
    "Extracting text",
    "Interpreting logic model",
    "Preparing suggestions",
  ];
  const activeAnalysisStep = analysisSteps[Math.min(Math.floor(analyzingTick / 2), analysisSteps.length - 1)];

  async function handleAnalyzeFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    setError(null);
    setIsAnalyzing(true);

    try {
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
        setError(data?.summary || "Couldn't extract clear suggestions from those files.");
        return;
      }

      // Apply all suggestions immediately — no review step
      const patch = buildPatchFromSuggestions(suggestions);
      applyModelPatch(patch);

      // Build summary chat message
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

      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not analyze files.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <div className="border-b border-[#9fc3da] bg-[#f4f9fc] px-3 py-2.5 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-[#0b315b]">Head Start From Documents</p>
        {error ? (
          <p className="text-[11px] text-red-600 mt-0.5">{error}</p>
        ) : (
          <>
            <p className="text-[11px] text-[#48617c] mt-0.5">
              Upload a one-pager or report — I&apos;ll pre-fill what I can and ask follow-up questions.
            </p>
            {isAnalyzing && (
              <div className="mt-2 rounded-md border border-[#9fc3da] bg-white px-2.5 py-2">
                <p className="text-[11px] font-medium text-[#0b315b]">{activeAnalysisStep}...</p>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[#edf3f8]">
                  <div className="h-full w-1/2 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-[#47aad8]" />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <button
        onClick={() => inputRef.current?.click()}
        disabled={isAnalyzing}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-[#9fc3da] bg-white px-2.5 py-1.5 text-xs text-[#0b315b] hover:bg-[#edf3f8] disabled:opacity-50 mt-0.5"
      >
        {isAnalyzing ? <Loader2 size={13} className="animate-spin" /> : <FileUp size={13} />}
        {isAnalyzing ? "Analyzing…" : "Upload"}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.txt,.md"
        multiple
        className="hidden"
        onChange={(e) => handleAnalyzeFiles(e.target.files)}
      />
    </div>
  );
}
