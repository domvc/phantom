"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  getUserState,
  normalizeDay,
  setUserState,
  type PlannedSession,
  type PlanPhase,
  type UserState,
  type SessionReconciliation,
} from "@/lib/storage";
import { computeNutritionTargets } from "@/lib/nutrition";
import { weekToText, weekToCsv, copyToClipboard, type DayKey } from "@/lib/exports";
import { downloadFile, safeFilename } from "@/lib/pwx";
import { reconciliationForDate } from "@/lib/reconcile";
import WorkoutDetailModal from "@/components/WorkoutDetailModal";
import AmendmentChatModal from "@/components/AmendmentChatModal";
import {
  BikeIcon,
  RunIcon,
  SwimIcon,
  StrengthIcon,
  BrickIcon,
  RestIcon,
} from "@/components/icons";

const DAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const WEEKS_BACK = 2;
const WEEKS_FWD = 3; // shows current + 3 future = 4 ahead, plus 2 back = 6 total
const TOTAL_WEEKS = WEEKS_BACK + 1 + WEEKS_FWD;

export default function CalendarPage() {
  const [user, setUser] = useState<UserState>({});
  const [openSession, setOpenSession] = useState<{
    session: PlannedSession;
    day: string;
    date: string;
    phase: PlanPhase | null;
  } | null>(null);
  const [amendOpen, setAmendOpen] = useState<{
    weekContext: string;
    weekStartDate: string;
  } | null>(null);
  const todayWeekRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUser(getUserState());
    function onChange() {
      setUser(getUserState());
    }
    const events = [
      "phantomcoach:plan-generated",
      "phantomcoach:synced",
      "phantomcoach:reconciliation-changed",
    ];
    events.forEach((e) => window.addEventListener(e, onChange));
    return () => {
      events.forEach((e) => window.removeEventListener(e, onChange));
    };
  }, []);

  const plan = user.plan;
  const today = useMemo(() => new Date(), []);
  const todayMonday = useMemo(() => mondayOf(today), [today]);

  // Auto-scroll today's week into view
  useEffect(() => {
    if (todayWeekRef.current) {
      todayWeekRef.current.scrollIntoView({ behavior: "auto", block: "start" });
    }
  }, [plan]);

  if (!plan) {
    return <NoPlanCallout />;
  }

  // Build the 5-week window
  const weeks: { monday: Date; isCurrent: boolean; phase: PlanPhase | null }[] = [];
  for (let i = -WEEKS_BACK; i <= WEEKS_FWD; i++) {
    const m = new Date(todayMonday);
    m.setDate(todayMonday.getDate() + i * 7);
    weeks.push({
      monday: m,
      isCurrent: i === 0,
      phase: phaseForDate(plan.phases, m),
    });
  }

  return (
    <>
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-8 pt-7 pb-4 flex-shrink-0">
          <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-semibold mb-1">
            Weekly schedule · {WEEKS_BACK} past · current · {WEEKS_FWD} ahead
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
        </div>

        {/* Scroll container with weeks */}
        <div className="flex-1 overflow-y-auto px-8 pb-12">
          <div className="space-y-6 max-w-[1400px]">
            {weeks.map((w, i) => (
              <WeekRow
                key={i}
                ref={w.isCurrent ? todayWeekRef : undefined}
                monday={w.monday}
                isCurrent={w.isCurrent}
                isPast={!w.isCurrent && w.monday < todayMonday}
                phase={w.phase}
                allPhases={plan.phases}
                today={today}
                user={user}
                onClickSession={(session, day, date, phase) =>
                  setOpenSession({ session, day, date, phase })
                }
                onAmend={(weekContext, weekStartDate) =>
                  setAmendOpen({ weekContext, weekStartDate })
                }
              />
            ))}

            {/* Footer: future-week loading note */}
            <div className="mt-8 pt-6 border-t border-border-soft">
              <div className="bg-surface border border-dashed border-border-soft rounded-md p-5 flex items-start gap-4">
                <div className="text-2xl pt-0.5">📅</div>
                <div className="flex-1">
                  <div className="text-[12.5px] font-semibold text-text">
                    Future weeks load as you progress
                  </div>
                  <p className="text-[11.5px] text-text-mid mt-1 leading-relaxed">
                    To stay adaptive, weeks more than a few ahead are generated as you
                    move through the plan — using your actual training data, fatigue
                    signals, and life context at the time. Open a future week and the
                    coach will compose it then. Past weeks remain locked as a record of
                    what was prescribed.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <WorkoutDetailModal
        open={!!openSession}
        onClose={() => setOpenSession(null)}
        session={openSession?.session ?? null}
        day={openSession?.day ?? ""}
        date={openSession?.date ?? ""}
        phase={openSession?.phase ?? null}
        synced={user.synced}
        athleteNotes={user.athleteNotes}
      />

      <AmendmentChatModal
        open={!!amendOpen}
        onClose={() => setAmendOpen(null)}
        weekContext={amendOpen?.weekContext ?? ""}
        weekStartDate={amendOpen?.weekStartDate ?? ""}
        plan={user.plan}
        synced={user.synced}
        raceGoal={user.raceGoal}
        athleteNotes={user.athleteNotes}
      />
    </>
  );
}

function WeekRow({
  monday,
  isCurrent,
  isPast,
  phase,
  allPhases,
  today,
  user,
  onClickSession,
  onAmend,
  ref,
}: {
  monday: Date;
  isCurrent: boolean;
  isPast: boolean;
  phase: PlanPhase | null;
  allPhases: PlanPhase[];
  today: Date;
  user: UserState;
  onClickSession: (
    session: PlannedSession,
    day: string,
    date: string,
    phase: PlanPhase | null
  ) => void;
  onAmend: (weekContext: string, weekStartDate: string) => void;
  ref?: React.Ref<HTMLDivElement>;
}) {
  const phaseWeekNum = phase
    ? Math.floor((monday.getTime() - new Date(phase.start_date).getTime()) / (7 * 86400000)) + 1
    : null;
  const weekStartIso = monday.toISOString().slice(0, 10);
  const weekContext = isCurrent
    ? `This week (${monday.toLocaleDateString("en-GB", { day: "numeric", month: "short" })})`
    : `Week of ${monday.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

  // Build the weekly_template lookup once for export
  const weekTemplate: Record<DayKey, PlannedSession[]> = useMemo(() => {
    const out = {} as Record<DayKey, PlannedSession[]>;
    DAY_KEYS.forEach((key, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      const dayPhase = phaseForDate(allPhases, date) || phase;
      out[key as DayKey] = dayPhase
        ? normalizeDay(
            dayPhase.weekly_template[key as keyof typeof dayPhase.weekly_template]
          )
        : [];
    });
    return out;
  }, [monday, allPhases, phase]);

  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  const dateLabel = monday.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  function handleCopy() {
    const text = weekToText({
      monday,
      weekly_template: weekTemplate,
      phaseName: phase?.name,
      raceName: user.plan?.race?.name,
    });
    copyToClipboard(text).then((ok) => {
      if (ok) {
        setCopyState("copied");
        setTimeout(() => setCopyState("idle"), 1800);
      }
    });
  }

  function handleCsv() {
    const csv = weekToCsv({ monday, weekly_template: weekTemplate });
    const filename = safeFilename(`week-${monday.toISOString().slice(0, 10)}`, "csv");
    downloadFile(filename, csv, "text/csv");
  }

  return (
    <div ref={ref} className="scroll-mt-4">
      {/* Week label strip */}
      <div className="flex items-center justify-between mb-2 gap-3">
        <div className="flex items-baseline gap-3 flex-wrap">
          <div
            className={`text-[11px] uppercase tracking-[0.1em] font-bold ${
              isCurrent ? "text-accent" : isPast ? "text-text-muted" : "text-text-mid"
            }`}
          >
            {isCurrent
              ? "This week"
              : `Week of ${monday.toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                })}`}
          </div>
          {phase && (
            <div
              className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${
                isCurrent
                  ? "bg-accent-soft text-accent border border-accent-mid"
                  : "bg-surface-2 text-text-muted border border-border"
              }`}
            >
              {phase.name}
              {phaseWeekNum && phase.weeks_to_end > phase.weeks_from_start
                ? ` · wk ${phaseWeekNum} of ${phase.weeks_to_end - phase.weeks_from_start + 1}`
                : ""}
            </div>
          )}
        </div>

        {/* Week-level export toolbar */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={handleCopy}
            title={`Copy week of ${dateLabel} as text`}
            className="px-2.5 py-1 text-[11px] font-semibold rounded border border-border-soft hover:border-accent hover:text-accent text-text-muted transition flex items-center gap-1.5"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {copyState === "copied" ? "Copied" : "Copy"}
          </button>
          <button
            onClick={handleCsv}
            title={`Download week of ${dateLabel} as CSV`}
            className="px-2.5 py-1 text-[11px] font-semibold rounded border border-border-soft hover:border-accent hover:text-accent text-text-muted transition flex items-center gap-1.5"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            CSV
          </button>
        </div>
      </div>

      {/* 7 days + summary side-by-side */}
      <div
        className={`grid gap-3 ${isPast ? "opacity-55" : ""}`}
        style={{ gridTemplateColumns: "minmax(0, 1fr) 260px" }}
      >
        {/* 7 day columns */}
        <div className="grid grid-cols-7 gap-2">
          {DAY_KEYS.map((key, i) => {
            const date = new Date(monday);
            date.setDate(monday.getDate() + i);
            const dateIso = date.toISOString().slice(0, 10);
            const isToday = date.toDateString() === today.toDateString();
            const dayPhase = phaseForDate(allPhases, date) || phase;
            const sessions: PlannedSession[] = dayPhase
              ? normalizeDay(
                  dayPhase.weekly_template[key as keyof typeof dayPhase.weekly_template]
                )
              : [
                  {
                    slot: "REST",
                    type: "rest",
                    title: "—",
                    duration: "—",
                    summary: "Outside plan",
                    sport: "rest",
                  },
                ];
            const dayReconciliation = reconciliationForDate(user.reconciliations, dateIso);

            return (
              <div key={key} className="flex flex-col min-w-0">
                <div
                  className={`text-center pb-2 border-b mb-2 ${
                    isToday ? "border-accent" : "border-border-soft"
                  }`}
                >
                  <div
                    className={`text-[9px] font-bold uppercase tracking-[0.1em] ${
                      isToday ? "text-accent" : "text-text-muted"
                    }`}
                  >
                    {DAY_ABBR[i]}
                  </div>
                  <div
                    className={`text-[15px] font-bold mt-0.5 ${
                      isToday
                        ? "text-accent"
                        : date < today
                        ? "text-text-muted"
                        : "text-text-mid"
                    }`}
                  >
                    {date.getDate()}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  {/* If the day has a logged activity, show the actual card on top
                      and shrink the planned card down to a struck-through marker. */}
                  {dayReconciliation && (
                    <ActualSessionCard reconciliation={dayReconciliation} />
                  )}
                  {sessions.map((s, idx) => (
                    <SessionCard
                      key={idx}
                      session={s}
                      muted={Boolean(dayReconciliation)}
                      onClick={() =>
                        s.type !== "rest" &&
                        onClickSession(
                          s,
                          DAY_ABBR[i],
                          date.toISOString().slice(0, 10),
                          dayPhase
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right-side summary panel */}
        <WeekSummary
          user={user}
          monday={monday}
          weekStartIso={weekStartIso}
          phase={phase}
          isPast={isPast}
          isCurrent={isCurrent}
          onAmend={() => onAmend(weekContext, weekStartIso)}
        />
      </div>
    </div>
  );
}

function WeekSummary({
  user,
  monday,
  weekStartIso,
  phase,
  isPast,
  isCurrent,
  onAmend,
}: {
  user: UserState;
  monday: Date;
  weekStartIso: string;
  phase: PlanPhase | null;
  isPast: boolean;
  isCurrent: boolean;
  onAmend: () => void;
}) {
  const [brief, setBrief] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Find day of week 0-6 from monday
  const dailyTemplate = useMemo(() => {
    if (!phase) return null;
    const out: Record<string, PlannedSession[]> = {};
    DAY_KEYS.forEach((key) => {
      out[key] = normalizeDay(
        phase.weekly_template[key as keyof typeof phase.weekly_template]
      );
    });
    return out;
  }, [phase]);

  useEffect(() => {
    if (!phase || !dailyTemplate) {
      setBrief(null);
      return;
    }
    const cache = user.weeklyBriefs ?? {};
    if (cache[weekStartIso]) {
      setBrief(cache[weekStartIso]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetch("/api/plan/week-brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weekKey: weekStartIso,
        weekStartDate: weekStartIso,
        phase,
        dailyTemplate,
        raceGoal: user.raceGoal,
        athleteNotes: user.athleteNotes,
        synced: user.synced,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.ok && data.brief) {
          setBrief(data.brief);
          // Persist to cache
          const newCache = { ...(getUserState().weeklyBriefs ?? {}), [weekStartIso]: data.brief };
          setUserState({ weeklyBriefs: newCache });
        } else {
          setErr(data.error || "Couldn't load summary");
        }
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Network error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStartIso, phase?.name]);

  if (!phase) {
    return (
      <div className="bg-surface border border-dashed border-border-soft rounded-md p-4 text-[12px] text-text-muted self-start">
        Outside plan window
      </div>
    );
  }

  const canAmend = !isPast;
  void monday;

  // Compute weekly nutrition guide from athlete weight + planned sessions
  const weight = user.synced?.athlete?.weight ?? null;
  const nutrition = useMemo(() => {
    if (!dailyTemplate || !weight) return null;
    const days = DAY_KEYS.map((k) =>
      computeNutritionTargets({
        weightKg: weight,
        todaysSessions: dailyTemplate[k] || [],
        athleteNotes: user.athleteNotes,
      })
    ).filter((t): t is NonNullable<typeof t> => t !== null);
    if (days.length === 0) return null;
    const hardKcals = days.filter((d) => d.isHardDay).map((d) => d.kcal);
    const easyKcals = days.filter((d) => !d.isHardDay).map((d) => d.kcal);
    const avg = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((s, n) => s + n, 0) / arr.length) : null;
    return {
      hardDayKcal: avg(hardKcals),
      easyDayKcal: avg(easyKcals),
      hardDays: hardKcals.length,
      proteinG: days[0].proteinG,
      fatG: days[0].fatG,
      goalMode: days[0].goalMode,
    };
  }, [dailyTemplate, weight, user.athleteNotes]);

  return (
    <div
      className={`rounded-md p-4 self-start flex flex-col gap-3 ${
        isCurrent
          ? "bg-accent-soft border border-accent-mid"
          : "bg-surface border border-border-soft"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-text-muted">
          Week summary
        </div>
        {phase.ctl_target_end != null && (
          <div className="text-[10px] text-text-muted">
            Phase CTL → <strong className="text-text">{phase.ctl_target_end}</strong>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-[11.5px] text-text-muted">
          <span className="inline-flex gap-0.5">
            <span className="size-1 rounded-full bg-text-muted animate-pulse" />
            <span className="size-1 rounded-full bg-text-muted animate-pulse [animation-delay:120ms]" />
            <span className="size-1 rounded-full bg-text-muted animate-pulse [animation-delay:240ms]" />
          </span>
          Loading brief…
        </div>
      )}

      {err && <div className="text-[11.5px] text-modify">⚠️ {err}</div>}

      {brief && (
        <p className="text-[12px] text-text-mid leading-relaxed">{brief}</p>
      )}

      {nutrition && (nutrition.hardDayKcal || nutrition.easyDayKcal) && (
        <div className="border-t border-border-soft pt-2.5">
          <div className="text-[9.5px] uppercase tracking-[0.1em] font-bold text-text-muted mb-1.5">
            Fuelling guide · {nutrition.goalMode}
          </div>
          <div className="text-[11px] text-text-mid leading-snug space-y-0.5">
            {nutrition.hardDays > 0 && nutrition.hardDayKcal != null && (
              <div>
                <strong className="text-text font-semibold">Hard days</strong>{" "}
                ~{nutrition.hardDayKcal.toLocaleString()} kcal
              </div>
            )}
            {nutrition.easyDayKcal != null && (
              <div>
                <strong className="text-text font-semibold">Easy/rest</strong>{" "}
                ~{nutrition.easyDayKcal.toLocaleString()} kcal
              </div>
            )}
            <div>
              <strong className="text-text font-semibold">Daily</strong> P{" "}
              {nutrition.proteinG}g · F {nutrition.fatG}g · carbs to fill
            </div>
            <div className="text-[10.5px] text-text-muted leading-snug pt-1">
              {nutrition.hardDays > 0
                ? "Top up carbs the night before hard days. 60-90g/hr on long sessions, refuel within 30min after."
                : "Steady eating — protein at every meal, carbs around movement."}
            </div>
          </div>
        </div>
      )}

      <button
        onClick={onAmend}
        disabled={!canAmend}
        className={`mt-1 px-3 py-2 text-[11.5px] font-semibold rounded-md transition border ${
          canAmend
            ? "bg-bg border-border hover:border-accent hover:text-accent text-text-mid cursor-pointer"
            : "bg-surface border-border-soft text-text-muted cursor-not-allowed"
        }`}
      >
        {canAmend ? "Need to amend?" : "Past week"}
      </button>
    </div>
  );
}

function SessionCard({
  session,
  onClick,
  muted = false,
}: {
  session: PlannedSession;
  onClick: () => void;
  muted?: boolean;
}) {
  const palette = TYPE_STYLES[session.type] || TYPE_STYLES.easy;
  const isClickable = session.type !== "rest";
  return (
    <button
      onClick={onClick}
      disabled={!isClickable}
      className={`text-left rounded-md border px-2.5 py-2 transition ${palette.bg} ${palette.border} ${
        muted ? "opacity-40" : ""
      } ${
        isClickable && !muted
          ? "hover:shadow-sm hover:-translate-y-px hover:border-accent cursor-pointer"
          : "cursor-default"
      }`}
      title={muted ? "Plan was replaced by a logged activity for this day" : undefined}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        {session.slot && session.slot !== "REST" && (
          <span
            className={`text-[8px] font-bold uppercase tracking-wider ${palette.slotColor}`}
          >
            {session.slot}
          </span>
        )}
        <span className={palette.slotColor}>{sportIcon(session.sport)}</span>
      </div>
      <div
        className={`text-[11px] font-bold leading-tight ${palette.titleColor} ${
          muted ? "line-through" : ""
        }`}
      >
        {session.title}
      </div>
      {session.duration && !muted && (
        <div className={`text-[9.5px] mt-0.5 font-medium ${palette.subtleColor}`}>
          {session.duration}
        </div>
      )}
      {session.summary && !muted && (
        <div className={`text-[9.5px] leading-snug mt-0.5 ${palette.subtleColor} line-clamp-2`}>
          {session.summary}
        </div>
      )}
    </button>
  );
}

const ACTUAL_STYLES: Record<
  SessionReconciliation["status"],
  { bg: string; border: string; tagBg: string; tagText: string; label: string }
> = {
  aligned: {
    bg: "bg-go-soft",
    border: "border-go/40",
    tagBg: "bg-go/15",
    tagText: "text-go",
    label: "DID",
  },
  swapped: {
    bg: "bg-modify-soft",
    border: "border-modify/40",
    tagBg: "bg-modify/15",
    tagText: "text-modify",
    label: "SWAP",
  },
  deviation: {
    bg: "bg-accent-soft",
    border: "border-accent-mid",
    tagBg: "bg-accent/15",
    tagText: "text-accent",
    label: "DID",
  },
  extra: {
    bg: "bg-surface",
    border: "border-border",
    tagBg: "bg-text-mid/15",
    tagText: "text-text-mid",
    label: "BONUS",
  },
  missed: {
    bg: "bg-surface",
    border: "border-border",
    tagBg: "bg-text-muted/15",
    tagText: "text-text-muted",
    label: "MISS",
  },
};

function ActualSessionCard({ reconciliation: r }: { reconciliation: SessionReconciliation }) {
  const style = ACTUAL_STYLES[r.status];
  return (
    <div
      className={`rounded-md border px-2.5 py-2 ${style.bg} ${style.border}`}
      title={r.message}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <span
          className={`text-[8px] font-bold uppercase tracking-wider ${style.tagText} ${style.tagBg} px-1 py-px rounded`}
        >
          {style.label}
        </span>
        <span className={style.tagText}>{sportIcon(r.activitySport)}</span>
      </div>
      <div className={`text-[11px] font-bold leading-tight text-text line-clamp-2`}>
        {r.activityName}
      </div>
      <div className="text-[9.5px] mt-0.5 font-medium text-text-mid">
        {r.durationMin ? `${Math.round(r.durationMin)}min` : ""}
        {r.tss ? `${r.durationMin ? " · " : ""}${r.tss} TSS` : ""}
      </div>
    </div>
  );
}

const TYPE_STYLES: Record<
  string,
  {
    bg: string;
    border: string;
    titleColor: string;
    subtleColor: string;
    slotColor: string;
  }
> = {
  rest: {
    bg: "bg-bg",
    border: "border-dashed border-border",
    titleColor: "text-text-muted",
    subtleColor: "text-text-muted",
    slotColor: "text-text-muted",
  },
  easy: {
    bg: "bg-[#F3FAF4]",
    border: "border-[#B5D8B7]",
    titleColor: "text-[#1F6B2A]",
    subtleColor: "text-[#3F7A48]",
    slotColor: "text-[#1F6B2A]",
  },
  hard: {
    bg: "bg-[#FEF8F5]",
    border: "border-accent-mid",
    titleColor: "text-accent",
    subtleColor: "text-[#9B5530]",
    slotColor: "text-accent",
  },
  tempo: {
    bg: "bg-[#FEF8F5]",
    border: "border-accent-mid",
    titleColor: "text-accent",
    subtleColor: "text-[#9B5530]",
    slotColor: "text-accent",
  },
  key: {
    bg: "bg-accent",
    border: "border-accent-h",
    titleColor: "text-white",
    subtleColor: "text-white/70",
    slotColor: "text-white/55",
  },
  long: {
    bg: "bg-[#F0F5FC]",
    border: "border-[#A8C0E0]",
    titleColor: "text-[#2A4A8A]",
    subtleColor: "text-[#4A6AAA]",
    slotColor: "text-[#2A4A8A]",
  },
  strength: {
    bg: "bg-surface-2",
    border: "border-border",
    titleColor: "text-text-mid",
    subtleColor: "text-text-muted",
    slotColor: "text-text-muted",
  },
  swim: {
    bg: "bg-[#EEF7FB]",
    border: "border-[#9DCEE2]",
    titleColor: "text-[#1F5A75]",
    subtleColor: "text-[#3F7A95]",
    slotColor: "text-[#1F5A75]",
  },
  brick: {
    bg: "bg-accent-soft",
    border: "border-accent",
    titleColor: "text-accent",
    subtleColor: "text-[#9B5530]",
    slotColor: "text-accent",
  },
  test: {
    bg: "bg-modify-soft",
    border: "border-[#E8B780]",
    titleColor: "text-modify",
    subtleColor: "text-[#7A4500]",
    slotColor: "text-modify",
  },
};

function sportIcon(sport?: string) {
  switch (sport) {
    case "bike":
      return <BikeIcon size={11} />;
    case "run":
      return <RunIcon size={11} />;
    case "swim":
      return <SwimIcon size={11} />;
    case "strength":
      return <StrengthIcon size={11} />;
    case "brick":
      return <BrickIcon size={11} />;
    case "rest":
      return <RestIcon size={11} />;
    default:
      return null;
  }
}

function mondayOf(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
  return r;
}

function phaseForDate(phases: PlanPhase[] | undefined, d: Date): PlanPhase | null {
  if (!phases) return null;
  for (const p of phases) {
    const start = new Date(p.start_date);
    const end = new Date(p.end_date);
    end.setHours(23, 59, 59, 999);
    if (d >= start && d <= end) return p;
  }
  return null;
}

function NoPlanCallout() {
  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-6xl">
      <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-semibold mb-2">
        Weekly schedule
      </div>
      <h1 className="text-3xl font-bold tracking-tight mb-8">Calendar</h1>
      <div className="bg-accent-soft border border-accent-mid rounded-md p-8 text-center">
        <div className="text-3xl mb-3">📋</div>
        <div className="text-[14px] font-bold text-accent mb-1">
          No plan generated yet
        </div>
        <p className="text-[12.5px] text-text-mid">
          Head back to{" "}
          <a href="/dashboard" className="text-accent font-semibold hover:underline">
            Dashboard
          </a>{" "}
          and click <strong>Generate Plan</strong> to build your weekly schedule.
        </p>
      </div>
    </div>
  );
}
