"use client";

import { useRef, useEffect, useState } from "react";
import { Send, RotateCcw, Loader2, ThumbsUp, ThumbsDown, Download } from "lucide-react";
import {
  useLogicModelStore,
  QuickReply,
  ChatMessage,
  RetentionMemory,
  ConversationFocusLock,
} from "@/store/useLogicModelStore";
import { LOCAL_CLOUD_USER_KEY } from "@/lib/drafts/types";
import DocumentBootstrap from "@/components/DocumentBootstrap";
import type { DebugSnapshotCapture, LlmTraceMeta } from "@/lib/feedback/types";
import type { ConversationTranscript } from "@/lib/chat/transcript";

type LlmCallSummary = {
  atIso: string;
  model: string;
  path: "agentic" | "legacy" | "unknown";
  fallbackReason?: string | null;
  trace?: LlmTraceMeta;
};

const FEEDBACK_REASONS = [
  "Incorrect or made up",
  "Missed my context",
  "Not actionable",
  "Unclear wording",
];

const DEBUG_SNAPSHOT_MESSAGE_LIMIT = 80;
const DEBUG_SNAPSHOT_CONTENT_CHAR_LIMIT = 4000;

function truncateMessageContent(content: string): string {
  if (content.length <= DEBUG_SNAPSHOT_CONTENT_CHAR_LIMIT) return content;
  return `${content.slice(0, DEBUG_SNAPSHOT_CONTENT_CHAR_LIMIT)}\n\n[truncated for debug report size]`;
}

function limitMessagesForSnapshot(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .slice(-DEBUG_SNAPSHOT_MESSAGE_LIMIT)
    .map((message) => ({
      ...message,
      content: truncateMessageContent(message.content),
    }));
}

export default function ChatInterface() {
  // Wider chat window: add a max-w-3xl and center
  const model = useLogicModelStore((s) => s.model);
  const retentionMemory = useLogicModelStore((s) => s.retentionMemory);
  const focusLock = useLogicModelStore((s) => s.focusLock);
  const transcript = useLogicModelStore((s) => s.transcript);
  const isLoading = useLogicModelStore((s) => s.isLoading);
  const addMessage = useLogicModelStore((s) => s.addMessage);
  const applyModelPatch = useLogicModelStore((s) => s.applyModelPatch);
  const applyRetentionMemory = useLogicModelStore((s) => s.applyRetentionMemory);
  const setFocusLock = useLogicModelStore((s) => s.setFocusLock);
  const setLoading = useLogicModelStore((s) => s.setLoading);
  const setActiveRevisionProposal = useLogicModelStore((s) => s.setActiveRevisionProposal);
  const revisionLifecycle = useLogicModelStore((s) => s.revisionLifecycle);
  const setRevisionLifecycle = useLogicModelStore((s) => s.setRevisionLifecycle);
  const setTranscript = useLogicModelStore((s) => s.setTranscript);
  const resetModel = useLogicModelStore((s) => s.resetModel);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Show text input when there are no active quick replies, or user chose to type
  const [typeInputVisible, setTypeInputVisible] = useState(false);
  const [feedbackTargetId, setFeedbackTargetId] = useState<string | null>(null);
  const [feedbackReason, setFeedbackReason] = useState("");
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackSavingId, setFeedbackSavingId] = useState<string | null>(null);
  const [feedbackSavedByMessage, setFeedbackSavedByMessage] = useState<Record<string, "up" | "down">>({});
  const [feedbackErrorByMessage, setFeedbackErrorByMessage] = useState<Record<string, string>>({});
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportBugDescription, setExportBugDescription] = useState("");
  const [exportBugError, setExportBugError] = useState<string | null>(null);
  const [exportSaving, setExportSaving] = useState(false);
  const [exportStatusMessage, setExportStatusMessage] = useState<string | null>(null);
  const [llmTelemetry, setLlmTelemetry] = useState<LlmCallSummary[]>([]);
  const [traceByMessageId, setTraceByMessageId] = useState<
    Record<string, Omit<LlmCallSummary, "atIso">>
  >({});
  const exportDescriptionRef = useRef<HTMLTextAreaElement>(null);
  const latestLlmCall = llmTelemetry.length > 0 ? llmTelemetry[llmTelemetry.length - 1] : null;

  // Active quick replies: only when last message is an assistant message with suggestions
  const lastMsg = messages[messages.length - 1];
  const activeReplies: QuickReply[] | undefined =
    !isLoading && lastMsg?.role === "assistant" && lastMsg.quickReplies?.length
      ? lastMsg.quickReplies
      : undefined;

  // Reset "expand input" state each time a new assistant message arrives
  useEffect(() => {
    setTypeInputVisible(false);
  }, [lastMsg?.id]);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    if (!isExportModalOpen) return;
    setTimeout(() => exportDescriptionRef.current?.focus(), 20);
  }, [isExportModalOpen]);

  // Core fetch — sends a message string to the API
  async function sendToApi(text: string) {
    addMessage("user", text);
    if (revisionLifecycle.status === "pending") {
      setRevisionLifecycle({
        status: "dismissed",
        originalText: revisionLifecycle.originalText,
        revisedText: revisionLifecycle.revisedText,
        rationale: revisionLifecycle.rationale,
      });
    }
    setActiveRevisionProposal(null);
    setLoading(true);

    try {
      const collaboratorId = requireCollaboratorId();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(collaboratorId ? { "x-user-id": collaboratorId } : {}),
        },
        body: JSON.stringify({
          message: text,
          history: messages,
          model,
          revisionLifecycle,
          retentionMemory,
          focusLock,
          transcript,
        }),
      });

      const raw = await res.text();
      let data:
        | {
            reply?: string;
            modelPatch?: unknown;
            revisionProposal?: {
              shouldRevise?: boolean;
              originalText?: string;
              revisedText?: string;
              rationale?: string;
              evidenceRefs?: string[];
              confidence?: number;
            } | null;
            quickReplies?: QuickReply[];
            error?: string;
            llmMeta?: {
              model?: string | null;
              path?: string | null;
              fallbackReason?: string | null;
              trace?: LlmTraceMeta | null;
            };
            retentionMemory?: unknown;
            focusLock?: unknown;
            transcript?: unknown;
          }
        | null = null;

      try {
        data = raw
          ? (JSON.parse(raw) as { reply?: string; modelPatch?: unknown; quickReplies?: QuickReply[]; error?: string })
          : null;
      } catch {
        const hint = !res.ok ? ` (HTTP ${res.status})` : "";
        throw new Error(`Server returned a non-JSON response${hint}.`);
      }

      if (!res.ok) throw new Error(data?.error || `Request failed (HTTP ${res.status}).`);
      if (!data?.reply) throw new Error("Response is missing assistant reply.");

      const usedModel = data.llmMeta?.model?.trim();
      const usedPath = data.llmMeta?.path?.trim();
      let pendingTrace:
        | Omit<LlmCallSummary, "atIso">
        | null = null;
      if (usedModel) {
        const normalizedPath: "agentic" | "legacy" | "unknown" =
          usedPath === "agentic" || usedPath === "legacy" ? usedPath : "unknown";
        pendingTrace = {
          model: usedModel,
          path: normalizedPath,
          fallbackReason: data.llmMeta?.fallbackReason ?? null,
          trace: data.llmMeta?.trace ?? undefined,
        };
        setLlmTelemetry((prev) =>
          [
            ...prev,
            {
              atIso: new Date().toISOString(),
              model: usedModel,
              path: normalizedPath,
              fallbackReason: data.llmMeta?.fallbackReason ?? null,
              trace: data.llmMeta?.trace ?? undefined,
            },
          ].slice(-30)
        );
      }

      addMessage("assistant", data.reply, data.quickReplies);
      if (pendingTrace) {
        const latestMessage = useLogicModelStore.getState().messages.at(-1);
        if (latestMessage?.role === "assistant") {
          setTraceByMessageId((prev) => ({
            ...prev,
            [latestMessage.id]: pendingTrace!,
          }));
        }
      }
      const proposal = data.revisionProposal ?? null;
      setActiveRevisionProposal(proposal);
      if (proposal?.revisedText) {
        setRevisionLifecycle({
          status: "pending",
          originalText: proposal.originalText,
          revisedText: proposal.revisedText,
          rationale: proposal.rationale,
        });
      }
      if (data.modelPatch) {
        applyModelPatch(data.modelPatch);
      }
      if (data.retentionMemory) {
        applyRetentionMemory(data.retentionMemory as RetentionMemory);
      }
      if (Object.prototype.hasOwnProperty.call(data ?? {}, "focusLock")) {
        if (data?.focusLock === null || data?.focusLock === undefined) {
          setFocusLock(null);
        } else {
          setFocusLock(data.focusLock as ConversationFocusLock);
        }
      }
      if (data.transcript) {
        setTranscript(data.transcript as ConversationTranscript);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      addMessage("assistant", `Sorry, something went wrong. ${message}`);
      setActiveRevisionProposal(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    const text = inputRef.current?.value.trim();
    if (!text || isLoading) return;
    inputRef.current!.value = "";
    await sendToApi(text);
  }

  async function handleQuickReply(qr: QuickReply) {
    if (isLoading) return;
    if (qr.action === "open-input" || qr.value === "__type__") {
      setTypeInputVisible(true);
      // Focus the textarea after state update
      setTimeout(() => inputRef.current?.focus(), 50);
      return;
    }
    if (qr.action === "prefill") {
      setTypeInputVisible(true);
      setTimeout(() => {
        if (!inputRef.current) return;
        inputRef.current.focus();
        inputRef.current.value = qr.value;
        const end = inputRef.current.value.length;
        inputRef.current.setSelectionRange(end, end);
      }, 50);
      return;
    }
    if (qr.value === "__population_focus__") {
      setTypeInputVisible(true);
      setTimeout(() => {
        if (!inputRef.current) return;
        inputRef.current.focus();
        if (!inputRef.current.value.trim()) {
          inputRef.current.value = "We focus especially on students who ...";
        }
      }, 50);
      return;
    }
    if (/:\s*$/.test(qr.value)) {
      setTypeInputVisible(true);
      setTimeout(() => {
        if (!inputRef.current) return;
        inputRef.current.focus();
        inputRef.current.value = qr.value;
        const end = inputRef.current.value.length;
        inputRef.current.setSelectionRange(end, end);
      }, 50);
      return;
    }
    await sendToApi(qr.value);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function requireCollaboratorId(): string | null {
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

  function buildDebugSnapshotPayload(bugDescription: string): DebugSnapshotCapture {
    const store = useLogicModelStore.getState();
    const now = new Date();
    const limitedMessages = limitMessagesForSnapshot(store.messages);
    const draftSnapshot = store.getDraftSnapshot();
    const limitedDraftMessages = limitMessagesForSnapshot(draftSnapshot.messages);
    const wasMainHistoryTruncated = limitedMessages.length < store.messages.length;
    const wasDraftHistoryTruncated = limitedDraftMessages.length < draftSnapshot.messages.length;
    const safeUserId =
      typeof window !== "undefined"
        ? window.localStorage.getItem(LOCAL_CLOUD_USER_KEY)
        : null;

    return {
      schemaVersion: "logic-model-debug-snapshot-v1",
      exportedAtIso: now.toISOString(),
      exportedAtUnixMs: now.getTime(),
      app: {
        name: "lm-chatbot",
        runtime: "browser",
      },
      llm: {
        recentCalls: llmTelemetry,
      },
      session: {
        userId: safeUserId,
        messageCount: store.messages.length,
        assistantMessageCount: store.messages.filter((m) => m.role === "assistant").length,
        userMessageCount: store.messages.filter((m) => m.role === "user").length,
      },
      browser: typeof window !== "undefined"
        ? {
            userAgent: window.navigator.userAgent,
            language: window.navigator.language,
            url: window.location.href,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }
        : null,
      ui: {
        isLoading: store.isLoading,
        activeQuickReplies:
          store.messages.length > 0 &&
          store.messages[store.messages.length - 1]?.role === "assistant"
            ? (store.messages[store.messages.length - 1]?.quickReplies ?? [])
            : [],
      },
      model: store.model,
      messages: limitedMessages,
      draftSnapshot: {
        ...draftSnapshot,
        messages: limitedDraftMessages,
      },
      feedbackReport: {
        description: bugDescription,
        capturedAtIso: now.toISOString(),
      },
      conceptCodingReview: {
        entries: [],
      },
      notes: [
        "Attach this file to your bug report chat.",
        "Include what you expected, what happened, and which message looked wrong.",
        ...(wasMainHistoryTruncated || wasDraftHistoryTruncated
          ? [
              `Chat history was truncated to the latest ${DEBUG_SNAPSHOT_MESSAGE_LIMIT} messages to keep the report saveable.`,
            ]
          : []),
      ],
    };
  }

  function handleExportRequest() {
    setExportBugDescription("");
    setExportBugError(null);
    setExportStatusMessage(null);
    setIsExportModalOpen(true);
  }

  async function handleExportConfirm() {
    const description = exportBugDescription.trim();
    if (description.length < 20) {
      setExportBugError("Please provide at least 20 characters so the export has enough debugging detail.");
      return;
    }

    const userId = requireCollaboratorId();
    if (!userId) {
      setExportBugError("Could not determine user ID for saving the report.");
      return;
    }

    setExportSaving(true);
    setExportBugError(null);

    try {
      const capture = buildDebugSnapshotPayload(description);
      const res = await fetch("/api/feedback/debug", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({ capture }),
      });

      if (!res.ok) {
        let message = "Failed to save debug report.";
        try {
          const payload = (await res.json()) as { error?: unknown };
          if (typeof payload?.error === "string" && payload.error.trim().length > 0) {
            message = payload.error;
          }
        } catch {
          // Ignore JSON parse failures and keep the default message.
        }
        throw new Error(message);
      }

      setIsExportModalOpen(false);
      setExportBugDescription("");
      setExportBugError(null);
      setExportStatusMessage("Debug report saved. You can submit another report anytime.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save the debug report. Please try again.";
      setExportBugError(message);
    } finally {
      setExportSaving(false);
    }
  }

  function handleExportCancel() {
    setIsExportModalOpen(false);
    setExportBugDescription("");
    setExportBugError(null);
    setExportSaving(false);
  }

  async function submitFeedback(
    assistantMessageId: string,
    assistantMessage: string,
    assistantIndex: number,
    rating: "up" | "down"
  ) {
    if (feedbackSavingId) return;

    const userId = requireCollaboratorId();
    if (!userId) return;

    const reason = feedbackReason.trim();
    const comment = feedbackComment.trim();

    if (rating === "down" && !reason && !comment) {
      setFeedbackErrorByMessage((prev) => ({
        ...prev,
        [assistantMessageId]: "Select a reason or add a note.",
      }));
      return;
    }

    const historyStart = Math.max(0, assistantIndex - 20);
    const history = messages.slice(historyStart, assistantIndex + 1);
    const precedingUserMessage = [...messages.slice(0, assistantIndex)]
      .reverse()
      .find((msg) => msg.role === "user")?.content;

    setFeedbackSavingId(assistantMessageId);
    setFeedbackErrorByMessage((prev) => {
      const next = { ...prev };
      delete next[assistantMessageId];
      return next;
    });

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({
          capture: {
            assistantMessageId,
            assistantMessage,
            rating,
            reason: reason || undefined,
            comment: comment || undefined,
            precedingUserMessage,
            history,
            modelSnapshot: model,
            submittedAt: new Date().toISOString(),
          },
        }),
      });

      if (!res.ok) {
        throw new Error("Could not save feedback.");
      }

      setFeedbackSavedByMessage((prev) => ({ ...prev, [assistantMessageId]: rating }));
      setFeedbackTargetId((current) => (current === assistantMessageId ? null : current));
      setFeedbackReason("");
      setFeedbackComment("");
    } catch {
      setFeedbackErrorByMessage((prev) => ({
        ...prev,
        [assistantMessageId]: "Could not save feedback. Please try again.",
      }));
    } finally {
      setFeedbackSavingId(null);
    }
  }

  const showTextInput = !activeReplies || typeInputVisible;

  return (
    <div className="flex flex-col h-full bg-white max-w-3xl mx-auto px-2 sm:px-6 md:px-8">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#9fc3da] bg-[#edf3f8]">
        <div>
          <h2 className="font-display text-base font-semibold text-[#0b315b]">AI Coach</h2>
          <p className="text-xs text-[#48617c]">Logic Model Architect</p>
          {latestLlmCall && (
            <p className="text-[10px] text-[#48617c]">
              {latestLlmCall.model} ({latestLlmCall.path})
              {latestLlmCall.fallbackReason ? ` • fallback: ${latestLlmCall.fallbackReason}` : ""}
              {latestLlmCall.trace?.finalIntent ? ` • intent: ${latestLlmCall.trace.finalIntent}` : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <a
            href="/debug-reports"
            title="View saved debug reports"
            className="inline-flex items-center gap-1.5 rounded-md border border-[#9fc3da] bg-white px-2 py-1 text-[11px] text-[#48617c] hover:text-[#0b315b] hover:border-[#47aad8] transition-colors"
          >
            View reports
          </a>
          <button
            onClick={handleExportRequest}
            title="Save debug report"
            className="inline-flex items-center gap-1.5 rounded-md border border-[#9fc3da] bg-white px-2 py-1 text-[11px] text-[#48617c] hover:text-[#0b315b] hover:border-[#47aad8] transition-colors"
          >
            <Download size={13} />
            Save report
          </button>
          <button
            onClick={resetModel}
            title="Reset model"
            className="p-1.5 rounded-md text-[#48617c] hover:text-[#0b315b] hover:bg-[#dcebf5] transition-colors"
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </div>

      <DocumentBootstrap />

      {exportStatusMessage && (
        <div className="px-4 py-2 border-b border-[#c6deed] bg-[#eef8f0] text-xs text-[#1f6b2a]">
          {exportStatusMessage}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg, idx) => {
          const isLastAssistant =
            msg.role === "assistant" && idx === messages.length - 1;
          const showPills =
            isLastAssistant && activeReplies && activeReplies.length > 0;

          return (
            <div key={msg.id}>
              <div
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-[#0b315b] text-white rounded-br-sm"
                      : "bg-[#edf3f8] text-[#0b315b] rounded-bl-sm border border-[#c6deed]"
                  }`}
                >
                  {msg.content}
                </div>
              </div>

              {msg.role === "assistant" && (
                <div className="mt-1 ml-1">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => submitFeedback(msg.id, msg.content, idx, "up")}
                      disabled={Boolean(feedbackSavedByMessage[msg.id]) || feedbackSavingId === msg.id}
                      className="inline-flex items-center gap-1 rounded-md border border-[#c6deed] bg-white px-2 py-1 text-[11px] text-[#48617c] hover:text-[#0b315b] hover:border-[#9fc3da] disabled:opacity-50"
                    >
                      <ThumbsUp size={12} /> Helpful
                    </button>
                    <button
                      onClick={() => {
                        setFeedbackTargetId((current) => (current === msg.id ? null : msg.id));
                        setFeedbackReason("");
                        setFeedbackComment("");
                        setFeedbackErrorByMessage((prev) => {
                          const next = { ...prev };
                          delete next[msg.id];
                          return next;
                        });
                      }}
                      disabled={Boolean(feedbackSavedByMessage[msg.id]) || feedbackSavingId === msg.id}
                      className="inline-flex items-center gap-1 rounded-md border border-[#c6deed] bg-white px-2 py-1 text-[11px] text-[#48617c] hover:text-[#0b315b] hover:border-[#9fc3da] disabled:opacity-50"
                    >
                      <ThumbsDown size={12} /> Needs work
                    </button>
                    {feedbackSavedByMessage[msg.id] && (
                      <span className="text-[11px] text-[#48617c]">Feedback saved</span>
                    )}
                  </div>

                  {feedbackTargetId === msg.id && !feedbackSavedByMessage[msg.id] && (
                    <div className="mt-2 rounded-lg border border-[#c6deed] bg-white p-2.5">
                      <p className="text-[11px] text-[#48617c] mb-2">What was the issue?</p>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {FEEDBACK_REASONS.map((reason) => {
                          const selected = feedbackReason === reason;
                          return (
                            <button
                              key={reason}
                              onClick={() => setFeedbackReason(reason)}
                              className={`px-2 py-1 rounded-full text-[11px] border ${
                                selected
                                  ? "border-[#47aad8] bg-[#d0ebf8] text-[#0b315b]"
                                  : "border-[#c6deed] bg-white text-[#48617c] hover:border-[#9fc3da]"
                              }`}
                            >
                              {reason}
                            </button>
                          );
                        })}
                      </div>
                      <textarea
                        value={feedbackComment}
                        onChange={(e) => setFeedbackComment(e.target.value)}
                        rows={2}
                        placeholder="Optional note"
                        className="w-full resize-none rounded-md border border-[#c6deed] px-2 py-1.5 text-xs text-[#0b315b] placeholder:text-[#6d8096] outline-none focus:border-[#47aad8]"
                      />
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <button
                          onClick={() => {
                            setFeedbackTargetId(null);
                            setFeedbackReason("");
                            setFeedbackComment("");
                          }}
                          className="text-[11px] text-[#48617c] hover:text-[#0b315b]"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => submitFeedback(msg.id, msg.content, idx, "down")}
                          disabled={feedbackSavingId === msg.id}
                          className="inline-flex items-center rounded-md bg-[#0b315b] px-2.5 py-1 text-[11px] text-white hover:bg-[#082746] disabled:opacity-50"
                        >
                          {feedbackSavingId === msg.id ? "Saving..." : "Submit feedback"}
                        </button>
                      </div>
                      {feedbackErrorByMessage[msg.id] && (
                        <p className="mt-1 text-[11px] text-red-600">{feedbackErrorByMessage[msg.id]}</p>
                      )}
                    </div>
                  )}

                  {feedbackErrorByMessage[msg.id] && feedbackTargetId !== msg.id && (
                    <p className="mt-1 text-[11px] text-red-600">{feedbackErrorByMessage[msg.id]}</p>
                  )}

                  {traceByMessageId[msg.id] && (
                    <details className="mt-1 rounded-md border border-[#c6deed] bg-white px-2 py-1.5">
                      <summary className="cursor-pointer text-[11px] text-[#48617c]">
                        Trace: {traceByMessageId[msg.id].model} ({traceByMessageId[msg.id].path})
                        {traceByMessageId[msg.id].fallbackReason
                          ? ` • fallback: ${traceByMessageId[msg.id].fallbackReason}`
                          : ""}
                      </summary>
                      <pre className="mt-1 overflow-auto rounded bg-[#f1f6fa] p-2 text-[10px] leading-relaxed text-[#0b315b]">
                        {JSON.stringify(traceByMessageId[msg.id].trace ?? {}, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              {/* Quick-reply pills below the latest assistant bubble */}
              {showPills && (
                <div className="flex flex-wrap gap-2 mt-2 ml-1">
                  {activeReplies
                    .filter((qr) => qr.value !== "__type__")
                    .map((qr) => (
                      <button
                        key={qr.value}
                        onClick={() => handleQuickReply(qr)}
                        disabled={isLoading}
                        className="px-3 py-1.5 rounded-full text-xs font-medium border border-[#9fc3da] bg-white text-[#0b315b] hover:bg-[#d0ebf8] hover:border-[#47aad8] transition-colors disabled:opacity-40"
                      >
                        {qr.label}
                      </button>
                    ))}
                  {/* Always provide a manual typing path when chips are shown */}
                  <button
                    onClick={() => handleQuickReply({ label: "I want to type my own answer", value: "__type__", action: "open-input" })}
                    disabled={isLoading || typeInputVisible}
                    className="px-3 py-1.5 rounded-full text-xs border border-dashed border-[#9fc3da] bg-transparent text-[#48617c] hover:text-[#0b315b] hover:border-[#47aad8] transition-colors disabled:opacity-40"
                  >
                    I want to type my own answer
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-[#edf3f8] border border-[#c6deed] rounded-2xl rounded-bl-sm px-4 py-2.5 flex items-center gap-2 text-[#48617c]">
              <Loader2 size={14} className="animate-spin" />
              <span className="text-xs">Thinking…</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {showTextInput && (
        <div className="px-4 py-3 border-t border-[#9fc3da] bg-[#edf3f8]">
          <div className="flex items-end gap-2 bg-white border border-[#9fc3da] rounded-xl px-3 py-2 focus-within:border-[#47aad8] focus-within:ring-2 focus-within:ring-[#d0ebf8] transition-all">
            <textarea
              ref={inputRef}
              rows={1}
              onKeyDown={handleKeyDown}
              placeholder="Describe your program…"
              className="flex-1 resize-none text-sm text-[#0b315b] placeholder:text-[#6d8096] outline-none bg-transparent max-h-32"
            />
            <button
              onClick={handleSend}
              disabled={isLoading}
              className="p-1.5 rounded-lg bg-[#0b315b] text-white hover:bg-[#082746] disabled:opacity-40 transition-colors shrink-0"
            >
              <Send size={14} />
            </button>
          </div>
          <p className="text-[10px] text-[#6d8096] mt-1.5 text-center">
            Shift+Enter for new line · Enter to send
          </p>
        </div>
      )}

      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b315b]/35 p-4">
          <div className="w-full max-w-xl rounded-xl border border-[#9fc3da] bg-white p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-[#0b315b]">Export debug snapshot</h3>
            <p className="mt-1 text-xs text-[#48617c]">
              Describe what went wrong. This report will be saved on the server so your team can review it later without sharing downloaded files.
            </p>

            <textarea
              ref={exportDescriptionRef}
              value={exportBugDescription}
              onChange={(e) => {
                setExportBugDescription(e.target.value);
                if (exportBugError) setExportBugError(null);
              }}
              rows={7}
              placeholder="Example: After I answered the geography question with specific ZIP codes, the assistant repeated a generic follow-up and the quick-reply chips were for impact drafting instead of population focus."
              className="mt-3 w-full resize-y rounded-md border border-[#c6deed] px-3 py-2 text-sm text-[#0b315b] placeholder:text-[#6d8096] outline-none focus:border-[#47aad8]"
            />

            {exportBugError && (
              <p className="mt-2 text-xs text-red-600">{exportBugError}</p>
            )}

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                onClick={handleExportCancel}
                disabled={exportSaving}
                className="rounded-md border border-[#c6deed] px-3 py-1.5 text-xs text-[#48617c] hover:text-[#0b315b]"
              >
                Cancel
              </button>
              <button
                onClick={handleExportConfirm}
                disabled={exportSaving}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#0b315b] px-3 py-1.5 text-xs text-white hover:bg-[#082746] disabled:opacity-50"
              >
                <Download size={12} />
                {exportSaving ? "Saving..." : "Save report"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
