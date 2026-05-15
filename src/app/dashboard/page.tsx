"use client";

import { useEffect, useMemo, useState } from "react";
import {
  effectiveWeight,
  effectiveWkg,
  getUserState,
  setUserState,
  type UserState,
  type SyncedData,
  type RecentActivity,
  type PlanPhase,
  type PlannedSession,
  type DailyRow,
  type SessionReconciliation,
} from "@/lib/storage";
import { reconciliationsForDate } from "@/lib/reconcile";
import { generatePlanFromState } from "@/lib/planGen";
import PerfChart from "@/components/PerfChart";
import CoachChat from "@/components/CoachChat";
import MetricChip from "@/components/MetricChip";
import SessionFeedbackModal from "@/components/SessionFeedbackModal";
import NutritionCard from "@/components/NutritionCard";
import SessionReconcileBanner from "@/components/SessionReconcileBanner";
import TrainingVolumeCard from "@/components/TrainingVolumeCard";

const METRIC_DEFINITIONS = {
  ctl: "Chronic Training Load — your fitness, calculated as a 42-day exponentially-weighted average of training stress (TSS). Higher = fitter. Most endurance athletes target a CTL that scales with their goal.",
  atl: "Acute Training Load — your fatigue, calculated as a 7-day exponentially-weighted average of TSS. Rises fast under hard blocks; should drop during tapers.",
  tsb: "Training Stress Balance (CTL − ATL) — your form. Positive = fresh, ready to go hard. Below −20 = significant fatigue accumulating.",
  acwr: "Acute:Chronic Workload Ratio (ATL ÷ CTL). 0.8–1.3 = optimal load. Below 0.8 = undertraining. Above 1.5 = injury risk territory.",
  ftp: "Functional Threshold Power — the highest steady-state cycling power you can sustain for ~1 hour. Drives all your bike training zones.",
  wkg: "Watts per kilogram — FTP divided by weight. The single best predictor of climbing performance and endurance race capability.",
  weight: "Body weight, latest measurement from your synced data. Tracked alongside FTP to derive W/kg.",
};

export default function DashboardHome() {
  const [user, setUser] = useState<UserState>({});
  const [planState, setPlanState] = useState<"idle" | "generating" | "error">("idle");
  const [planError, setPlanError] = useState<string | null>(null);
  const [planSuccessFlash, setPlanSuccessFlash] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState<{
    activity: RecentActivity;
    plannedSession: PlannedSession | null;
    phase: PlanPhase | null;
  } | null>(null);

  useEffect(() => {
    setUser(getUserState());
    function onChange() {
      setUser(getUserState());
    }
    const events = [
      "phantomcoach:synced",
      "phantomcoach:notes-updated",
      "phantomcoach:plan-generated",
      "phantomcoach:feedback-saved",
      "phantomcoach:nutrition-logged",
      "phantomcoach:body-logged",
      "phantomcoach:reconciliation-changed",
    ];
    events.forEach((e) => window.addEventListener(e, onChange));
    return () => events.forEach((e) => window.removeEventListener(e, onChange));
  }, []);

  async function generatePlan() {
    setPlanState("generating");
    setPlanError(null);
    const result = await generatePlanFromState();
    if (!result.ok) {
      setPlanError(result.error);
      setPlanState("error");
      return;
    }
    setUserState({ plan: result.plan, weeklyBriefs: {} });
    setUser(getUserState());
    window.dispatchEvent(new Event("phantomcoach:plan-generated"));
    setPlanState("idle");
    setPlanSuccessFlash(true);
    setTimeout(() => setPlanSuccessFlash(false), 4000);
  }

  const synced = user.synced;
  const race = user.raceGoal;
  const name = user.intervals?.athleteName?.split(" ")[0] || "athlete";
  const daysToRace = race?.date
    ? Math.max(0, Math.ceil((+new Date(race.date) - +new Date()) / 86400000))
    : null;

  // Last session = most recent activity from synced data
  const lastActivity = synced?.recent_activities?.[0] ?? null;
  const lastActivityPhase = useMemo(() => {
    if (!user.plan?.phases || !lastActivity?.date) return null;
    return (
      user.plan.phases.find(
        (p) => p.start_date <= lastActivity.date && lastActivity.date <= p.end_date
      ) ?? null
    );
  }, [user.plan, lastActivity]);
  const lastActivityPlannedSession = useMemo(() => {
    if (!lastActivityPhase || !lastActivity?.date) return null;
    const dayKey = new Date(lastActivity.date)
      .toLocaleDateString("en-US", { weekday: "long" })
      .toLowerCase() as keyof PlanPhase["weekly_template"];
    const dayArr = lastActivityPhase.weekly_template?.[dayKey];
    if (!Array.isArray(dayArr)) return null;
    return dayArr.find((s) => s.type !== "rest") ?? dayArr[0] ?? null;
  }, [lastActivityPhase, lastActivity]);

  return (
    <>
      <ContextBar daysToRace={daysToRace} race={race} synced={synced} />
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 sm:p-7 max-w-6xl">
          <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-semibold mb-2">
            Today ·{" "}
            {new Date().toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2 text-balance">
            {name}. Here&apos;s today.
          </h1>
          <p className="text-text-mid text-[13px] sm:text-[14px] mb-5 sm:mb-7">
            {synced
              ? `Data read ${new Date(synced.synced_at).toLocaleString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  day: "numeric",
                  month: "short",
                })}. Decisions follow below.`
              : "Tap Sync (top-right) when you're ready. The coach reads your data before deciding anything."}
          </p>

          {/* Session reconciliation banner — what you actually did vs the plan */}
          {user.reconciliations && user.reconciliations.length > 0 && (
            <SessionReconcileBanner
              reconciliations={user.reconciliations}
              plan={user.plan}
            />
          )}

          {/* 4-up hero: Readiness · Today's Session · Last Session · Nutrition */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-5">
            <ReadinessCard synced={synced} />
            <TodaysSessionCard synced={synced} user={user} />
            <LastSessionCard
              activity={lastActivity}
              onClick={() =>
                lastActivity &&
                setFeedbackOpen({
                  activity: lastActivity,
                  plannedSession: lastActivityPlannedSession,
                  phase: lastActivityPhase,
                })
              }
              feedbacks={user.sessionFeedbacks}
            />
            <NutritionCard user={user} />
          </div>

          {/* Metric strip with hover popovers */}
          {synced && <MetricStrip synced={synced} user={user} />}

          {/* Training volume — Strava-style with sport + range filters */}
          <TrainingVolumeCard
            activities={synced?.recent_activities}
            syncedAt={synced?.synced_at}
          />

          {/* Plan banner */}
          <PlanBanner
            user={user}
            state={planState}
            error={planError}
            onGenerate={generatePlan}
          />

          {/* Coach chat — lifted higher */}
          <div className="mb-6">
            <CoachChat
              synced={synced}
              raceGoal={race}
              athleteNotes={user.athleteNotes}
              plan={user.plan}
              bodyMeasurements={user.bodyMeasurements}
              effectiveWeightKg={effectiveWeight(user)}
            />
          </div>

          {/* Chart + Recent Sessions */}
          <div className="grid lg:grid-cols-3 gap-4 sm:gap-5 mb-10">
            <div className="lg:col-span-2 bg-surface border border-border-soft rounded-md p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted font-semibold">
                  Performance Trend
                  {user.plan && (
                    <span className="text-text-muted/70 normal-case tracking-normal font-normal">
                      {" "}· past 90d → race day
                    </span>
                  )}
                  {!user.plan && (
                    <span className="text-text-muted/70 normal-case tracking-normal font-normal">
                      {" "}· last 90 days
                    </span>
                  )}
                </div>
                <div className="flex gap-3 text-[10.5px] text-text-muted font-medium flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-[#1F6B2A]" />CTL
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-[#C0884A]" />ATL
                  </span>
                  {user.plan && (
                    <span
                      className="flex items-center gap-1.5"
                      title="Projection assumes you complete the planned sessions at 100% — Bannister EWMA forward from today's CTL/ATL."
                    >
                      <span
                        className="w-3 h-0.5 opacity-55"
                        style={{
                          background:
                            "linear-gradient(90deg, #1F6B2A 0 4px, transparent 4px 7px, #1F6B2A 7px 11px, transparent 11px 14px)",
                        }}
                      />
                      Plan projection
                    </span>
                  )}
                </div>
              </div>
              <div className="h-52">
                {synced ? (
                  <PerfChart
                    daily={synced.daily_90d}
                    raceDate={race?.date}
                    plan={user.plan}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-text-muted text-[12px]">
                    Sync data to see your trend
                  </div>
                )}
              </div>
            </div>

            <RecentSessions
              synced={synced}
              onClickActivity={(a) =>
                setFeedbackOpen({
                  activity: a,
                  plannedSession: lastActivityPlannedSession,
                  phase: lastActivityPhase,
                })
              }
            />
          </div>
        </div>
      </div>

      <SessionFeedbackModal
        open={!!feedbackOpen}
        onClose={() => setFeedbackOpen(null)}
        activity={feedbackOpen?.activity ?? null}
        plannedSession={feedbackOpen?.plannedSession ?? null}
        phase={feedbackOpen?.phase ?? null}
        synced={synced}
        athleteNotes={user.athleteNotes}
        raceGoal={race}
      />

      {/* Plan-regenerated toast — slides up from the bottom-right, auto-dismisses */}
      {planSuccessFlash && (
        <div className="fixed bottom-6 right-6 z-50 bg-text text-bg rounded-md shadow-2xl px-4 py-3 flex items-center gap-3 animate-toast-in">
          <span className="size-6 rounded-full bg-go flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-bg" aria-hidden>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <div>
            <div className="text-[13px] font-bold tracking-tight">Plan regenerated successfully</div>
            <div className="text-[11px] opacity-70">Your training plan is up to date.</div>
          </div>
          <button
            onClick={() => setPlanSuccessFlash(false)}
            className="ml-2 text-bg/50 hover:text-bg text-lg leading-none"
            aria-label="Dismiss"
          >
            ×
          </button>
          <style>{`
            @keyframes toast-in-keys {
              from { opacity: 0; transform: translateY(20px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .animate-toast-in {
              animation: toast-in-keys 220ms ease-out;
            }
          `}</style>
        </div>
      )}
    </>
  );
}

function ContextBar({
  daysToRace,
  race,
  synced,
}: {
  daysToRace: number | null;
  race?: UserState["raceGoal"];
  synced?: SyncedData;
}) {
  return (
    <div className="border-b border-border-soft px-4 sm:px-7 py-2 sm:py-2.5 bg-bg flex-shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-3">
      <div className="text-[11.5px] sm:text-[12px] text-text-muted">
        <strong className="text-text-mid font-semibold">Demo workspace</strong> ·{" "}
        {synced ? (
          <span className="text-go font-semibold">● Synced</span>
        ) : (
          <span>Not yet synced</span>
        )}
      </div>
      <div className="flex gap-1.5 sm:gap-2 -mx-1 px-1 overflow-x-auto sm:overflow-visible no-scrollbar">
        {synced?.derived?.phase && (
          <span className="px-2.5 py-1 rounded-full bg-accent-soft border border-accent-mid text-accent text-[10.5px] font-semibold uppercase tracking-wide whitespace-nowrap flex-shrink-0">
            {synced.derived.phase}
          </span>
        )}
        {race && (
          <span className="px-2.5 py-1 rounded-full bg-surface-2 border border-border text-text-muted text-[10.5px] font-semibold uppercase tracking-wide whitespace-nowrap flex-shrink-0">
            {race.type}
          </span>
        )}
        {daysToRace !== null && (
          <span className="px-2.5 py-1 rounded-full bg-surface-2 border border-border text-text-muted text-[10.5px] font-semibold uppercase tracking-wide whitespace-nowrap flex-shrink-0">
            {daysToRace}d to race
          </span>
        )}
      </div>
    </div>
  );
}

function ReadinessCard({ synced }: { synced?: SyncedData }) {
  const [explainerOpen, setExplainerOpen] = useState(false);

  if (!synced) {
    return (
      <div className="bg-surface border border-dashed border-border rounded-md p-6 flex items-center justify-center text-[12.5px] text-text-muted">
        Sync to see readiness
      </div>
    );
  }
  const rec = synced.readiness.recommendation || "go";
  const colour = rec === "go" ? "text-go" : rec === "modify" ? "text-modify" : "text-rest";

  // Insight: count consecutive days at this readiness from daily TSB trend
  const tsb = synced.fitness?.tsb ?? 0;
  const ctl = synced.fitness?.ctl ?? 0;
  const acwr = synced.derived?.acwr ?? null;
  let insight = "";
  if (rec === "go" && tsb > 5 && ctl < 30) {
    insight = "Fresh and undertrained — load is your friend this week.";
  } else if (rec === "go" && tsb > 5) {
    insight = "Form positive. A clean window to push quality work.";
  } else if (rec === "modify" && tsb < -25) {
    insight = "Significant fatigue debt — protect tomorrow's quality session.";
  } else if (rec === "modify") {
    insight = "Signals are mixed — adjust intensity, keep movement.";
  } else {
    insight = "Recovery is the prescription. Sleep is your training today.";
  }

  return (
    <>
      <div className="bg-surface border border-border-soft rounded-md p-6 relative">
        {/* Info / explainer trigger — small, top-right, always visible */}
        <button
          type="button"
          onClick={() => setExplainerOpen(true)}
          aria-label="What does Readiness mean?"
          className="absolute top-3 right-3 size-7 rounded-full text-text-muted hover:text-accent hover:bg-accent-soft transition flex items-center justify-center"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9 A2.5 2.5 0 1 1 12 11.5 V13" />
            <line x1="12" y1="16.5" x2="12" y2="16.6" />
          </svg>
        </button>
        <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted font-semibold mb-3">
          Readiness
        </div>
        <div className={`text-5xl font-bold tracking-tight leading-none ${colour}`}>
          {rec.toUpperCase()}
        </div>
        <div className="text-[10.5px] uppercase tracking-[0.1em] text-text-muted font-semibold mt-2 mb-4">
          — {rec === "go" ? "Clear to train" : rec === "modify" ? "Adjust today" : "Rest today"}
        </div>
        <p className="text-[12.5px] text-text-mid leading-relaxed mb-3">
          {synced.readiness.reason}
        </p>
        <div className="pt-3 border-t border-border-soft">
          <div className="text-[9.5px] uppercase tracking-wider text-accent font-bold mb-1">
            Insight
          </div>
          <p className="text-[11.5px] text-text-mid leading-relaxed">{insight}</p>
        </div>
      </div>
      <ReadinessExplainerModal
        open={explainerOpen}
        onClose={() => setExplainerOpen(false)}
        verdict={rec}
        tsb={tsb}
        ctl={ctl}
        acwr={acwr}
      />
    </>
  );
}

function ReadinessExplainerModal({
  open,
  onClose,
  verdict,
  tsb,
  ctl,
  acwr,
}: {
  open: boolean;
  onClose: () => void;
  verdict: string;
  tsb: number;
  ctl: number;
  acwr: number | null;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-bg border border-border rounded-t-2xl sm:rounded-lg max-w-lg w-full max-h-[92vh] sm:max-h-[85vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-7 py-4 sm:py-5 border-b border-border-soft flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.12em] text-accent font-bold mb-1">
              How readiness is calculated
            </div>
            <h2 className="text-lg font-bold tracking-tight">
              Your verdict: <span className={
                verdict === "go" ? "text-go" :
                verdict === "modify" ? "text-modify" : "text-rest"
              }>{verdict.toUpperCase()}</span>
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text text-2xl leading-none flex-shrink-0"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-7 space-y-5">
          <section>
            <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted font-bold mb-2">
              What it is
            </div>
            <p className="text-[13px] text-text-mid leading-relaxed">
              Readiness is the system&apos;s one-word call on whether to train hard,
              dial it back, or rest today. It blends two signals from your
              training data: <strong className="text-text">TSB</strong> (form ─
              how fresh you are) and <strong className="text-text">ACWR</strong>{" "}
              (the ratio of recent load to chronic load ─ how fast you&apos;re
              ramping).
            </p>
          </section>

          <section>
            <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted font-bold mb-2">
              Today&apos;s inputs
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="TSB" value={tsb.toFixed(0)} hint={
                tsb < -25 ? "Heavy fatigue"
                : tsb > 10 ? "Very fresh"
                : tsb >= 0 ? "Positive form"
                : "Mild fatigue"
              } />
              <Metric label="ACWR" value={acwr != null ? acwr.toFixed(2) : "—"} hint={
                acwr == null ? "n/a"
                : acwr < 0.8 ? "Undertrained"
                : acwr > 1.5 ? "Spike risk"
                : acwr > 1.3 ? "Ramping fast"
                : "Sustainable"
              } />
              <Metric label="CTL" value={ctl.toFixed(0)} hint={
                ctl >= 60 ? "Well-trained"
                : ctl >= 40 ? "Solid base"
                : ctl >= 20 ? "Building"
                : "Early base"
              } />
            </div>
          </section>

          <section>
            <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted font-bold mb-2">
              The verdicts
            </div>
            <div className="space-y-2">
              <Verdict
                level="GO"
                active={verdict === "go"}
                color="text-go"
                rule="TSB ≥ −20 and ACWR between 0.5–1.5"
                meaning="Clear to execute the planned session as written."
              />
              <Verdict
                level="MODIFY"
                active={verdict === "modify"}
                color="text-modify"
                rule="TSB < −25, OR ACWR > 1.5"
                meaning="Keep movement, drop intensity. Swap quality work for Z2."
              />
              <Verdict
                level="REST"
                active={verdict === "rest"}
                color="text-rest"
                rule="Severe fatigue debt or scheduled recovery day"
                meaning="Don&apos;t train. Sleep and food are the prescription today."
              />
            </div>
          </section>

          <section className="bg-accent-soft border border-accent-mid rounded-md p-4">
            <div className="text-[10px] uppercase tracking-[0.12em] text-accent font-bold mb-1">
              Why it&apos;s not the whole story
            </div>
            <p className="text-[12.5px] text-text-mid leading-relaxed">
              Readiness is a model, not your nervous system. If you slept badly,
              feel sick, or life is dialled up to 11, trust that ─ skip or modify
              regardless. The plan adapts; missing one quality session won&apos;t
              derail anything.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="bg-surface border border-border-soft rounded-md p-3 text-center">
      <div className="text-[9px] uppercase tracking-[0.1em] text-text-muted font-bold">
        {label}
      </div>
      <div className="text-xl font-bold tracking-tight mt-1">{value}</div>
      <div className="text-[10px] text-text-muted mt-0.5">{hint}</div>
    </div>
  );
}

function Verdict({
  level,
  active,
  color,
  rule,
  meaning,
}: {
  level: string;
  active: boolean;
  color: string;
  rule: string;
  meaning: string;
}) {
  return (
    <div
      className={`rounded-md border p-3 ${
        active ? "border-accent bg-accent-soft" : "border-border-soft bg-surface"
      }`}
    >
      <div className="flex items-baseline gap-2 mb-1">
        <span className={`text-[12px] font-bold ${color}`}>{level}</span>
        {active && (
          <span className="text-[9px] uppercase tracking-wider font-bold text-accent">
            ← Today
          </span>
        )}
      </div>
      <div className="text-[11px] text-text-muted mb-1">{rule}</div>
      <div className="text-[12px] text-text-mid">{meaning}</div>
    </div>
  );
}

function TodaysSessionCard({ synced, user }: { synced?: SyncedData; user: UserState }) {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const phase = user.plan?.phases?.find(
    (p) => p.start_date <= todayIso && todayIso <= p.end_date
  );
  const dayKey = today
    .toLocaleDateString("en-US", { weekday: "long" })
    .toLowerCase() as keyof PlanPhase["weekly_template"];
  const todaysSessions = phase?.weekly_template?.[dayKey];
  const primarySession = Array.isArray(todaysSessions)
    ? todaysSessions.find((s) => s.type !== "rest") ?? todaysSessions[0]
    : null;

  // Did the athlete already complete one or more sessions today? If so, swap
  // the card to show what they actually did. For multi-session days we lead
  // with the most recent and indicate the rest below — the calendar shows
  // every logged activity in its day cell.
  const todayReconciliations = reconciliationsForDate(user.reconciliations, todayIso);
  const todayReconciliation = todayReconciliations[0] ?? null;
  const extraLogged = Math.max(0, todayReconciliations.length - 1);

  const insight =
    !primarySession || primarySession.type === "rest"
      ? "Rest is training. Sleep 8h+ and prep tomorrow's quality."
      : primarySession.type === "key" || primarySession.type === "hard"
      ? "This is the volume/quality anchor of your week. Show up rested."
      : primarySession.type === "long"
      ? "Pace by HR ceiling, not feel. The last 30% should still be conversational."
      : "Easy means easy. If HR creeps, slow down — discipline is the win.";

  if (!primarySession && !todayReconciliation) {
    return (
      <div className="bg-surface border border-dashed border-border rounded-md p-6 flex items-center justify-center text-[12.5px] text-text-muted">
        Generate your plan to see today&apos;s session
      </div>
    );
  }

  void synced;

  // If we have a completed session for today, render the "what you did" card
  if (todayReconciliation) {
    const r = todayReconciliation;
    return (
      <div className="bg-surface border border-border-soft rounded-md p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted font-semibold">
            Today · what you did
          </div>
          <span className="text-[9.5px] uppercase tracking-wider font-bold text-go bg-go-soft border border-go/30 px-2 py-0.5 rounded">
            Logged
          </span>
        </div>
        <div className="text-2xl font-bold tracking-tight mb-1">{r.activityName}</div>
        <div className="text-[12px] text-text-muted mb-3">
          {r.durationMin ? `${Math.round(r.durationMin)}min` : ""}
          {r.distanceKm ? `${r.durationMin ? " · " : ""}${r.distanceKm.toFixed(1)}km` : ""}
          {r.tss ? ` · ${r.tss} TSS` : ""}
        </div>
        <p className="text-[12.5px] text-text-mid leading-relaxed mb-3">{r.message}</p>
        {r.plannedTitle && (
          <div className="text-[11px] text-text-muted mb-3">
            Plan said: <span className="line-through">{r.plannedTitle}</span>
          </div>
        )}
        {extraLogged > 0 && (
          <div className="text-[11px] text-go font-semibold mb-3">
            + {extraLogged} more session{extraLogged > 1 ? "s" : ""} logged today
          </div>
        )}
        {Array.isArray(todaysSessions) && todaysSessions.length > 1 && extraLogged === 0 && (
          <div className="text-[11px] text-text-muted mb-3">
            {todaysSessions.length - 1} more session{todaysSessions.length > 2 ? "s" : ""} still scheduled today
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border-soft rounded-md p-6">
      <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted font-semibold mb-3">
        Today&apos;s session{primarySession?.slot && primarySession.slot !== "REST" ? ` · ${primarySession.slot}` : ""}
      </div>
      <div className="text-2xl font-bold tracking-tight mb-1">{primarySession?.title}</div>
      {primarySession?.duration && (
        <div className="text-[12px] text-text-muted mb-3">{primarySession.duration}</div>
      )}
      <p className="text-[12.5px] text-text-mid leading-relaxed mb-3">
        {primarySession?.summary}
      </p>
      {Array.isArray(todaysSessions) && todaysSessions.length > 1 && (
        <div className="text-[11px] text-text-muted mb-3">
          + {todaysSessions.length - 1} more session{todaysSessions.length > 2 ? "s" : ""} today
        </div>
      )}
      <div className="pt-3 border-t border-border-soft">
        <div className="text-[9.5px] uppercase tracking-wider text-accent font-bold mb-1">
          Insight
        </div>
        <p className="text-[11.5px] text-text-mid leading-relaxed">{insight}</p>
      </div>
    </div>
  );
}

function LastSessionCard({
  activity,
  onClick,
  feedbacks,
}: {
  activity: RecentActivity | null;
  onClick: () => void;
  feedbacks?: UserState["sessionFeedbacks"];
}) {
  if (!activity) {
    return (
      <div className="bg-surface border border-dashed border-border rounded-md p-6 flex items-center justify-center text-[12.5px] text-text-muted">
        No recent session yet
      </div>
    );
  }
  const hasFeedback = feedbacks?.some((f) => f.activityId === activity.id);
  return (
    <button
      onClick={onClick}
      className="bg-surface border border-border-soft hover:border-accent rounded-md p-6 text-left transition group"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted font-semibold">
          Last session
        </div>
        {hasFeedback && (
          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-go-soft text-go font-bold">
            Logged
          </span>
        )}
      </div>
      <div className="text-[10.5px] text-text-muted mb-1">
        {new Date(activity.date).toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "short",
        })}
      </div>
      <div className="text-[18px] font-bold tracking-tight leading-tight mb-3 line-clamp-2">
        {activity.name}
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {activity.distance_km != null && (
          <Stat label="Distance" value={`${activity.distance_km}km`} />
        )}
        {activity.duration_min != null && (
          <Stat label="Duration" value={`${activity.duration_min}m`} />
        )}
        {activity.tss != null && <Stat label="TSS" value={String(activity.tss)} accent />}
      </div>
      <div className="pt-3 border-t border-border-soft flex items-center justify-between">
        <div className="text-[11.5px] text-accent font-semibold group-hover:underline">
          {hasFeedback ? "Open analysis →" : "Open analysis & feedback →"}
        </div>
      </div>
    </button>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-text-muted font-bold">
        {label}
      </div>
      <div className={`text-[14px] font-bold ${accent ? "text-accent" : "text-text"}`}>
        {value}
      </div>
    </div>
  );
}

function MetricStrip({ synced, user }: { synced: SyncedData; user: UserState }) {
  const f = synced.fitness;
  const d = synced.derived;
  const a = synced.athlete;
  const daily: DailyRow[] = synced.daily_90d ?? [];
  // Prefer the most recent locally-logged weight over the Intervals-sync value
  // so the metric strip updates the moment the user logs a new measurement.
  const effWeight = effectiveWeight(user);
  const effWkg = effectiveWkg(user);
  // True when the displayed weight differs from the synced source (i.e. it
  // came from a fresh local log) — drives a small "logged" hint in the popover.
  const weightFromLog = effWeight != null && effWeight !== (a.weight ?? null);

  // Derive 21-day series for each metric
  const last21 = daily.slice(-21);
  const ctlSeries = last21.map((r) => ({ date: r.date, v: r.ctl }));
  const atlSeries = last21.map((r) => ({ date: r.date, v: r.atl }));
  const tsbSeries = last21.map((r) => ({ date: r.date, v: r.tsb }));
  const acwrSeries = last21.map((r) => {
    if (r.ctl == null || r.atl == null || r.ctl === 0) return { date: r.date, v: null };
    return { date: r.date, v: Number((r.atl / r.ctl).toFixed(2)) };
  });

  return (
    <div className="bg-surface border border-border-soft rounded-md mb-5 flex overflow-x-auto md:overflow-visible no-scrollbar">
      <MetricChip
        label="CTL"
        value={f?.ctl?.toFixed(0) ?? "—"}
        tone={!f ? "muted" : f.ctl >= 40 ? "ok" : f.ctl >= 20 ? "default" : "warn"}
        definition={METRIC_DEFINITIONS.ctl}
        series={ctlSeries}
        formatDelta={(d) => `${d > 0 ? "+" : ""}${d.toFixed(1)} CTL`}
      />
      <MetricChip
        label="ATL"
        value={f?.atl?.toFixed(0) ?? "—"}
        definition={METRIC_DEFINITIONS.atl}
        series={atlSeries}
        formatDelta={(d) => `${d > 0 ? "+" : ""}${d.toFixed(1)} ATL`}
      />
      <MetricChip
        label="TSB"
        value={f ? (f.tsb >= 0 ? "+" : "") + f.tsb.toFixed(0) : "—"}
        tone={!f ? "muted" : f.tsb < -25 ? "warn" : f.tsb >= 0 ? "ok" : "default"}
        definition={METRIC_DEFINITIONS.tsb}
        series={tsbSeries}
        formatDelta={(d) => `${d > 0 ? "+" : ""}${d.toFixed(1)} TSB`}
      />
      <MetricChip
        label="ACWR"
        value={d.acwr?.toFixed(2) ?? "—"}
        tone={d.acwr == null ? "muted" : d.acwr > 1.3 || d.acwr < 0.8 ? "warn" : "ok"}
        definition={METRIC_DEFINITIONS.acwr}
        series={acwrSeries}
        formatDelta={(d) => `${d > 0 ? "+" : ""}${d.toFixed(2)}`}
      />
      <MetricChip
        label="FTP"
        value={a.ftp != null ? `${a.ftp}W` : "—"}
        definition={METRIC_DEFINITIONS.ftp}
      />
      <MetricChip
        label="W/kg"
        value={effWkg != null ? effWkg.toFixed(2) : "—"}
        tone={effWkg == null ? "muted" : effWkg >= 3.5 ? "ok" : effWkg >= 2.8 ? "default" : "warn"}
        definition={METRIC_DEFINITIONS.wkg}
      />
      <MetricChip
        label="Weight"
        value={effWeight != null ? `${effWeight}kg` : "—"}
        definition={
          weightFromLog
            ? `${METRIC_DEFINITIONS.weight} You've logged a more recent reading locally, which is what's shown here.`
            : METRIC_DEFINITIONS.weight
        }
      />
    </div>
  );
}

function RecentSessions({
  synced,
  onClickActivity,
}: {
  synced?: SyncedData;
  onClickActivity: (a: RecentActivity) => void;
}) {
  return (
    <div className="bg-surface border border-border-soft rounded-md p-5">
      <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted font-semibold mb-3">
        Recent sessions
      </div>
      {synced?.recent_activities?.length ? (
        <div className="space-y-2.5">
          {synced.recent_activities.slice(0, 6).map((a) => (
            <button
              key={a.id}
              onClick={() => onClickActivity(a)}
              className="w-full flex items-center justify-between gap-2 pb-2.5 border-b border-border-soft last:border-0 last:pb-0 text-left hover:opacity-80 transition"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-semibold text-text truncate">
                  {a.name}
                </div>
                <div className="text-[10.5px] text-text-muted">
                  {new Date(a.date).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}{" "}
                  · {a.type}
                  {a.distance_km != null ? ` · ${a.distance_km}km` : ""}
                </div>
              </div>
              {a.tss != null && (
                <div className="text-right">
                  <div className="text-[12px] font-bold text-accent">{a.tss}</div>
                  <div className="text-[9px] uppercase tracking-wide text-text-muted">
                    TSS
                  </div>
                </div>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="text-[12px] text-text-muted py-2">
          {synced ? "No activities in last 30 days" : "Sync to load"}
        </div>
      )}
    </div>
  );
}

function PlanBanner({
  user,
  state,
  error,
  onGenerate,
}: {
  user: UserState;
  state: "idle" | "generating" | "error";
  error: string | null;
  onGenerate: () => void;
}) {
  const plan = user.plan;
  const totalWeeks = plan?.total_weeks;
  const phasesCount = plan?.phases?.length ?? 0;
  const milestonesCount = plan?.milestones?.length ?? 0;
  const generated = plan?.generated_at
    ? new Date(plan.generated_at).toLocaleString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        day: "numeric",
        month: "short",
      })
    : null;

  if (!plan) {
    return (
      <div className="bg-accent-soft border border-accent-mid rounded-md p-4 sm:p-5 mb-5 flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
        <div className="size-9 rounded-md bg-bg border border-accent-mid flex items-center justify-center flex-shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="text-accent" aria-hidden>
            <path d="M9 11 H15 M9 15 H13 M9 7 H15" />
            <rect x="5" y="3" width="14" height="18" rx="2" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[14px] text-accent">
            Generate your training plan
          </div>
          <div className="text-[12.5px] text-text-mid mt-1">
            Builds a phased plan from today to race day, respecting your athlete notes.
          </div>
          {error && <div className="text-[12px] text-modify mt-2 font-medium">{error}</div>}
        </div>
        <button
          onClick={onGenerate}
          disabled={state === "generating" || !user.raceGoal}
          className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-accent hover:bg-accent-h disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] sm:text-[12px] font-semibold rounded-md transition whitespace-nowrap sm:self-center"
        >
          {state === "generating" ? "Generating…" : "Generate Plan"}
        </button>
      </div>
    );
  }

  // Detect plan staleness: if the current race goal's weeks-to-race differs
  // from what's baked into the plan (or the plan's stored race date diverges
  // from the current race goal), the plan needs regenerating.
  const liveWeeksToRace = user.raceGoal?.date
    ? Math.max(
        1,
        Math.ceil((new Date(user.raceGoal.date).getTime() - Date.now()) / (7 * 86_400_000))
      )
    : null;
  const planRaceDate = plan.race?.date ?? null;
  const liveRaceDate = user.raceGoal?.date ?? null;
  const dateDiverged = !!planRaceDate && !!liveRaceDate && planRaceDate !== liveRaceDate;
  const weeksDiverged =
    liveWeeksToRace !== null && totalWeeks !== undefined && Math.abs(liveWeeksToRace - totalWeeks) > 1;
  const isStale = dateDiverged || weeksDiverged;

  const containerClass = isStale
    ? "relative bg-accent-soft border border-accent-mid rounded-md p-4 mb-5 overflow-hidden"
    : "relative bg-surface border border-border-soft rounded-md p-4 mb-5 overflow-hidden";
  const buttonClass = isStale
    ? "px-3 py-1.5 bg-accent hover:bg-accent-h text-white text-[11.5px] font-semibold rounded-md transition whitespace-nowrap shadow-sm"
    : "px-3 py-1.5 border border-border hover:border-accent hover:text-accent disabled:opacity-50 text-text-mid text-[11.5px] font-semibold rounded-md transition whitespace-nowrap";

  return (
    <div className={containerClass}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted font-semibold mb-0.5">
            Your training plan
            {isStale && (
              <span className="ml-2 text-accent">· OUT OF DATE</span>
            )}
          </div>
          <div className="text-[13px] font-bold tracking-tight text-text">
            {totalWeeks} weeks · {phasesCount} phases · {milestonesCount} milestones
          </div>
          {generated && !isStale && (
            <div className="text-[10.5px] text-text-muted mt-0.5">
              {state === "generating" ? "Regenerating…" : `Generated ${generated}`}
            </div>
          )}
          {isStale && state !== "generating" && (
            <div className="text-[11px] text-accent mt-1 font-medium leading-relaxed">
              {dateDiverged
                ? `Race date changed to ${formatRaceDate(liveRaceDate!)} — plan was built for ${formatRaceDate(planRaceDate!)}.`
                : `Plan covers ${totalWeeks} weeks but race is ${liveWeeksToRace} weeks away.`}{" "}
              Regenerate to refresh the phases.
            </div>
          )}
          {state === "generating" && (
            <div className="text-[10.5px] text-text-muted mt-0.5">Regenerating…</div>
          )}
        </div>
        <button
          onClick={onGenerate}
          disabled={state === "generating"}
          className={`w-full sm:w-auto ${buttonClass}`}
        >
          {state === "generating" ? "Regenerating…" : "Regenerate"}
        </button>
      </div>
      {error && <div className="text-[12px] text-modify font-medium mt-2">{error}</div>}

      {/* Bold animated progress bar pinned to the bottom of the banner during regeneration */}
      {state === "generating" && (
        <div className="absolute left-0 right-0 bottom-0 h-1 bg-accent-soft overflow-hidden">
          <div className="absolute inset-y-0 left-0 w-1/3 bg-accent rounded-r-full animate-plan-progress" />
        </div>
      )}

      <style>{`
        @keyframes plan-progress-slide {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(150%); }
          100% { transform: translateX(350%); }
        }
        .animate-plan-progress {
          animation: plan-progress-slide 1.6s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

function formatRaceDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
