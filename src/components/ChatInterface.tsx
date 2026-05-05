"use client";

import { useRef, useEffect, useState } from "react";
import { Send, RotateCcw, Loader2 } from "lucide-react";
import { useLogicModelStore, QuickReply } from "@/store/useLogicModelStore";
import DocumentBootstrap from "@/components/DocumentBootstrap";

export default function ChatInterface() {
  const messages = useLogicModelStore((s) => s.messages);
  const isLoading = useLogicModelStore((s) => s.isLoading);
  const addMessage = useLogicModelStore((s) => s.addMessage);
  const applyModelPatch = useLogicModelStore((s) => s.applyModelPatch);
  const setLoading = useLogicModelStore((s) => s.setLoading);
  const resetModel = useLogicModelStore((s) => s.resetModel);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Show text input when there are no active quick replies, or user chose to type
  const [typeInputVisible, setTypeInputVisible] = useState(false);

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

  // Core fetch — sends a message string to the API
  async function sendToApi(text: string) {
    addMessage("user", text);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: messages }),
      });

      const raw = await res.text();
      let data: { reply?: string; modelPatch?: unknown; quickReplies?: QuickReply[]; error?: string } | null = null;

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

      addMessage("assistant", data.reply, data.quickReplies);
      if (data.modelPatch) {
        applyModelPatch(data.modelPatch);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      addMessage("assistant", `Sorry, something went wrong. ${message}`);
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
    if (qr.value === "__type__") {
      setTypeInputVisible(true);
      // Focus the textarea after state update
      setTimeout(() => inputRef.current?.focus(), 50);
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

  const showTextInput = !activeReplies || typeInputVisible;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#9fc3da] bg-[#edf3f8]">
        <div>
          <h2 className="font-display text-base font-semibold text-[#0b315b]">AI Coach</h2>
          <p className="text-xs text-[#48617c]">Logic Model Architect</p>
        </div>
        <button
          onClick={resetModel}
          title="Reset model"
          className="p-1.5 rounded-md text-[#48617c] hover:text-[#0b315b] hover:bg-[#dcebf5] transition-colors"
        >
          <RotateCcw size={15} />
        </button>
      </div>

      <DocumentBootstrap />

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
                  {/* "Type my own" is always last, subtly styled */}
                  {activeReplies.some((qr) => qr.value === "__type__") && (
                    <button
                      onClick={() => handleQuickReply({ label: "I want to type my own answer", value: "__type__" })}
                      disabled={isLoading || typeInputVisible}
                      className="px-3 py-1.5 rounded-full text-xs border border-dashed border-[#9fc3da] bg-transparent text-[#48617c] hover:text-[#0b315b] hover:border-[#47aad8] transition-colors disabled:opacity-40"
                    >
                      I want to type my own answer
                    </button>
                  )}
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
    </div>
  );
}
