"use client";

import { useEffect, useRef, useState } from "react";
import { marked } from "marked";
import {
  getUserState,
  setUserState,
  type RecentActivity,
  type SyncedData,
  type AthleteNotes,
  type RaceGoal,
  type PlanPhase,
  type PlannedSession,
  type SessionFeedback,
} from "@/lib/storage";

marked.setOptions({ breaks: true, gfm: true });

type Msg = { role: "user" | "assistant"; content: string };

type AnalysisFields = {
  headline?: string;
  performance?: string;
  signals?: string;
  takeaway?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  activity: RecentActivity | null;
  plannedSession?: PlannedSession | null;
  phase?: PlanPhase | null;
  synced?: SyncedData;
  athleteNotes?: AthleteNotes;
  raceGoal?: RaceGoal;
};

export default function SessionFeedbackModal({
  open,
  onClose,
  activity,
  plannedSession,
  phase,
  synced,
  athleteNotes,
  raceGoal,
}: Props) {
  const [analysis, setAnalysis] = useState<AnalysisFields>({});
  const [analysisRaw, setAnalysisRaw] = useState("");
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingHtml, setStreamingHtml] = useState("");
  const [savedToast, setSavedToast] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const reqIdRef = useRef(0);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Reset when opening with a new activity
  useEffect(() => {
    if (!open || !activity) return;
    const myId = ++reqIdRef.current;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setAnalysis({});
    setAnalysisRaw("");
    setMessages([]);
    setStreamingHtml("");
    setAnalysisError(null);
    setLoadingAnalysis(true);

    const userState = getUserState();
    const recentFeedback = (userState.sessionFeedbacks || []).slice(-5);
    // Recent main-coach chat history. Lets the analyser/feedback coach see
    // anything the athlete already told the main coach (e.g. "I'm doing a
    // 100km ride today") so it doesn't act surprised at the same activity.
    const recentChat = (userState.chatHistory || []).slice(-12);

    (async () => {
      try {
        const res = await fetch("/api/session/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            activity,
            plannedSession,
            phase,
            synced,
            athleteNotes,
            recentFeedback,
            recentChat,
          }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          if (myId === reqIdRef.current) {
            setAnalysisError(`Server returned ${res.status}`);
            setLoadingAnalysis(false);
          }
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let raw = "";
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
                raw += obj.text;
                if (myId === reqIdRef.current) {
                  setAnalysisRaw(raw);
                  setAnalysis(parseAnalysis(raw));
                }
              } else if (obj.error) {
                if (myId === reqIdRef.current) setAnalysisError(obj.error);
              }
            } catch {
              /* ignore */
            }
          }
        }
        if (myId === reqIdRef.current) setLoadingAnalysis(false);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        if (myId === reqIdRef.current) {
          setAnalysisError(e instanceof Error ? e.message : "Network error");
          setLoadingAnalysis(false);
        }
      }
    })();

    return () => ctrl.abort();
  }, [open, activity, plannedSession, phase, synced, athleteNotes]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight });
  }, [messages, streamingHtml]);

  function handleSaveFeedback(input: { summary: string }) {
    if (!activity || !input.summary) return;
    const fb: SessionFeedback = {
      activityId: activity.id,
      activityDate: activity.date,
      activityName: activity.name,
      feedback: input.summary,
      recordedAt: new Date().toISOString(),
    };
    const current = getUserState();
    const all = [...(current.sessionFeedbacks || []), fb];
    setUserState({ sessionFeedbacks: all });
    window.dispatchEvent(new Event("phantomcoach:feedback-saved"));
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 4000);
  }

  async function send(text: string) {
    if (!activity) return;
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    const next: Msg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setStreaming(true);
    setStreamingHtml("");

    try {
      const recentChat = (getUserState().chatHistory || []).slice(-12);
      const res = await fetch("/api/chat/session-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next,
          activity,
          plannedSession,
          analysis: analysisRaw,
          synced,
          athleteNotes,
          raceGoal,
          recentChat,
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
            } else if (obj.toolUse?.name === "save_session_feedback") {
              handleSaveFeedback(obj.toolUse.input);
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
        { role: "assistant", content: `Connection error — ${e instanceof Error ? e.message : "unknown"}` },
      ]);
    } finally {
      setStreaming(false);
    }
  }

  if (!open || !activity) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-bg border-l border-border w-full max-w-xl h-full flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-border-soft flex items-start justify-between gap-3 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted font-semibold mb-1">
              Last session ·{" "}
              {new Date(activity.date).toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "short",
              })}
            </div>
            <h2 className="text-lg font-bold tracking-tight truncate">{activity.name}</h2>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11.5px] text-text-mid">
              <span>
                <strong>{activity.type}</strong>
              </span>
              {activity.distance_km != null && <span>{activity.distance_km}km</span>}
              {activity.duration_min != null && <span>{activity.duration_min} min</span>}
              {activity.tss != null && (
                <span>
                  <strong className="text-accent">{activity.tss}</strong> TSS
                </span>
              )}
              {activity.avg_hr != null && <span>HR avg {activity.avg_hr}</span>}
              {activity.intensity != null && (
                <span>IF {(activity.intensity / 100).toFixed(2)}</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text text-2xl leading-none flex-shrink-0"
          >
            ×
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto">
          {/* Analysis */}
          <div className="p-4 sm:p-6 border-b border-border-soft space-y-4">
            <div className="text-[10px] uppercase tracking-[0.12em] text-accent font-bold">
              Analysis
            </div>

            {analysisError && (
              <div className="text-[12.5px] text-modify">⚠️ {analysisError}</div>
            )}

            {analysis.headline && (
              <div className="bg-accent-soft border border-accent-mid rounded-md p-4">
                <div className="text-[14px] font-bold text-accent leading-snug">
                  {analysis.headline}
                </div>
              </div>
            )}

            <AnaBlock label="Performance vs expected" content={analysis.performance} loading={loadingAnalysis} />
            <AnaBlock label="Signals" content={analysis.signals} loading={loadingAnalysis} markdown />
            <AnaBlock label="Takeaway for coming sessions" content={analysis.takeaway} loading={loadingAnalysis} />
          </div>

          {/* Feedback chat */}
          <div className="p-4 sm:p-6">
            <div className="text-[10px] uppercase tracking-[0.12em] text-accent font-bold mb-3">
              Your take
            </div>
            <p className="text-[12px] text-text-muted mb-4 leading-relaxed">
              How did it feel? Anything off? The coach will record your reflection and weigh
              it into upcoming sessions.
            </p>

            {messages.length === 0 && !streaming && (
              <div className="grid grid-cols-2 gap-2 mb-4">
                {[
                  "Felt easier than expected — could've pushed",
                  "Legs heavy throughout, dragged me",
                  "Solid — hit the targets cleanly",
                  "Cut short — life got in the way",
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left text-[11.5px] px-3 py-2 bg-surface border border-border-soft hover:border-accent hover:text-accent text-text-mid rounded-md transition leading-snug"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div ref={chatScrollRef} className="space-y-3 max-h-[280px] overflow-y-auto">
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

            {savedToast && (
              <div className="mt-3 bg-go-soft border border-go/30 text-go rounded-md p-2.5 text-[11.5px] font-semibold flex items-center gap-2">
                ✓ Feedback saved — your future plan will weigh this in.
              </div>
            )}
          </div>
        </div>

        {/* Input */}
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
            placeholder="Tell the coach how it went…"
            disabled={streaming}
            className="flex-1 px-3 py-2 bg-bg border border-border rounded-md text-[12.5px] resize-none min-h-[36px] max-h-[120px] focus:outline-none focus:border-accent transition"
          />
          <button
            onClick={() => send(input)}
            disabled={streaming || !input.trim()}
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
        `}</style>
      </div>
    </div>
  );
}

function parseAnalysis(raw: string): AnalysisFields {
  const sections: Record<string, string> = {};
  const re = /---([A-Z]+)---/g;
  const positions: { name: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    positions.push({ name: m[1], start: m.index, end: m.index + m[0].length });
  }
  for (let i = 0; i < positions.length; i++) {
    const cur = positions[i];
    if (cur.name === "END") break;
    const next = positions[i + 1];
    const content = raw.slice(cur.end, next ? next.start : raw.length).trim();
    sections[cur.name] = content;
  }
  return {
    headline: sections.HEADLINE,
    performance: sections.PERFORMANCE,
    signals: sections.SIGNALS,
    takeaway: sections.TAKEAWAY,
  };
}

function AnaBlock({
  label,
  content,
  loading,
  markdown,
}: {
  label: string;
  content?: string;
  loading: boolean;
  markdown?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.1em] text-text-muted font-bold mb-1.5">
        {label}
      </div>
      {content ? (
        markdown ? (
          <div
            className="text-[12.5px] text-text leading-relaxed"
            dangerouslySetInnerHTML={{ __html: marked.parse(content) as string }}
          />
        ) : (
          <p className="text-[12.5px] text-text leading-relaxed">{content}</p>
        )
      ) : loading ? (
        <div className="space-y-1.5">
          <div className="h-2 bg-surface-2 rounded-full animate-pulse w-[88%]" />
          <div className="h-2 bg-surface-2 rounded-full animate-pulse w-[72%] [animation-delay:120ms]" />
        </div>
      ) : null}
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
          __html: html ?? (marked.parse(msg.content || "") as string),
        }}
      />
    </div>
  );
}
