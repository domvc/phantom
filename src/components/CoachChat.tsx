"use client";

import { useEffect, useRef, useState } from "react";
import { marked } from "marked";
import {
  getUserState,
  setUserState,
  type SyncedData,
  type RaceGoal,
  type AthleteNotes,
  type Plan,
  type BodyMeasurement,
  type ChatMessage as Msg,
} from "@/lib/storage";
type Toast = { id: number; field: string; mode: string; preview: string };

const FIELD_LABELS: Record<string, string> = {
  weeklyPattern: "Weekly pattern",
  upcomingDisruptions: "Upcoming disruptions",
  secondaryGoals: "Secondary goals",
  constraints: "Constraints",
};


marked.setOptions({ breaks: true, gfm: true });

export default function CoachChat({
  synced,
  raceGoal,
  athleteNotes,
  plan,
  bodyMeasurements,
  effectiveWeightKg,
}: {
  synced?: SyncedData;
  raceGoal?: RaceGoal;
  athleteNotes?: AthleteNotes;
  plan?: Plan;
  bodyMeasurements?: BodyMeasurement[];
  effectiveWeightKg?: number | null;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingHtml, setStreamingHtml] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load persisted history on mount
  useEffect(() => {
    const s = getUserState();
    if (s.chatHistory?.length) setMessages(s.chatHistory);
  }, []);

  // Persist on every message change
  useEffect(() => {
    if (messages.length === 0) return;
    setUserState({ chatHistory: messages });
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streamingHtml]);

  function clearChat() {
    if (!confirm("Clear all chat history? This can't be undone.")) return;
    setMessages([]);
    setUserState({ chatHistory: [] });
  }

  const [regenState, setRegenState] = useState<"idle" | "regenerating" | "done" | "error">("idle");
  const [regenError, setRegenError] = useState<string | null>(null);

  async function handlePlanAmendment(input: { description: string }) {
    if (!input.description) return;
    setRegenState("regenerating");
    setRegenError(null);
    try {
      const s = getUserState();
      const newAmendment = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        appliedAt: new Date().toISOString(),
        weekContext: "Coach chat",
        description: input.description,
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
        setRegenState("error");
        setRegenError(data.error || "Plan regeneration failed");
        return;
      }
      setUserState({
        plan: data.plan,
        amendments: allAmendments,
        weeklyBriefs: {},
      });
      window.dispatchEvent(new Event("phantomcoach:plan-generated"));
      setRegenState("done");
      setTimeout(() => setRegenState("idle"), 4000);
    } catch (e) {
      setRegenState("error");
      setRegenError(e instanceof Error ? e.message : "Network error");
    }
  }

  function handleNoteUpdate(input: { field: string; mode: string; content: string }) {
    const allowed = ["weeklyPattern", "upcomingDisruptions", "secondaryGoals", "constraints"];
    if (!allowed.includes(input.field) || !input.content) return;
    const current = getUserState();
    const existing = (current.athleteNotes ?? {}) as AthleteNotes;
    const prev = (existing[input.field as keyof AthleteNotes] as string) || "";
    const next =
      input.mode === "replace"
        ? input.content
        : prev
        ? `${prev.trimEnd()}\n• ${input.content}`
        : `• ${input.content}`;
    setUserState({
      athleteNotes: {
        ...existing,
        [input.field]: next,
        updatedAt: new Date().toISOString(),
      },
    });
    window.dispatchEvent(new Event("phantomcoach:notes-updated"));
    const id = Date.now() + Math.random();
    const toast: Toast = {
      id,
      field: input.field,
      mode: input.mode,
      preview: input.content.length > 80 ? input.content.slice(0, 77) + "…" : input.content,
    };
    setToasts((t) => [...t, toast]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
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
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next,
          synced,
          raceGoal,
          athleteNotes,
          plan,
          bodyMeasurements,
          effectiveWeightKg,
        }),
      });
      if (!res.ok || !res.body) {
        setMessages([
          ...next,
          { role: "assistant", content: `Error ${res.status}. Try again.` },
        ]);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      let buf = "";
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
            } else if (obj.toolUse?.name === "update_athlete_notes") {
              handleNoteUpdate(obj.toolUse.input);
            } else if (obj.toolUse?.name === "apply_plan_amendment") {
              // Fire-and-forget — regen happens in background
              handlePlanAmendment(obj.toolUse.input);
            }
          } catch {
            /* ignore */
          }
        }
      }
      setMessages([...next, { role: "assistant", content: full }]);
      setStreamingHtml("");
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

  return (
    <div className="bg-surface border border-border-soft rounded-md flex flex-col h-[440px] relative">
      <div className="px-4 sm:px-5 py-3 border-b border-border-soft flex items-center justify-between flex-shrink-0">
        <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted font-semibold">
          Coach
        </div>
        <div className="flex items-center gap-3">
          {synced && (
            <div className="text-[10.5px] text-text-muted">
              Grounded in your last sync
            </div>
          )}
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="text-[10.5px] text-text-muted hover:text-accent transition"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Plan regeneration banner */}
      {regenState !== "idle" && (
        <div
          className={`mx-3 mt-2 px-3 py-2 rounded-md text-[11.5px] font-semibold flex items-center gap-2 flex-shrink-0 ${
            regenState === "regenerating"
              ? "bg-accent-soft border border-accent-mid text-accent"
              : regenState === "done"
              ? "bg-go-soft border border-go/30 text-go"
              : "bg-modify-soft border border-[#E8B780] text-modify"
          }`}
        >
          {regenState === "regenerating" && (
            <>
              <span className="inline-flex gap-0.5">
                <span className="size-1 rounded-full bg-accent animate-pulse" />
                <span className="size-1 rounded-full bg-accent animate-pulse [animation-delay:120ms]" />
                <span className="size-1 rounded-full bg-accent animate-pulse [animation-delay:240ms]" />
              </span>
              Rebuilding your plan in the background — Calendar will update automatically.
            </>
          )}
          {regenState === "done" && (
            <>✓ Plan updated. Open Calendar to see the new schedule.</>
          )}
          {regenState === "error" && <>⚠️ Plan rebuild failed: {regenError}</>}
        </div>
      )}

      {/* Toasts: chat-driven note updates */}
      {toasts.length > 0 && (
        <div className="absolute top-12 right-3 z-10 flex flex-col gap-1.5 pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="bg-go-soft border border-go/30 rounded-md px-3 py-2 max-w-[280px] shadow-md text-[11.5px]"
            >
              <div className="flex items-center gap-1.5 font-semibold text-go mb-0.5">
                <span>✓</span>
                <span className="text-[10px] uppercase tracking-wider">
                  {t.mode === "replace" ? "Replaced" : "Saved to"}
                </span>
                <span className="text-[10px] uppercase tracking-wider opacity-80">
                  {FIELD_LABELS[t.field] || t.field}
                </span>
              </div>
              <div className="text-text-mid leading-snug">{t.preview}</div>
            </div>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
        {messages.length === 0 && !streaming && (
          <ChatGreeting plan={plan} raceGoal={raceGoal} synced={synced} onPick={send} />
        )}

        {messages.map((m, i) => (
          <Bubble key={i} msg={m} />
        ))}

        {streaming && (
          <Bubble
            msg={{ role: "assistant", content: "" }}
            html={streamingHtml || `<div class="typing-dots"><span></span><span></span><span></span></div>`}
          />
        )}
      </div>

      <div className="p-3 border-t border-border-soft flex gap-2 items-end flex-shrink-0">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          placeholder={synced ? "Ask your coach…" : "Sync data first"}
          disabled={!synced || streaming}
          className="flex-1 px-3 py-2 bg-bg border border-border rounded-md text-[12.5px] resize-none min-h-[36px] max-h-[120px] focus:outline-none focus:border-accent transition disabled:opacity-50"
        />
        <button
          onClick={() => send(input)}
          disabled={!synced || streaming || !input.trim()}
          className="px-4 py-2 bg-accent hover:bg-accent-h disabled:opacity-30 disabled:cursor-not-allowed text-white text-[12px] font-semibold rounded-md transition self-stretch"
        >
          Send
        </button>
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
        .ai-md h1, .ai-md h2, .ai-md h3 { font-weight: 700; font-size: 13px; margin: 8px 0 4px; }
        .ai-md code { font-family: monospace; font-size: 11.5px; background: var(--color-surface-2); padding: 1px 4px; border-radius: 3px; }
        .ai-md table { font-size: 11.5px; border-collapse: collapse; width: 100%; margin: 6px 0; }
        .ai-md th, .ai-md td { padding: 4px 8px; text-align: left; border-bottom: 1px solid var(--color-border-soft); }
        .ai-md th { font-size: 9.5px; text-transform: uppercase; letter-spacing: .07em; color: var(--color-text-muted); }
      `}</style>
    </div>
  );
}

function ChatGreeting({
  plan,
  raceGoal,
  synced,
  onPick,
}: {
  plan?: Plan;
  raceGoal?: RaceGoal;
  synced?: SyncedData;
  onPick: (text: string) => void;
}) {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const currentPhase = plan?.phases?.find(
    (p) => p.start_date <= todayIso && todayIso <= p.end_date
  );
  const daysToRace = raceGoal?.date
    ? Math.max(0, Math.ceil((+new Date(raceGoal.date) - +today) / 86400000))
    : null;
  const weekIdx = currentPhase
    ? Math.floor((+today - +new Date(currentPhase.start_date)) / (7 * 86400000)) + 1
    : null;
  const phaseLength = currentPhase
    ? currentPhase.weeks_to_end - currentPhase.weeks_from_start + 1
    : null;

  const firstName = synced?.athlete?.name?.split(" ")[0] || "there";

  // Find Saturday's session of this week (often the keystone)
  let keystone: string | null = null;
  if (currentPhase) {
    const sat = currentPhase.weekly_template?.saturday;
    if (Array.isArray(sat) && sat.length) {
      const main = sat.find((s) => s.type !== "rest") || sat[0];
      if (main?.title) keystone = `${main.title} Saturday`;
    }
  }

  const energyChips = [
    "Solid. Ready to push.",
    "Tired today.",
    "Sore — back off?",
    "Slept badly.",
    "Energy is low.",
  ];
  const planChips = [
    "How am I tracking vs the race?",
    "What's the priority this week?",
    "Should I push today?",
    "Read me the next 7 days.",
  ];

  return (
    <div className="space-y-4">
      {/* Plan-context strip */}
      {(currentPhase || daysToRace !== null) && (
        <div className="bg-accent-soft border border-accent-mid rounded-md p-3.5">
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <div className="text-[14px] font-bold text-text">
              {firstName}. Read in.
            </div>
            {daysToRace !== null && (
              <div className="text-[10.5px] uppercase tracking-wider font-bold text-accent">
                {daysToRace} days to race
              </div>
            )}
          </div>
          {currentPhase && (
            <div className="text-[12px] text-text-mid leading-relaxed">
              <strong className="text-accent">{currentPhase.name}</strong>
              {weekIdx && phaseLength ? (
                <> · week {weekIdx} of {phaseLength}</>
              ) : null}
              {currentPhase.focus ? <> · {currentPhase.focus.split(".")[0]}</> : null}.
              {keystone ? (
                <>
                  {" "}
                  Keystone this week: <strong className="text-text">{keystone}</strong>.
                </>
              ) : null}
            </div>
          )}
          {!synced && (
            <div className="text-[11px] text-text-muted mt-1.5">
              Hit <strong>Sync data</strong>. The coach reads numbers, not vibes.
            </div>
          )}
        </div>
      )}

      {/* Quick check-in chips */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted font-bold mb-2">
          Today&apos;s signal
        </div>
        <div className="flex flex-wrap gap-1.5">
          {energyChips.map((s) => (
            <button
              key={s}
              onClick={() => onPick(s)}
              className="text-[11.5px] px-3 py-1.5 bg-bg border border-border-soft hover:border-accent hover:text-accent text-text-mid rounded-full transition"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Plan questions */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted font-bold mb-2">
          Ask the coach
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          {planChips.map((s) => (
            <button
              key={s}
              onClick={() => onPick(s)}
              className="text-left text-[12px] px-3 py-2.5 bg-bg border border-border-soft hover:border-accent hover:text-accent text-text-mid rounded-md transition leading-snug"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
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
    <div className="text-[12.5px] text-text leading-relaxed ai-md">
      <div
        dangerouslySetInnerHTML={{
          __html:
            html ?? (marked.parse(msg.content || "") as string),
        }}
      />
    </div>
  );
}
