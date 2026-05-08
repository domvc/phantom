"use client";

import { useEffect, useRef, useState } from "react";
import { marked } from "marked";
import {
  getUserState,
  setUserState,
  type Plan,
  type SyncedData,
  type RaceGoal,
  type AthleteNotes,
  type PlanAmendment,
} from "@/lib/storage";

marked.setOptions({ breaks: true, gfm: true });

type Msg = { role: "user" | "assistant"; content: string };
type Phase = "chat" | "regenerating" | "done" | "error";

type Props = {
  open: boolean;
  onClose: () => void;
  weekContext: string;
  weekStartDate: string;
  plan?: Plan;
  synced?: SyncedData;
  raceGoal?: RaceGoal;
  athleteNotes?: AthleteNotes;
};

export default function AmendmentChatModal({
  open,
  onClose,
  weekContext,
  weekStartDate,
  plan,
  synced,
  raceGoal,
  athleteNotes,
}: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingHtml, setStreamingHtml] = useState("");
  const [phase, setPhase] = useState<Phase>("chat");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Reset state when modal opens with new week
  useEffect(() => {
    if (open) {
      setMessages([]);
      setInput("");
      setStreamingHtml("");
      setStreaming(false);
      setPhase("chat");
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, weekContext]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streamingHtml]);

  // Esc to close (only when not regenerating)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase !== "regenerating") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, phase]);

  async function applyAmendment(description: string) {
    setPhase("regenerating");
    setError(null);
    try {
      const s = getUserState();
      const newAmendment: PlanAmendment = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        appliedAt: new Date().toISOString(),
        weekContext,
        description,
      };
      const allAmendments = [...(s.amendments || []), newAmendment];

      const res = await fetch("/api/plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          synced: s.synced,
          raceGoal: s.raceGoal,
          athleteNotes: s.athleteNotes,
          amendments: allAmendments,
          sessionFeedbacks: s.sessionFeedbacks,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Plan regeneration failed");
        setPhase("error");
        return;
      }
      setUserState({
        plan: data.plan,
        amendments: allAmendments,
        weeklyBriefs: {}, // invalidate cache — plan changed
      });
      window.dispatchEvent(new Event("phantomcoach:plan-generated"));
      setPhase("done");
      setTimeout(() => onClose(), 2200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setPhase("error");
    }
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    const next: Msg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setStreaming(true);
    setStreamingHtml("");

    try {
      const res = await fetch("/api/chat/amendment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next,
          weekContext,
          weekStartDate,
          plan,
          synced,
          raceGoal,
          athleteNotes,
        }),
      });
      if (!res.ok || !res.body) {
        setMessages([...next, { role: "assistant", content: `Error ${res.status}.` }]);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      let buf = "";
      let toolFired: { description: string } | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") continue;
          try {
            const obj = JSON.parse(payload);
            if (obj.text) {
              full += obj.text;
              setStreamingHtml(marked.parse(full) as string);
            } else if (obj.toolUse?.name === "apply_plan_amendment") {
              toolFired = obj.toolUse.input;
            }
          } catch {
            /* ignore */
          }
        }
      }
      setMessages([...next, { role: "assistant", content: full }]);
      setStreamingHtml("");

      if (toolFired?.description) {
        await applyAmendment(toolFired.description);
      }
    } catch (e) {
      setMessages([
        ...next,
        {
          role: "assistant",
          content: `Connection error — ${e instanceof Error ? e.message : "unknown"}`,
        },
      ]);
    } finally {
      setStreaming(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-sm"
      onClick={() => phase !== "regenerating" && onClose()}
    >
      <div
        className="bg-bg border border-border rounded-t-2xl sm:rounded-lg max-w-2xl w-full h-[92vh] sm:h-[80vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 sm:px-7 py-4 border-b border-border-soft flex items-start justify-between gap-3 sm:gap-4 flex-shrink-0">
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-accent font-bold mb-1">
              Amend plan · {weekContext}
            </div>
            <h2 className="text-lg font-bold tracking-tight">Need something to change?</h2>
            <p className="text-[12px] text-text-muted mt-1">
              Describe what&apos;s coming up — injury, travel, social, or just a swap. The
              coach will propose changes; on your confirmation, the plan rebuilds and
              displaced sessions are recuperated elsewhere.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={phase === "regenerating"}
            className="text-text-muted hover:text-text text-2xl leading-none flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
          {messages.length === 0 && !streaming && (
            <div className="space-y-3">
              <div className="text-[13px] text-text-mid leading-relaxed">
                Tell the coach what&apos;s changing for{" "}
                <strong className="text-text font-semibold">{weekContext}</strong>. Some
                examples:
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {[
                  "Wedding this Saturday — can't train",
                  "Calf is sore, want to keep volume low",
                  "Want to swap Tuesday and Wednesday",
                  "Travelling — can run, no bike or pool",
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left text-[12px] px-3 py-2.5 bg-surface border border-border-soft hover:border-accent hover:text-accent text-text-mid rounded-md transition leading-snug"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <Bubble key={i} msg={m} />
          ))}

          {streaming && (
            <Bubble
              msg={{ role: "assistant", content: "" }}
              html={
                streamingHtml ||
                `<div class="typing-dots"><span></span><span></span><span></span></div>`
              }
            />
          )}

          {phase === "regenerating" && (
            <div className="bg-accent-soft border border-accent-mid rounded-md p-4">
              <div className="flex items-center gap-3">
                <div className="inline-flex gap-1">
                  <span className="size-1.5 rounded-full bg-accent animate-pulse" />
                  <span className="size-1.5 rounded-full bg-accent animate-pulse [animation-delay:120ms]" />
                  <span className="size-1.5 rounded-full bg-accent animate-pulse [animation-delay:240ms]" />
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-accent">
                    Rebuilding your plan…
                  </div>
                  <div className="text-[11.5px] text-text-mid">
                    Recuperating displaced sessions across upcoming weeks.
                  </div>
                </div>
              </div>
            </div>
          )}

          {phase === "done" && (
            <div className="bg-go-soft border border-go/30 rounded-md p-4 text-[13px] text-go font-semibold flex items-center gap-2">
              <span>✓</span> Plan updated. Calendar refreshing now.
            </div>
          )}

          {phase === "error" && (
            <div className="bg-modify-soft border border-[#E8B780] rounded-md p-4 text-[12.5px] text-modify">
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-3 border-t border-border-soft flex gap-2 items-end flex-shrink-0">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder={
              phase === "chat" ? "Describe what's changing…" : "Plan being updated…"
            }
            disabled={phase !== "chat" || streaming}
            className="flex-1 px-3 py-2 bg-bg border border-border rounded-md text-[12.5px] resize-none min-h-[36px] max-h-[120px] focus:outline-none focus:border-accent transition disabled:opacity-50"
          />
          <button
            onClick={() => send(input)}
            disabled={phase !== "chat" || streaming || !input.trim()}
            className="px-4 py-2 bg-accent hover:bg-accent-h disabled:opacity-30 disabled:cursor-not-allowed text-white text-[12px] font-semibold rounded-md transition self-stretch"
          >
            Send
          </button>
        </div>
      </div>

      <style>{`
        .typing-dots { display:flex; gap:4px; align-items:center; padding:4px 0; }
        .typing-dots span {
          width:5px; height:5px; border-radius:50%;
          background: var(--color-text-muted);
          animation: pulse 1.2s ease-in-out infinite;
        }
        .typing-dots span:nth-child(2){animation-delay:.2s;}
        .typing-dots span:nth-child(3){animation-delay:.4s;}
        @keyframes pulse{0%,60%,100%{opacity:.25;transform:scale(1);}30%{opacity:1;transform:scale(1.3);}}
        .ai-md p { margin-bottom: 6px; }
        .ai-md p:last-child { margin-bottom: 0; }
        .ai-md strong { font-weight: 600; }
        .ai-md ul, .ai-md ol { padding-left: 16px; margin-bottom: 6px; }
        .ai-md li { margin-bottom: 3px; }
      `}</style>
    </div>
  );
}

function Bubble({ msg, html }: { msg: Msg; html?: string }) {
  if (msg.role === "user") {
    return (
      <div className="text-right">
        <div className="inline-block bg-accent-soft border border-accent-mid text-text px-3 py-2 rounded-md text-[12.5px] max-w-[85%] text-left">
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="text-[13px] text-text leading-relaxed ai-md">
      <div
        dangerouslySetInnerHTML={{
          __html: html ?? (marked.parse(msg.content || "") as string),
        }}
      />
    </div>
  );
}
