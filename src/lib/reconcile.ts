/**
 * Client-side reconciliation runner.
 *
 * After every Intervals sync we check for activities the user did since their
 * last reconciliation. For each new one we ask the model to classify it
 * against the planned session for that day and store the result.
 *
 * Runs in the background — non-blocking, errors are swallowed (UI keeps working).
 */
import {
  getUserState,
  setUserState,
  normalizeDay,
  type RecentActivity,
  type Plan,
  type PlanPhase,
  type PlannedSession,
  type SessionReconciliation,
  type SyncedData,
} from "./storage";

const DAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const RECONCILE_LOOKBACK_DAYS = 4;

/** Map activity.type strings from Intervals to our sport vocabulary. */
function mapActivitySport(rawType: string | undefined): string | undefined {
  if (!rawType) return undefined;
  const t = rawType.toLowerCase();
  if (t.includes("ride") || t.includes("bike") || t.includes("cycl") || t.includes("zwift")) return "bike";
  if (t.includes("run")) return "run";
  if (t.includes("swim")) return "swim";
  if (t.includes("strength") || t.includes("weight") || t.includes("workout") || t.includes("gym")) return "strength";
  return undefined;
}

/** Find the phase that covers a given date. */
function phaseForDate(plan: Plan | undefined, dateIso: string): PlanPhase | null {
  if (!plan) return null;
  const d = new Date(dateIso);
  for (const p of plan.phases || []) {
    const start = new Date(p.start_date);
    const end = new Date(p.end_date);
    if (d >= start && d <= end) return p;
  }
  return null;
}

/** Get the planned sessions for a given date from the plan. */
function plannedSessionsForDate(plan: Plan | undefined, dateIso: string): PlannedSession[] {
  const phase = phaseForDate(plan, dateIso);
  if (!phase) return [];
  const date = new Date(dateIso);
  // ISO weekday: Mon=1..Sun=7. JS getDay: Sun=0..Sat=6
  const jsDay = date.getDay();
  const dayKey = DAY_KEYS[(jsDay + 6) % 7];
  const raw = phase.weekly_template[dayKey as keyof typeof phase.weekly_template];
  return normalizeDay(raw);
}

type ReconcileResult = { status: SessionReconciliation["status"]; message: string };

async function classifyActivity(opts: {
  activity: RecentActivity;
  plannedSessions: PlannedSession[];
  phase: PlanPhase | null;
  recentChat?: { role: "user" | "assistant"; content: string }[];
}): Promise<ReconcileResult | null> {
  try {
    const res = await fetch("/api/session/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    });
    if (!res.ok || !res.body) return null;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let raw = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();

    if (raw.includes("__STREAM_ERROR__")) return null;
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const parsed = JSON.parse(cleaned);
    if (!parsed?.status || !parsed?.message) return null;
    return { status: parsed.status, message: parsed.message };
  } catch {
    return null;
  }
}

/**
 * Find activities from the last N days that haven't been reconciled yet.
 */
function findUnreconciledActivities(
  synced: SyncedData,
  existing: SessionReconciliation[]
): RecentActivity[] {
  const seen = new Set(existing.map((r) => r.activityId));
  const now = Date.now();
  const cutoff = now - RECONCILE_LOOKBACK_DAYS * 86400_000;

  const fresh = synced.recent_activities.filter((a) => {
    if (seen.has(a.id)) return false;
    const ts = new Date(a.date).getTime();
    return ts >= cutoff && ts <= now + 86400_000;
  });

  // Most recent first
  fresh.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return fresh;
}

export type ReconcileRunResult = {
  newReconciliations: SessionReconciliation[];
  skipped: number;
};

/**
 * Public entry: run after a successful sync. Reconciles up to `maxBatch`
 * fresh activities. Persists results and returns the new ones for the UI to show.
 */
export async function runReconciliationsAfterSync(maxBatch = 3): Promise<ReconcileRunResult> {
  const state = getUserState();
  const synced = state.synced;
  if (!synced) return { newReconciliations: [], skipped: 0 };

  const existing = state.reconciliations ?? [];
  const fresh = findUnreconciledActivities(synced, existing);
  if (fresh.length === 0) return { newReconciliations: [], skipped: 0 };

  const batch = fresh.slice(0, maxBatch);
  const skipped = fresh.length - batch.length;
  const newOnes: SessionReconciliation[] = [];

  // Shared across the batch — the most recent main-coach chat. If the athlete
  // told the main coach they were doing a one-off session ("100km ride today",
  // "swapping Tue and Wed this week"), the reconciler should respect that and
  // not flag it as a deviation.
  const recentChat = (state.chatHistory ?? []).slice(-12);

  for (const activity of batch) {
    const dateIso = activity.date.slice(0, 10);
    const planned = plannedSessionsForDate(state.plan, dateIso);
    const phase = phaseForDate(state.plan, dateIso);
    const sport = mapActivitySport(activity.type);

    const result = await classifyActivity({
      activity,
      plannedSessions: planned,
      phase,
      recentChat,
    });

    if (!result) continue;

    const rec: SessionReconciliation = {
      activityId: activity.id,
      activityDate: dateIso,
      activityName: activity.name,
      activitySport: sport,
      durationMin: activity.duration_min,
      distanceKm: activity.distance_km,
      tss: activity.tss,
      plannedTitle: planned[0]?.title,
      plannedSport: planned[0]?.sport,
      plannedType: planned[0]?.type,
      status: result.status,
      message: result.message,
      reconciledAt: new Date().toISOString(),
      dismissed: false,
    };
    newOnes.push(rec);
  }

  if (newOnes.length > 0) {
    const merged = [...existing, ...newOnes];
    // Cap retention to last 100 to keep state small
    const trimmed = merged
      .sort((a, b) => new Date(b.reconciledAt).getTime() - new Date(a.reconciledAt).getTime())
      .slice(0, 100);
    setUserState({ reconciliations: trimmed });
  }

  return { newReconciliations: newOnes, skipped };
}

/**
 * Find ALL reconciliations for a specific date — used when an athlete logs
 * more than one session in a day (e.g. AM strength + PM run, or a brick).
 * Sorted most-recent first.
 */
export function reconciliationsForDate(
  reconciliations: SessionReconciliation[] | undefined,
  dateIso: string
): SessionReconciliation[] {
  if (!Array.isArray(reconciliations)) return [];
  return reconciliations
    .filter((r) => r.activityDate === dateIso)
    .sort((a, b) => new Date(b.reconciledAt).getTime() - new Date(a.reconciledAt).getTime());
}

/**
 * Find the single most recent reconciliation for a date — used by the
 * dashboard "what you did" headline tile. For multi-session days, the
 * calendar (which uses `reconciliationsForDate`) is the canonical view.
 */
export function reconciliationForDate(
  reconciliations: SessionReconciliation[] | undefined,
  dateIso: string
): SessionReconciliation | null {
  return reconciliationsForDate(reconciliations, dateIso)[0] ?? null;
}

/** Update a single reconciliation in place (e.g. dismiss / mark adapted). */
export function patchReconciliation(activityId: string, patch: Partial<SessionReconciliation>) {
  const state = getUserState();
  const existing = state.reconciliations ?? [];
  const updated = existing.map((r) =>
    r.activityId === activityId ? { ...r, ...patch } : r
  );
  setUserState({ reconciliations: updated });
}
