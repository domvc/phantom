"use client";

import { useEffect, useMemo, useState } from "react";
import {
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
import { reconciliationForDate } from "@/lib/reconcile";
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
        <div className="p-7 max-w-6xl">
          <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-semibold mb-2">
            Today ·{" "}
            {new Date().toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            {name}. Here&apos;s today.
          </h1>
          <p className="text-text-mid text-[14px] mb-7">
            {synced
              ? `Data read ${new Date(synced.synced_at).toLocaleString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  day: "numeric",
                  month: "short",
                })}. Decisions follow below.`
              : "Sync your data in the sidebar. The coach reads it before deciding anything."}
          </p>

          {/* Session reconciliation banner — what you actually did vs the plan */}
          {user.reconciliations && user.reconciliations.length > 0 && (
            <SessionReconcileBanner
              reconciliations={user.reconciliations}
              plan={user.plan}
            />
          )}

          {/* 4-up hero: Readiness · Today's Session · Last Session · Nutrition */}
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
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
          {synced && <MetricStrip synced={synced} />}

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
            />
          </div>

          {/* Chart + Recent Sessions */}
          <div className="grid lg:grid-cols-3 gap-5 mb-10">
            <div className="lg:col-span-2 bg-surface border border-border-soft rounded-md p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted font-semibold">
                  Performance Trend · last 90 days
                </div>
                <div className="flex gap-3 text-[10.5px] text-text-muted font-medium">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-[#1F6B2A]" />CTL
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-[#C0884A]" />ATL
                  </span>
                </div>
              </div>
              <div className="h-52">
                {synced ? (
                  <PerfChart daily={synced.daily_90d} raceDate={race?.date} />
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
    <div className="border-b border-border-soft px-7 py-2.5 flex items-center justify-between bg-bg flex-shrink-0">
      <div className="text-[12px] text-text-muted">
        <strong className="text-text-mid font-semibold">Demo workspace</strong> ·{" "}
        {synced ? (
          <span className="text-go font-semibold">● Synced</span>
        ) : (
          <span>Not yet synced</span>
        )}
      </div>
      <div className="flex gap-2">
        {synced?.derived?.phase && (
          <span className="px-2.5 py-1 rounded-full bg-accent-soft border border-accent-mid text-accent text-[10.5px] font-semibold uppercase tracking-wide">
            {synced.derived.phase}
          </span>
        )}
        {race && (
          <span className="px-2.5 py-1 rounded-full bg-surface-2 border border-border text-text-muted text-[10.5px] font-semibold uppercase tracking-wide">
            {race.type}
          </span>
        )}
        {daysToRace !== null && (
          <span className="px-2.5 py-1 rounded-full bg-surface-2 border border-border text-text-muted text-[10.5px] font-semibold uppercase tracking-wide">
            {daysToRace}d to race
          </span>
        )}
      </div>
    </div>
  );
}

function ReadinessCard({ synced }: { synced?: SyncedData }) {
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
    <div className="bg-surface border border-border-soft rounded-md p-6">
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

  // Did the athlete already complete a session today? If so, swap the card to
  // reflect what they actually did (with the planned session shown as struck-through).
  const todayReconciliation = reconciliationForDate(user.reconciliations, todayIso);

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
        {Array.isArray(todaysSessions) && todaysSessions.length > 1 && (
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

function MetricStrip({ synced }: { synced: SyncedData }) {
  const f = synced.fitness;
  const d = synced.derived;
  const a = synced.athlete;
  const daily: DailyRow[] = synced.daily_90d ?? [];

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
    <div className="bg-surface border border-border-soft rounded-md mb-5 flex overflow-visible">
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
        value={synced.wkg != null ? synced.wkg.toFixed(2) : "—"}
        tone={synced.wkg == null ? "muted" : synced.wkg >= 3.5 ? "ok" : synced.wkg >= 2.8 ? "default" : "warn"}
        definition={METRIC_DEFINITIONS.wkg}
      />
      <MetricChip
        label="Weight"
        value={a.weight != null ? `${a.weight}kg` : "—"}
        definition={METRIC_DEFINITIONS.weight}
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
      <div className="bg-accent-soft border border-accent-mid rounded-md p-5 mb-5 flex items-start gap-4">
        <div className="text-2xl pt-0.5">📋</div>
        <div className="flex-1">
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
          className="px-4 py-2 bg-accent hover:bg-accent-h disabled:opacity-50 disabled:cursor-not-allowed text-white text-[12px] font-semibold rounded-md transition whitespace-nowrap self-center"
        >
          {state === "generating" ? "Generating…" : "Generate Plan"}
        </button>
      </div>
    );
  }

  return (
    <div className="relative bg-surface border border-border-soft rounded-md p-4 mb-5 overflow-hidden">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted font-semibold mb-0.5">
            Your training plan
          </div>
          <div className="text-[13px] font-bold tracking-tight text-text">
            {totalWeeks} weeks · {phasesCount} phases · {milestonesCount} milestones
          </div>
          {generated && (
            <div className="text-[10.5px] text-text-muted mt-0.5">
              {state === "generating" ? "Regenerating…" : `Generated ${generated}`}
            </div>
          )}
        </div>
        <button
          onClick={onGenerate}
          disabled={state === "generating"}
          className="px-3 py-1.5 border border-border hover:border-accent hover:text-accent disabled:opacity-50 text-text-mid text-[11.5px] font-semibold rounded-md transition whitespace-nowrap"
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
