"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, FileUp, Sparkles } from "lucide-react";

interface LandingSubmitPayload {
  description: string;
  files: FileList | null;
}

interface LandingPageProps {
  isSubmitting: boolean;
  error?: string | null;
  onSubmit: (payload: LandingSubmitPayload) => Promise<void>;
}

export default function LandingPage({ isSubmitting, onSubmit, error }: LandingPageProps) {
  const rotatingAudiences = ["your board", "funders", "stakeholders", "staff"];
  const audienceSlotWidthCh = Math.max(...rotatingAudiences.map((label) => label.length)) + 1;
  const [description, setDescription] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [progressTick, setProgressTick] = useState(0);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [audienceIndex, setAudienceIndex] = useState(0);
  const [isAudienceVisible, setIsAudienceVisible] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rotateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isSubmitting) {
      setProgressTick(0);
      return;
    }

    const timer = setInterval(() => {
      setProgressTick((prev) => prev + 1);
    }, 900);

    return () => clearInterval(timer);
  }, [isSubmitting]);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAudienceVisible(false);
      if (rotateTimeoutRef.current) clearTimeout(rotateTimeoutRef.current);

      rotateTimeoutRef.current = setTimeout(() => {
        setAudienceIndex((prev) => (prev + 1) % rotatingAudiences.length);
        setIsAudienceVisible(true);
      }, 320);
    }, 3400);

    return () => {
      clearInterval(interval);
      if (rotateTimeoutRef.current) clearTimeout(rotateTimeoutRef.current);
    };
  }, [rotatingAudiences.length]);

  const processingSteps = [
    "Uploading documents",
    "Reading and extracting text",
    "Mapping logic model domains",
    "Preparing your workspace",
  ];
  const activeStep = processingSteps[Math.min(Math.floor(progressTick / 2), processingSteps.length - 1)];

  function openFilePicker() {
    const input = fileInputRef.current;
    if (!input || isSubmitting || isPickerOpen) return;

    setFormError(null);
    setIsPickerOpen(true);

    // If the dialog is canceled, browsers often return focus to the window without firing change.
    const releasePickerState = () => {
      setTimeout(() => {
        setIsPickerOpen(false);
      }, 0);
    };

    window.addEventListener("focus", releasePickerState, { once: true });

    // Reset input so selecting the same file again still triggers change.
    input.value = "";

    // Prefer showPicker when available, fall back to click for wider support.
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }

    input.click();
  }

  function clearSelectedFiles() {
    setSelectedFiles(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!description.trim() && (!selectedFiles || selectedFiles.length === 0)) {
      setFormError("Add a short description or upload at least one document to continue.");
      return;
    }

    await onSubmit({ description: description.trim(), files: selectedFiles });
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#0b315b_0,#0b315b_130px,#edf3f8_130px,#f3f5f7_100%)] text-[#0b315b]">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14 lg:py-20">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
          <section className="rounded-3xl border border-[#9fc3da] bg-white p-7 shadow-[0_14px_40px_-20px_rgba(11,49,91,.45)] sm:p-10">
            <p className="inline-flex items-center gap-2 rounded-full border border-[#9fc3da] bg-[#edf3f8] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0b315b]">
              <Sparkles size={13} />
              Partner Welcome
            </p>

            <h1 className="font-display mt-4 text-4xl font-semibold leading-tight tracking-tight text-[#0b315b] sm:text-5xl">
              Show{" "}
              <span
                className="relative inline-flex h-[1.08em] items-center overflow-hidden rounded-md bg-[#0b315b] px-2 py-0.5 align-baseline text-white shadow-[0_10px_20px_-14px_rgba(11,49,91,.9)]"
                style={{ width: `${audienceSlotWidthCh}ch` }}
              >
                <span
                  className={`absolute left-2 right-2 inline-block whitespace-nowrap transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    isAudienceVisible
                      ? "translate-y-0 scale-100 opacity-100 blur-0"
                      : "translate-y-1 scale-[0.98] opacity-0 blur-[2px]"
                  }`}
                >
                  {rotatingAudiences[audienceIndex]}
                </span>
              </span>{" "}
              exactly how you change lives.
            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-7 text-[#31465f] sm:text-base">
              This workspace helps your team turn what you know about your program into a clear, practical
              logic model. You will map who you serve, what resources you rely on, what activities you deliver,
              and what outcomes you expect over time.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <article className="rounded-2xl border border-[#9fc3da] bg-[#edf3f8] p-4">
                <h2 className="font-display text-base font-semibold text-[#0b315b]">Why it matters</h2>
                <p className="mt-1.5 text-xs leading-5 text-[#31465f]">
                  Logic models keep strategy, implementation, and learning aligned.
                </p>
              </article>
              <article className="rounded-2xl border border-[#9fc3da] bg-[#edf3f8] p-4">
                <h2 className="font-display text-base font-semibold text-[#0b315b]">What it is for</h2>
                <p className="mt-1.5 text-xs leading-5 text-[#31465f]">
                  Use it for planning, grant applications, onboarding, and evaluation design.
                </p>
              </article>
              <article className="rounded-2xl border border-[#9fc3da] bg-[#edf3f8] p-4">
                <h2 className="font-display text-base font-semibold text-[#0b315b]">How this helps</h2>
                <p className="mt-1.5 text-xs leading-5 text-[#31465f]">
                  AI drafts the first version from your docs and narrative, then coaches refinement.
                </p>
              </article>
            </div>
          </section>

          <section className="rounded-3xl border border-[#9fc3da] bg-white p-6 shadow-[0_12px_30px_-18px_rgba(11,49,91,.55)] sm:p-8">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-[#0b315b]">Kickstart your model</h2>
            <p className="mt-2 text-sm leading-6 text-[#31465f]">
              Upload a planning document, or paste a short program description. Submitting either one takes you straight
              into the chat + logic model workspace.
            </p>

            <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[#48617c]">
                  Upload files (optional)
                </label>
                <button
                  type="button"
                  onClick={openFilePicker}
                  disabled={isSubmitting || isPickerOpen}
                  className="inline-flex w-full items-center justify-between rounded-xl border border-[#9fc3da] bg-[#edf3f8] px-4 py-3 text-sm text-[#0b315b] hover:bg-[#dcebf5] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="truncate">
                    {selectedFiles && selectedFiles.length > 0
                      ? `${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"} selected`
                      : "Choose up to 3 files (.pdf, .docx, .txt, .md)"}
                  </span>
                  <FileUp size={16} className="shrink-0" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    setSelectedFiles(e.target.files && e.target.files.length > 0 ? e.target.files : null);
                    setIsPickerOpen(false);
                  }}
                />
                {selectedFiles && selectedFiles.length > 0 && (
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="truncate text-xs text-[#48617c]">
                      {Array.from(selectedFiles)
                        .map((file) => file.name)
                        .join(", ")}
                    </p>
                    <button
                      type="button"
                      onClick={clearSelectedFiles}
                      disabled={isSubmitting}
                      className="shrink-0 rounded-md border border-[#9fc3da] bg-white px-2 py-1 text-xs font-medium text-[#0b315b] hover:bg-[#edf3f8] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Clear files
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label
                  htmlFor="program-description"
                  className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[#48617c]"
                >
                  Program description (optional)
                </label>
                <textarea
                  id="program-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={7}
                  disabled={isSubmitting}
                  placeholder="Describe your program, who it serves, key activities, and intended outcomes."
                  className="w-full rounded-xl border border-[#9fc3da] bg-white px-3 py-2.5 text-sm leading-6 text-[#0b315b] outline-none placeholder:text-[#6d8096] focus:border-[#47aad8] focus:ring-2 focus:ring-[#d0ebf8] disabled:cursor-not-allowed disabled:bg-[#edf3f8]"
                />
              </div>

              {(formError || error) && <p className="text-xs text-red-600">{formError || error}</p>}

              {isSubmitting && (
                <div className="rounded-xl border border-[#9fc3da] bg-[#edf3f8] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.11em] text-[#48617c]">
                      Document Processing In Progress
                    </p>
                    <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-[#22779f]" />
                  </div>
                  <p className="mt-1.5 text-sm font-medium text-[#0b315b]">{activeStep}...</p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white">
                    <div className="h-full w-1/2 animate-[pulse_1.5s_ease-in-out_infinite] rounded-full bg-[#47aad8]" />
                  </div>
                  <p className="mt-2 text-[11px] text-[#48617c]">
                    Large PDFs can take up to 20-40 seconds. Please keep this tab open.
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0b315b] px-4 py-3 text-sm font-semibold text-white hover:bg-[#082746] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? "Preparing your workspace..." : "Submit and start building"}
                {!isSubmitting && <ArrowRight size={15} />}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
