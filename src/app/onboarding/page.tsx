"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import {
  getUserState,
  setUserState,
  type IntervalsConnection,
  type RaceGoal,
  type AthleteNotes,
  type Plan,
} from "@/lib/storage";
import {
  PhantomLogo,
  GarminWordmark,
  StravaWordmark,
  ZwiftWordmark,
  WahooWordmark,
  TrainingPeaksWordmark,
  CorosWordmark,
  AppleWatchWordmark,
  CheckIcon,
  PulseIcon,
  ArrowRightIcon,
} from "@/components/icons";

marked.setOptions({ breaks: true, gfm: true });

type Step =
  | "welcome"
  | "intervals"
  | "race"
  | "goals"
  | "sync"
  | "plan"
  | "done";

const FLOW: Step[] = ["intervals", "race", "goals", "sync", "plan"];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");

  // Resume mid-flow if user previously dropped out
  useEffect(() => {
    const s = getUserState();
    if (s.intervals && !s.raceGoal) setStep("race");
    else if (s.intervals && s.raceGoal && !s.athleteNotes) setStep("goals");
    else if (s.intervals && s.raceGoal && s.athleteNotes && !s.synced) setStep("sync");
    else if (s.synced && !s.plan) setStep("plan");
  }, []);

  return (
    <main className="flex flex-1 flex-col">
      <header className="border-b border-border-soft">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="text-[15px]">
            <PhantomLogo size={18} />
          </Link>
          <StepIndicator current={step} />
        </div>
      </header>

      <div className="flex-1 flex items-start justify-center px-6 py-10 sm:py-14">
        <div className="w-full max-w-xl">
          {step === "welcome" && <Welcome onNext={() => setStep("intervals")} />}

          {step === "intervals" && (
            <IntervalsStep
              onNext={(conn) => {
                setUserState({ intervals: conn });
                setStep("race");
              }}
              onBack={() => setStep("welcome")}
            />
          )}

          {step === "race" && (
            <RaceStep
              onNext={(goal) => {
                setUserState({ raceGoal: goal });
                setStep("goals");
              }}
              onBack={() => setStep("intervals")}
            />
          )}

          {step === "goals" && (
            <GoalsChatStep
              onNext={(notes) => {
                setUserState({
                  athleteNotes: { ...notes, updatedAt: new Date().toISOString() },
                });
                setStep("sync");
              }}
              onBack={() => setStep("race")}
            />
          )}

          {step === "sync" && (
            <SyncStep
              onNext={() => setStep("plan")}
              onBack={() => setStep("goals")}
            />
          )}

          {step === "plan" && (
            <PlanStep
              onNext={() => {
                setUserState({ onboardingComplete: true });
                setStep("done");
                setTimeout(() => router.push("/dashboard"), 800);
              }}
              onBack={() => setStep("sync")}
            />
          )}

          {step === "done" && <Done />}
        </div>
      </div>
    </main>
  );
}

function StepIndicator({ current }: { current: Step }) {
  if (current === "welcome" || current === "done") {
    return (
      <span className="text-[11px] text-text-muted font-medium">
        {current === "welcome" ? "Setup overview" : "All done"}
      </span>
    );
  }
  const idx = FLOW.indexOf(current);
  return (
    <div className="flex items-center gap-2">
      {FLOW.map((s, i) => (
        <div
          key={s}
          className={`h-1.5 w-7 rounded-full transition-colors ${
            i <= idx ? "bg-accent" : "bg-border"
          }`}
        />
      ))}
      <span className="ml-2 text-[11px] text-text-muted font-medium">
        {idx + 1} of {FLOW.length}
      </span>
    </div>
  );
}

/* ─── Step 0: Welcome ─────────────────────────────────────────── */

function Welcome({ onNext }: { onNext: () => void }) {
  const steps = [
    {
      n: "1",
      title: "Connect Intervals.icu",
      desc: "Paste your API key. Thirty seconds.",
    },
    {
      n: "2",
      title: "Set your race",
      desc: "Type, date, target time. Or just the date.",
    },
    {
      n: "3",
      title: "Answer a few questions",
      desc: "Goals, training pattern, constraints. Two minutes of chat.",
    },
    {
      n: "4",
      title: "Data syncs",
      desc: "Six months of activities, fitness, wellness — read automatically.",
    },
    {
      n: "5",
      title: "Plan builds",
      desc: "Phased, multi-sport, calibrated to today. Race day is the anchor.",
    },
  ];

  return (
    <div>
      <div className="text-center">
        <div className="text-[11px] uppercase tracking-[0.12em] text-accent font-semibold mb-3">
          Welcome to Phantomcoach
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
          Five steps. Under five minutes.
        </h1>
        <p className="text-text-mid text-[14px] leading-relaxed max-w-md mx-auto">
          Connect your data. Set your race. Answer a few questions. Phantomcoach
          builds the plan.
        </p>
      </div>

      {/* Garmin-via-Intervals explainer */}
      <div className="mt-9 bg-surface border border-border-soft rounded-md p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="size-8 rounded-md bg-accent-soft border border-accent-mid flex items-center justify-center flex-shrink-0">
            <PulseIcon size={16} className="text-accent" />
          </div>
          <div>
            <div className="font-semibold text-[13.5px] text-text">
              We connect through Intervals.icu
            </div>
            <p className="text-[12px] text-text-mid leading-relaxed mt-1">
              Intervals.icu is the elite analytics platform that already reads
              your data from <strong className="text-text">Garmin</strong>,{" "}
              <strong className="text-text">Strava</strong>,{" "}
              <strong className="text-text">Wahoo</strong>,{" "}
              <strong className="text-text">Zwift</strong>,{" "}
              <strong className="text-text">TrainingPeaks</strong>,{" "}
              <strong className="text-text">Coros</strong>, and{" "}
              <strong className="text-text">Apple Watch</strong>. One key, every
              source. You own the connection.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-3 border-t border-border-soft text-text-muted">
          <GarminWordmark />
          <TrainingPeaksWordmark />
          <StravaWordmark />
          <ZwiftWordmark />
          <WahooWordmark />
          <CorosWordmark />
          <AppleWatchWordmark />
        </div>
        <div className="text-[10px] uppercase tracking-[0.1em] font-semibold text-text-muted text-right pt-2">
          <ArrowRightIcon size={10} className="inline mr-1.5" />
          All flowing into Intervals.icu
        </div>
      </div>

      {/* Step preview */}
      <div className="mt-7 grid gap-2.5">
        {steps.map((s) => (
          <StepPreview key={s.n} n={s.n} title={s.title} desc={s.desc} />
        ))}
      </div>

      <button
        onClick={onNext}
        className="mt-9 w-full px-5 py-3 bg-accent hover:bg-accent-h text-white text-[13px] font-semibold rounded-md transition"
      >
        Let&apos;s start →
      </button>
    </div>
  );
}

function StepPreview({
  n,
  title,
  desc,
}: {
  n: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex gap-4 p-4 bg-surface border border-border-soft rounded-md">
      <div className="size-7 rounded-full bg-bg border border-accent-mid flex items-center justify-center text-accent font-bold text-[12px] flex-shrink-0">
        {n}
      </div>
      <div>
        <div className="font-semibold text-[13px] text-text">{title}</div>
        <div className="text-[12px] text-text-mid mt-0.5">{desc}</div>
      </div>
    </div>
  );
}

/* ─── Step 1: Intervals ──────────────────────────────────────── */

function IntervalsStep({
  onNext,
  onBack,
}: {
  onNext: (c: IntervalsConnection) => void;
  onBack: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [athleteId, setAthleteId] = useState("");
  const [showWalkthrough, setShowWalkthrough] = useState(true);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = getUserState();
    if (s.intervals) {
      setApiKey(s.intervals.apiKey);
      setAthleteId(s.intervals.athleteId);
    }
  }, []);

  async function handleConnect() {
    setError(null);
    setValidating(true);
    try {
      const res = await fetch("/api/intervals/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim(), athleteId: athleteId.trim() }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Connection failed");
        return;
      }
      onNext({
        apiKey: apiKey.trim(),
        athleteId: data.athleteId,
        athleteName: data.athleteName,
        connectedAt: new Date().toISOString(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setValidating(false);
    }
  }

  const canSubmit = apiKey.trim().length > 8 && athleteId.trim().length > 0 && !validating;

  return (
    <div>
      <BackButton onBack={onBack} />
      <StepHeader
        label="Step 1 of 5"
        title="Connect Intervals.icu"
        desc="We pull activities, fitness metrics, and wellness signals so your coach has the full picture. We never see your password."
      />

      <div className="bg-surface border border-border-soft rounded-md mb-6">
        <button
          onClick={() => setShowWalkthrough(!showWalkthrough)}
          className="w-full flex items-center justify-between p-4 text-left"
        >
          <span className="font-semibold text-[13px]">
            How to find your API key (30 seconds)
          </span>
          <span
            className={`text-text-muted text-xl leading-none transition-transform ${
              showWalkthrough ? "rotate-45" : ""
            }`}
          >
            +
          </span>
        </button>
        {showWalkthrough && (
          <div className="px-4 pb-5 text-[12.5px] text-text-mid space-y-3 border-t border-border-soft pt-4">
            <Inst n="1">
              Go to{" "}
              <a
                href="https://intervals.icu/settings"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent font-semibold hover:underline"
              >
                intervals.icu/settings
              </a>{" "}
              (sign in if needed)
            </Inst>
            <Inst n="2">
              Scroll down to <strong>Developer Settings</strong> → click{" "}
              <strong>API Key</strong>
            </Inst>
            <Inst n="3">
              Copy the key (looks like{" "}
              <code className="bg-surface-2 px-1.5 py-0.5 rounded text-[11.5px]">
                56u8x5l3pp...
              </code>
              ) and paste below
            </Inst>
            <Inst n="4">
              Your <strong>athlete ID</strong> is in your profile URL — it starts with{" "}
              <code className="bg-surface-2 px-1.5 py-0.5 rounded text-[11.5px]">i</code>{" "}
              followed by digits (e.g.{" "}
              <code className="bg-surface-2 px-1.5 py-0.5 rounded text-[11.5px]">
                i571756
              </code>
              )
            </Inst>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <Field label="API key" hint="From intervals.icu/settings → Developer Settings">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="56u8x5l3pp…"
            className="w-full px-3 py-2.5 bg-bg border border-border rounded-md font-mono text-[12.5px] focus:outline-none focus:border-accent transition"
            autoComplete="off"
          />
        </Field>
        <Field label="Athlete ID" hint="From your profile URL — starts with 'i'">
          <input
            type="text"
            value={athleteId}
            onChange={(e) => setAthleteId(e.target.value)}
            placeholder="i571756"
            className="w-full px-3 py-2.5 bg-bg border border-border rounded-md font-mono text-[12.5px] focus:outline-none focus:border-accent transition"
            autoComplete="off"
          />
        </Field>

        {error && (
          <div className="p-3 bg-modify-soft border border-[#E8B780] rounded-md text-[12.5px] text-modify">
            {error}
          </div>
        )}

        <button
          onClick={handleConnect}
          disabled={!canSubmit}
          className="w-full px-5 py-3 bg-accent hover:bg-accent-h disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold rounded-md transition"
        >
          {validating ? "Validating connection…" : "Test & connect"}
        </button>
        <p className="text-[11px] text-text-muted text-center">
          Your key is encrypted at rest. We pull data on demand and never share it.
        </p>
      </div>
    </div>
  );
}

/* ─── Step 2: Race goal only ─────────────────────────────────── */

function RaceStep({
  onNext,
  onBack,
}: {
  onNext: (g: RaceGoal) => void;
  onBack: () => void;
}) {
  const [goal, setGoal] = useState<RaceGoal>({
    name: "",
    type: "Half Ironman",
    date: "",
    targetTime: "",
    notes: "",
  });

  useEffect(() => {
    const s = getUserState();
    if (s.raceGoal) setGoal(s.raceGoal);
  }, []);

  const types: RaceGoal["type"][] = [
    "5K",
    "10K",
    "HM",
    "Marathon",
    "Olympic Tri",
    "Half Ironman",
    "Ironman",
    "Other",
  ];

  const canSubmit = !!(goal.name && goal.date);

  return (
    <div>
      <BackButton onBack={onBack} />
      <StepHeader
        label="Step 2 of 5"
        title="Tell us your race."
        desc="The plan is built backwards from race day. Add more races later in Settings."
      />

      <div className="space-y-5">
        <Field label="Race name" hint="e.g. Outlaw Half, Klagenfurt 70.3">
          <input
            type="text"
            value={goal.name}
            onChange={(e) => setGoal({ ...goal, name: e.target.value })}
            placeholder="My A-race"
            className="w-full px-3 py-2.5 bg-bg border border-border rounded-md text-[13px] focus:outline-none focus:border-accent transition"
          />
        </Field>

        <Field label="Race type">
          <div className="grid grid-cols-4 gap-2">
            {types.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setGoal({ ...goal, type: t })}
                className={`px-2 py-2 text-[11.5px] font-semibold rounded-md border transition ${
                  goal.type === t
                    ? "bg-accent text-white border-accent"
                    : "bg-bg text-text-mid border-border hover:border-accent hover:text-accent"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Race date">
            <input
              type="date"
              value={goal.date}
              onChange={(e) => setGoal({ ...goal, date: e.target.value })}
              className="w-full px-3 py-2.5 bg-bg border border-border rounded-md text-[13px] focus:outline-none focus:border-accent transition"
            />
          </Field>
          <Field label="Target time" hint="HH:MM:SS · optional">
            <input
              type="text"
              value={goal.targetTime}
              onChange={(e) => setGoal({ ...goal, targetTime: e.target.value })}
              placeholder="4:45:00"
              className="w-full px-3 py-2.5 bg-bg border border-border rounded-md font-mono text-[13px] focus:outline-none focus:border-accent transition"
            />
          </Field>
        </div>

        <button
          onClick={() => onNext(goal)}
          disabled={!canSubmit}
          className="w-full px-5 py-3 bg-accent hover:bg-accent-h disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold rounded-md transition"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

/* ─── Step 3: AI goals chat ──────────────────────────────────── */

type ChatMsg = { role: "user" | "assistant"; content: string };

function GoalsChatStep({
  onNext,
  onBack,
}: {
  onNext: (notes: AthleteNotes) => void;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingHtml, setStreamingHtml] = useState("");
  const [capturedNotes, setCapturedNotes] = useState<AthleteNotes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-start the chat with the AI's opening question
  useEffect(() => {
    if (started) return;
    setStarted(true);
    sendMessage([], true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streamingHtml]);

  useEffect(() => {
    if (!streaming) inputRef.current?.focus();
  }, [streaming]);

  async function sendMessage(history: ChatMsg[], isOpening = false) {
    setStreaming(true);
    setStreamingHtml("");
    setError(null);
    try {
      const s = getUserState();
      const res = await fetch("/api/onboarding/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          athleteName: s.intervals?.athleteName,
          raceGoal: s.raceGoal,
        }),
      });
      if (!res.ok || !res.body) {
        setError(`Server returned ${res.status}`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let full = "";
      let toolFired: AthleteNotes | null = null;
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
            } else if (obj.toolUse?.name === "save_athlete_notes") {
              toolFired = obj.toolUse.input as AthleteNotes;
            }
          } catch {
            /* ignore */
          }
        }
      }
      setMessages([...history, { role: "assistant", content: full }]);
      setStreamingHtml("");

      if (toolFired) {
        setCapturedNotes(toolFired);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setStreaming(false);
    }
    void isOpening;
  }

  function handleSend() {
    const text = input.trim();
    if (!text || streaming || capturedNotes) return;
    const next: ChatMsg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    sendMessage(next);
  }

  return (
    <div>
      <BackButton onBack={onBack} />
      <StepHeader
        label="Step 3 of 5"
        title="A few quick questions."
        desc="The coach will ask about your training pattern, constraints, and any goals beyond the race. Two minutes of chat — answer however briefly works."
      />

      <div className="bg-surface border border-border-soft rounded-md flex flex-col h-[440px] mb-4">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3">
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
          {error && (
            <div className="p-3 bg-modify-soft border border-[#E8B780] rounded-md text-[12px] text-modify">
              ⚠️ {error}
            </div>
          )}
          {capturedNotes && (
            <div className="p-3 bg-go-soft border border-go/30 rounded-md text-[12.5px] text-go font-semibold flex items-center gap-2">
              <CheckIcon size={14} /> Got everything we need.
            </div>
          )}
        </div>

        <div className="p-3 border-t border-border-soft flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={1}
            disabled={streaming || !!capturedNotes}
            placeholder={
              capturedNotes ? "All set — continue below" : "Type your answer…"
            }
            className="flex-1 px-3 py-2 bg-bg border border-border rounded-md text-[12.5px] resize-none min-h-[36px] max-h-[100px] focus:outline-none focus:border-accent transition disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={streaming || !input.trim() || !!capturedNotes}
            className="px-4 py-2 bg-accent hover:bg-accent-h disabled:opacity-30 disabled:cursor-not-allowed text-white text-[12px] font-semibold rounded-md transition self-stretch"
          >
            Send
          </button>
        </div>
      </div>

      <button
        onClick={() => capturedNotes && onNext(capturedNotes)}
        disabled={!capturedNotes}
        className="w-full px-5 py-3 bg-accent hover:bg-accent-h disabled:opacity-30 disabled:cursor-not-allowed text-white text-[13px] font-semibold rounded-md transition"
      >
        Continue →
      </button>

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
  );
}

function Bubble({ msg, html }: { msg: ChatMsg; html?: string }) {
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

/* ─── Step 4: Sync ───────────────────────────────────────────── */

function SyncStep({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [progressLines, setProgressLines] = useState<string[]>([]);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    runSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSync() {
    setPhase("syncing");
    setError(null);
    setProgressLines([]);

    const lines = [
      "Connecting to Intervals.icu…",
      "Pulling 6 months of activities…",
      "Reading fitness metrics (CTL, ATL, TSB)…",
      "Loading wellness & recovery signals…",
      "Computing readiness state…",
    ];

    let i = 0;
    const interval = setInterval(() => {
      if (i < lines.length) {
        setProgressLines((prev) => [...prev, lines[i]]);
        i++;
      }
    }, 700);

    try {
      const s = getUserState();
      if (!s.intervals) {
        clearInterval(interval);
        setError("Intervals.icu connection not found.");
        setPhase("error");
        return;
      }
      const res = await fetch("/api/intervals/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: s.intervals.apiKey,
          athleteId: s.intervals.athleteId,
        }),
      });
      const data = await res.json();
      clearInterval(interval);
      // Ensure all progress lines render before completing
      setProgressLines(lines);

      if (!data.ok) {
        setError(data.error || "Sync failed");
        setPhase("error");
        return;
      }
      setUserState({ synced: data });
      setPhase("done");
      window.dispatchEvent(new Event("phantomcoach:synced"));
    } catch (e) {
      clearInterval(interval);
      setError(e instanceof Error ? e.message : "Network error");
      setPhase("error");
    }
  }

  return (
    <div>
      <BackButton onBack={onBack} disabled={phase === "syncing"} />
      <StepHeader
        label="Step 4 of 5"
        title="Pulling your data."
        desc="Reading the last 6 months of training, wellness, and fitness metrics from Intervals.icu. This is what your coach reasons against."
      />

      <div className="bg-surface border border-border-soft rounded-md p-5 mb-4 min-h-[220px]">
        {progressLines.map((line, i) => {
          const isLast = i === progressLines.length - 1 && phase === "syncing";
          return (
            <div
              key={i}
              className="flex items-center gap-3 py-1.5 text-[12.5px] text-text-mid"
            >
              {isLast ? (
                <span className="inline-flex gap-0.5">
                  <span className="size-1.5 rounded-full bg-accent animate-pulse" />
                  <span className="size-1.5 rounded-full bg-accent animate-pulse [animation-delay:120ms]" />
                  <span className="size-1.5 rounded-full bg-accent animate-pulse [animation-delay:240ms]" />
                </span>
              ) : (
                <CheckIcon size={12} className="text-go" />
              )}
              <span>{line}</span>
            </div>
          );
        })}
        {phase === "done" && (
          <div className="mt-4 pt-4 border-t border-border-soft flex items-center gap-2 text-[12.5px] text-go font-semibold">
            <CheckIcon size={14} /> Synced. Building your plan next.
          </div>
        )}
        {phase === "error" && error && (
          <div className="mt-4 pt-4 border-t border-border-soft text-[12.5px] text-modify">
            ⚠️ {error}
          </div>
        )}
      </div>

      {phase === "error" ? (
        <button
          onClick={runSync}
          className="w-full px-5 py-3 bg-accent hover:bg-accent-h text-white text-[13px] font-semibold rounded-md transition"
        >
          Retry sync
        </button>
      ) : (
        <button
          onClick={onNext}
          disabled={phase !== "done"}
          className="w-full px-5 py-3 bg-accent hover:bg-accent-h disabled:opacity-30 disabled:cursor-not-allowed text-white text-[13px] font-semibold rounded-md transition"
        >
          Continue →
        </button>
      )}
    </div>
  );
}

/* ─── Step 5: Plan generation ────────────────────────────────── */

const ESTIMATED_PLAN_SECONDS = 32;

function buildTailoredProgressLines(
  raceGoal: RaceGoal,
  notes?: AthleteNotes
): string[] {
  const today = new Date();
  const raceDate = new Date(raceGoal.date);
  const weeks = Math.max(
    1,
    Math.ceil((raceDate.getTime() - today.getTime()) / (7 * 86400000))
  );

  const triTypes: RaceGoal["type"][] = ["Olympic Tri", "Half Ironman", "Ironman"];
  const runTypes: RaceGoal["type"][] = ["5K", "10K", "HM", "Marathon"];
  const isTri = triTypes.includes(raceGoal.type);
  const isRun = runTypes.includes(raceGoal.type);

  const exclusionText = `${notes?.constraints || ""} ${notes?.weeklyPattern || ""}`.toLowerCase();
  const noSwim = /no swim|skip swim|no pool|pool closed|can'?t swim/.test(exclusionText);
  const noBike = /no bike|no cycl|no riding|can'?t cycle|can'?t ride/.test(exclusionText);
  const noStrength = /no strength|no gym|no lifting/.test(exclusionText);

  const goalText = (notes?.secondaryGoals || "").toLowerCase();
  const wantsLean = /body ?fat|lean|cut\b|drop weight|lose weight/.test(goalText);
  const wantsStrong = /strength|stronger|muscle|squat|deadlift|\blift/.test(goalText);

  const raceLabel =
    raceGoal.type === "Half Ironman"
      ? "70.3"
      : raceGoal.type === "Ironman"
      ? "Ironman"
      : raceGoal.type === "Olympic Tri"
      ? "Olympic-distance triathlon"
      : raceGoal.type === "Marathon"
      ? "marathon"
      : raceGoal.type === "HM"
      ? "half marathon"
      : raceGoal.type === "10K"
      ? "10K"
      : raceGoal.type === "5K"
      ? "5K"
      : "race";

  const raceName = raceGoal.name || raceLabel;
  const lines: string[] = [];

  lines.push("Reading your last 6 months of training history…");
  lines.push(
    `Mapping ${weeks} ${weeks === 1 ? "week" : "weeks"} from today to ${raceName}…`
  );

  if (isTri) {
    lines.push("Designing tri-specific phases — base, build, peak, taper…");
    const sports: string[] = [];
    if (!noSwim) sports.push("swim");
    if (!noBike) sports.push("bike");
    sports.push("run");
    const sportsLabel =
      sports.length === 3
        ? "swim, bike, and run"
        : sports.join(" and ");
    lines.push(`Sequencing ${sportsLabel} sessions for ${raceLabel}…`);
  } else if (isRun) {
    lines.push(`Designing run-focused phases for the ${raceLabel}…`);
    if (raceGoal.type === "5K" || raceGoal.type === "10K") {
      lines.push("Sequencing intervals, tempo, and easy runs…");
    } else {
      lines.push("Sequencing long runs, threshold work, and easy days…");
    }
  } else {
    lines.push("Designing phases — base, build, peak, taper…");
    lines.push("Sequencing your weekly sessions…");
  }

  if (wantsStrong) {
    lines.push("Adding strength sessions as a primary focus…");
  } else if (!noStrength) {
    lines.push("Adding strength and mobility around your training…");
  }

  if (wantsLean) {
    lines.push("Calibrating fuelling targets for body composition…");
  }

  if (raceGoal.targetTime) {
    lines.push(
      `Setting test points and the taper for ${raceGoal.targetTime}…`
    );
  } else {
    lines.push("Setting test points, milestones, and the taper…");
  }

  return lines;
}

function PlanStep({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "generating" | "done" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startedRef = useRef(false);

  // Tailored progress lines from user state — computed once on mount
  const lines = useMemo(() => {
    const s = getUserState();
    if (!s.raceGoal) return [];
    return buildTailoredProgressLines(s.raceGoal, s.athleteNotes);
  }, []);

  const lineDurationMs = (ESTIMATED_PLAN_SECONDS * 1000) / Math.max(lines.length, 1);

  // Reveal lines based on elapsed time; once done, reveal all
  const revealedCount =
    phase === "done"
      ? lines.length
      : Math.min(lines.length, Math.floor((elapsed * 1000) / lineDurationMs) + 1);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    runGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Elapsed-time tick while generating
  useEffect(() => {
    if (phase !== "generating") return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  async function runGenerate() {
    setPhase("generating");
    setError(null);
    setElapsed(0);

    try {
      const s = getUserState();
      const res = await fetch("/api/plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          synced: s.synced,
          raceGoal: s.raceGoal,
          athleteNotes: s.athleteNotes,
          amendments: s.amendments,
          sessionFeedbacks: s.sessionFeedbacks,
        }),
      });

      if (!res.ok || !res.body) {
        setError(`Plan generation failed (HTTP ${res.status})`);
        setPhase("error");
        return;
      }

      // Read streamed text body
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let raw = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();

      const errMarker = raw.indexOf("__STREAM_ERROR__:");
      if (errMarker !== -1) {
        setError(raw.slice(errMarker + "__STREAM_ERROR__:".length).trim() || "Stream error");
        setPhase("error");
        return;
      }

      const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
      let parsed: {
        total_weeks?: number;
        phases?: Plan["phases"];
        milestones?: Plan["milestones"];
        rationale?: string;
      };
      try {
        parsed = JSON.parse(cleaned);
      } catch (e) {
        setError(`Plan JSON parse failed: ${e instanceof Error ? e.message : "unknown"}`);
        setPhase("error");
        return;
      }

      const raceGoal = s.raceGoal;
      if (!raceGoal) {
        setError("Race goal missing");
        setPhase("error");
        return;
      }

      const today = new Date();
      const race = new Date(raceGoal.date);
      const totalWeeks = Math.max(
        1,
        Math.ceil((race.getTime() - today.getTime()) / (7 * 86_400_000))
      );

      const plan = {
        generated_at: new Date().toISOString(),
        race: {
          name: raceGoal.name,
          date: raceGoal.date,
          type: raceGoal.type,
        },
        total_weeks: parsed.total_weeks ?? totalWeeks,
        phases: parsed.phases ?? [],
        milestones: parsed.milestones ?? [],
        rationale: parsed.rationale,
      };

      setUserState({ plan, weeklyBriefs: {} });
      setPhase("done");
      window.dispatchEvent(new Event("phantomcoach:plan-generated"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setPhase("error");
    }
  }

  const remaining = Math.max(0, ESTIMATED_PLAN_SECONDS - elapsed);
  const progressPct =
    phase === "done"
      ? 100
      : Math.min(96, (elapsed / ESTIMATED_PLAN_SECONDS) * 100);

  const statusLabel =
    phase === "done"
      ? "Complete"
      : phase === "error"
      ? "Failed"
      : remaining > 0
      ? `~${remaining}s remaining`
      : "Almost there…";

  return (
    <div>
      <BackButton onBack={onBack} disabled={phase === "generating"} />
      <StepHeader
        label="Step 5 of 5"
        title="Building your plan."
        desc="The coach is generating your phased programme using your data, your race goal, and the answers you just gave. This takes around 30 seconds."
      />

      {/* Header with countdown + progress bar */}
      <div className="bg-surface border border-border-soft rounded-md p-5 mb-4">
        <div className="flex items-baseline justify-between mb-3">
          <div className="text-[10.5px] uppercase tracking-[0.12em] font-bold text-text-muted">
            {phase === "done" ? "Plan ready" : "Generating plan"}
          </div>
          <div
            className={`text-[12px] font-semibold tabular-nums ${
              phase === "done"
                ? "text-go"
                : phase === "error"
                ? "text-modify"
                : "text-accent"
            }`}
          >
            {statusLabel}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-border-soft rounded-full overflow-hidden mb-5">
          <div
            className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
              phase === "done" ? "bg-go" : phase === "error" ? "bg-modify" : "bg-accent"
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Tailored progress lines */}
        <div className="space-y-1">
          {lines.slice(0, revealedCount).map((line, i) => {
            const isCurrent =
              i === revealedCount - 1 && phase === "generating";
            return (
              <div
                key={i}
                className="flex items-center gap-3 py-1 text-[12.5px] text-text-mid"
              >
                {isCurrent ? (
                  <span className="inline-flex gap-0.5">
                    <span className="size-1.5 rounded-full bg-accent animate-pulse" />
                    <span className="size-1.5 rounded-full bg-accent animate-pulse [animation-delay:120ms]" />
                    <span className="size-1.5 rounded-full bg-accent animate-pulse [animation-delay:240ms]" />
                  </span>
                ) : (
                  <CheckIcon size={12} className="text-go" />
                )}
                <span>{line}</span>
              </div>
            );
          })}
        </div>

        {phase === "done" && (
          <div className="mt-4 pt-4 border-t border-border-soft flex items-center gap-2 text-[12.5px] text-go font-semibold">
            <CheckIcon size={14} /> Plan ready. Let&apos;s open your dashboard.
          </div>
        )}
        {phase === "error" && error && (
          <div className="mt-4 pt-4 border-t border-border-soft text-[12.5px] text-modify">
            ⚠️ {error}
          </div>
        )}
      </div>

      {phase === "error" ? (
        <button
          onClick={runGenerate}
          className="w-full px-5 py-3 bg-accent hover:bg-accent-h text-white text-[13px] font-semibold rounded-md transition"
        >
          Retry generation
        </button>
      ) : (
        <button
          onClick={onNext}
          disabled={phase !== "done"}
          className="w-full px-5 py-3 bg-accent hover:bg-accent-h disabled:opacity-30 disabled:cursor-not-allowed text-white text-[13px] font-semibold rounded-md transition"
        >
          Open my dashboard →
        </button>
      )}
    </div>
  );
}

/* ─── Step 6: Done (transitional) ────────────────────────────── */

function Done() {
  return (
    <div className="text-center">
      <div className="size-14 rounded-full bg-go-soft border border-go/30 mx-auto mb-6 flex items-center justify-center text-go">
        <CheckIcon size={22} />
      </div>
      <h1 className="text-3xl font-bold tracking-tight mb-3">You&apos;re set up.</h1>
      <p className="text-text-mid text-[14px] leading-relaxed max-w-md mx-auto">
        Loading your dashboard…
      </p>
    </div>
  );
}

/* ─── Shared bits ────────────────────────────────────────────── */

function BackButton({
  onBack,
  disabled,
}: {
  onBack: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onBack}
      disabled={disabled}
      className="text-[12px] text-text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition mb-4"
    >
      ← Back
    </button>
  );
}

function StepHeader({
  label,
  title,
  desc,
}: {
  label: string;
  title: string;
  desc: string;
}) {
  return (
    <>
      <div className="text-[11px] uppercase tracking-[0.12em] text-accent font-semibold mb-3">
        {label}
      </div>
      <h1 className="text-3xl font-bold tracking-tight mb-3">{title}</h1>
      <p className="text-text-mid text-[13.5px] leading-relaxed mb-7">{desc}</p>
    </>
  );
}

function Inst({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="size-5 rounded-full bg-accent-soft border border-accent-mid text-accent text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
        {n}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[12px] font-semibold text-text">{label}</span>
        {hint && <span className="text-[10.5px] text-text-muted">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
