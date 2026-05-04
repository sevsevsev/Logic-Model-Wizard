"use client";

import { useRef, useEffect } from "react";
import { Send, RotateCcw, Loader2 } from "lucide-react";
import { useLogicModelStore } from "@/store/useLogicModelStore";
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

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const text = inputRef.current?.value.trim();
    if (!text || isLoading) return;
    inputRef.current!.value = "";

    addMessage("user", text);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: messages }),
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

      // Dual-call: coaching reply + JSON update
      addMessage("assistant", data.reply);
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

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

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
        {messages.map((msg) => (
          <div
            key={msg.id}
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
        ))}

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
    </div>
  );
}
