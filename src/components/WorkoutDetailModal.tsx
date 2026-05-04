"use client";

import { useEffect, useRef, useState } from "react";
import type { PlannedSession, PlanPhase, SyncedData, AthleteNotes } from "@/lib/storage";

type WorkoutDetail = {
  title: string;
  duration: string;
  warmup: string;
  main: string;
  cooldown: string;
  primary: string;
  hr: string;
  rpe: string;
  fueling: string;
  success: string;
  rationale: string;
  garmin: string;
  trainingpeaks: string;
};

const SECTION_ORDER: (keyof WorkoutDetail)[] = [
  "title",
  "duration",
  "warmup",
  "main",
  "cooldown",
  "primary",
  "hr",
  "rpe",
  "fueling",
  "success",
  "rationale",
  "garmin",
  "trainingpeaks",
];

const SECTION_LABELS: Record<string, keyof WorkoutDetail> = {
  TITLE: "title",
  DURATION: "duration",
  WARMUP: "warmup",
  MAIN: "main",
  COOLDOWN: "cooldown",
  PRIMARY: "primary",
  HR: "hr",
  RPE: "rpe",
  FUELING: "fueling",
  SUCCESS: "success",
  RATIONALE: "rationale",
  GARMIN: "garmin",
  TRAININGPEAKS: "trainingpeaks",
};

type Props = {
  open: boolean;
  onClose: () => void;
  session: PlannedSession | null;
  day: string;
  date: string;
  phase: PlanPhase | null;
  synced?: SyncedData;
  athleteNotes?: AthleteNotes;
};

export default function WorkoutDetailModal({
  open,
  onClose,
  session,
  day,
  date,
  phase,
  synced,
  athleteNotes,
}: Props) {
  const [detail, setDetail] = useState<Partial<WorkoutDetail>>({});
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"detail" | "garmin" | "tp">("detail");
  const [copied, setCopied] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open || !session) return;
    // Bump request ID; only the latest one is allowed to write state
    const myId = ++requestIdRef.current;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setDetail({});
    setError(null);
    setTab("detail");
    setStreaming(true);

    (async () => {
      try {
        const res = await fetch("/api/workout/detail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session, day, date, phase, synced, athleteNotes }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          if (myId === requestIdRef.current) {
            setError(`Server returned ${res.status}`);
            setStreaming(false);
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
                if (myId === requestIdRef.current) {
                  setDetail(parseSections(raw));
                }
              } else if (obj.error) {
                if (myId === requestIdRef.current) setError(obj.error);
              }
            } catch {
              /* ignore malformed payload */
            }
          }
        }
        if (myId === requestIdRef.current) setStreaming(false);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        if (myId === requestIdRef.current) {
          setError(e instanceof Error ? e.message : "Network error");
          setStreaming(false);
        }
      }
    })();

    return () => {
      ctrl.abort();
    };
  }, [open, session, day, date, phase, synced, athleteNotes]);

  // Close on Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !session) return null;

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  const titleDisplay = detail.title || session.title;
  const durationDisplay = detail.duration || session.duration || session.summary;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-bg border border-border rounded-lg max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-7 py-5 border-b border-border-soft flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted font-semibold mb-1">
              {day}
              {date ? ` · ${new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
              {session.slot && session.slot !== "REST" ? ` · ${session.slot}` : ""}
              {phase ? ` · ${phase.name}` : ""}
            </div>
            <h2 className="text-xl font-bold tracking-tight">{titleDisplay}</h2>
            <div className="text-[12.5px] text-text-mid mt-1">{durationDisplay}</div>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text text-2xl leading-none flex-shrink-0"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="px-7 border-b border-border-soft flex gap-1">
          {[
            { id: "detail" as const, label: "Detail" },
            { id: "garmin" as const, label: "Copy for Garmin / Wahoo" },
            { id: "tp" as const, label: "Copy for TrainingPeaks" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2.5 text-[12px] font-semibold transition border-b-2 ${
                tab === t.id
                  ? "border-accent text-accent"
                  : "border-transparent text-text-muted hover:text-text"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="p-7 text-[13px] text-modify">⚠️ {error}</div>
          )}

          {tab === "detail" && (
            <div className="p-7 space-y-5">
              <Block label="Warm-up" streaming={streaming && !detail.warmup}>
                {detail.warmup ? (
                  <pre className="whitespace-pre-wrap font-sans text-[13px] text-text leading-relaxed">
                    {detail.warmup}
                  </pre>
                ) : null}
              </Block>
              <Block label="Main set" streaming={streaming && !detail.main}>
                {detail.main ? (
                  <pre className="whitespace-pre-wrap font-sans text-[13px] text-text leading-relaxed">
                    {detail.main}
                  </pre>
                ) : null}
              </Block>
              <Block label="Cool-down" streaming={streaming && !detail.cooldown}>
                {detail.cooldown ? (
                  <pre className="whitespace-pre-wrap font-sans text-[13px] text-text leading-relaxed">
                    {detail.cooldown}
                  </pre>
                ) : null}
              </Block>

              <div className="grid sm:grid-cols-2 gap-3">
                <TargetChip label="Primary target" value={detail.primary} streaming={streaming} />
                <TargetChip label="Heart rate" value={detail.hr} streaming={streaming} />
                <TargetChip label="RPE" value={detail.rpe} streaming={streaming} />
                <TargetChip label="Fueling" value={detail.fueling} streaming={streaming} />
              </div>

              <Block label="What success looks like" streaming={streaming && !detail.success}>
                {detail.success ? (
                  <p className="text-[13px] text-text leading-relaxed">{detail.success}</p>
                ) : null}
              </Block>

              <div className="bg-accent-soft border border-accent-mid rounded-md p-5">
                <div className="text-[10px] uppercase tracking-[0.12em] text-accent font-bold mb-2">
                  Why this session, right now
                </div>
                {detail.rationale ? (
                  <p className="text-[13px] text-text leading-relaxed">{detail.rationale}</p>
                ) : streaming ? (
                  <SkeletonLines lines={3} />
                ) : null}
              </div>
            </div>
          )}

          {tab === "garmin" && (
            <CopyBlock
              text={detail.garmin}
              note="Plain-text format — paste into a Garmin Connect or Wahoo workout note, or anywhere that accepts free text."
              copied={copied === "garmin"}
              streaming={streaming && !detail.garmin}
              onCopy={() => detail.garmin && copy(detail.garmin, "garmin")}
            />
          )}

          {tab === "tp" && (
            <CopyBlock
              text={detail.trainingpeaks}
              note="TrainingPeaks-friendly structured format. Paste into the workout description or use as a structured-builder reference."
              copied={copied === "tp"}
              streaming={streaming && !detail.trainingpeaks}
              onCopy={() => detail.trainingpeaks && copy(detail.trainingpeaks, "tp")}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Parse the raw streamed text into section fields.
 * Format: "---SECTIONNAME---\n<content>\n---NEXT---\n..."
 * A section is "complete" if a later marker has appeared OR ---END--- has been seen.
 */
function parseSections(raw: string): Partial<WorkoutDetail> {
  const out: Partial<WorkoutDetail> = {};
  // Match all marker positions
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
    const fieldKey = SECTION_LABELS[cur.name];
    if (!fieldKey) continue;
    const contentStart = cur.end;
    const contentEnd = next ? next.start : raw.length;
    const content = raw.slice(contentStart, contentEnd).trim();
    // Only consider complete if a NEXT marker exists, otherwise it's still streaming
    if (next || raw.includes("---END---")) {
      out[fieldKey] = content as WorkoutDetail[typeof fieldKey];
    } else {
      // Partial — still emit so the user sees something appear
      if (content) out[fieldKey] = content as WorkoutDetail[typeof fieldKey];
    }
  }
  return out;
  void SECTION_ORDER;
}

function Block({
  label,
  streaming,
  children,
}: {
  label: string;
  streaming?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted font-bold mb-2">
        {label}
      </div>
      {children}
      {streaming && !children && <SkeletonLines lines={2} />}
    </div>
  );
}

function TargetChip({
  label,
  value,
  streaming,
}: {
  label: string;
  value?: string;
  streaming?: boolean;
}) {
  return (
    <div className="bg-surface border border-border-soft rounded-md p-3">
      <div className="text-[9.5px] uppercase tracking-[0.08em] text-text-muted font-bold">
        {label}
      </div>
      {value ? (
        <div className="text-[13px] font-semibold text-text mt-1">{value}</div>
      ) : streaming ? (
        <div className="mt-1">
          <SkeletonLines lines={1} />
        </div>
      ) : null}
    </div>
  );
}

function SkeletonLines({ lines = 2 }: { lines?: number }) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-2 bg-surface-2 rounded-full animate-pulse"
          style={{ width: `${85 - i * 12}%`, animationDelay: `${i * 100}ms` }}
        />
      ))}
    </div>
  );
}

function CopyBlock({
  text,
  note,
  copied,
  streaming,
  onCopy,
}: {
  text?: string;
  note: string;
  copied: boolean;
  streaming?: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="p-7 space-y-3">
      <p className="text-[12px] text-text-muted">{note}</p>
      <div className="bg-surface border border-border-soft rounded-md p-4 max-h-[40vh] overflow-y-auto min-h-[120px]">
        {text ? (
          <pre className="whitespace-pre-wrap font-mono text-[12px] text-text leading-relaxed">
            {text}
          </pre>
        ) : streaming ? (
          <SkeletonLines lines={6} />
        ) : (
          <div className="text-[12px] text-text-muted">No content yet.</div>
        )}
      </div>
      <button
        onClick={onCopy}
        disabled={!text}
        className="px-4 py-2 bg-accent hover:bg-accent-h disabled:opacity-30 disabled:cursor-not-allowed text-white text-[12px] font-semibold rounded-md transition"
      >
        {copied ? "✓ Copied to clipboard" : "Copy to clipboard"}
      </button>
    </div>
  );
}
