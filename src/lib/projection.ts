/**
 * Forward projection of CTL/ATL from today through to race day, assuming
 * the athlete completes 100% of the planned sessions. Used by the dashboard
 * performance trend chart so the line extends into the future as a dashed
 * preview of where fitness will land if the plan is executed cleanly.
 *
 * Approach: Bannister/EWMA model — same exponential smoothing Intervals.icu
 * uses internally, so the projection joins seamlessly with the historical
 * line at "today" without a discontinuity.
 *
 *   CTL[d] = CTL[d-1] + (TSS[d] - CTL[d-1]) × (1 − exp(−1/42))
 *   ATL[d] = ATL[d-1] + (TSS[d] - ATL[d-1]) × (1 − exp(−1/7))
 *
 * TSS per planned session is estimated from duration + session type using
 * Coggan-style intensity factors. Pure aerobic days run ~30-50 TSS, key
 * quality days run ~70-100, long days run ~80-120 depending on volume.
 */
import {
  normalizeDay,
  type Plan,
  type PlanPhase,
  type PlannedSession,
  type SessionType,
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

/**
 * Average intensity factor by session type. Calibrated to Coggan zones:
 *   IF 0.55 ≈ Z1/Z2 recovery
 *   IF 0.70 ≈ Z2 endurance / long
 *   IF 0.82 ≈ Z3 tempo
 *   IF 0.92 ≈ Z4/Z5 threshold / VO2 average over the whole session
 *   IF 1.00 ≈ test / race effort
 */
const IF_BY_TYPE: Record<SessionType, number> = {
  rest: 0,
  easy: 0.58,
  long: 0.72,
  tempo: 0.82,
  key: 0.88,
  hard: 0.9,
  test: 1.0,
  race: 1.0,
  // Strength and swim use lower aerobic stress equivalents — strength
  // doesn't show up in CTL the way ride/run does. Conservative numbers.
  strength: 0.4,
  swim: 0.68,
  brick: 0.85,
};

/**
 * Parse a duration string like "60min", "75-90min", "1h", "1h 30min",
 * "75-90 min" into the midpoint in minutes. Falls back to a type-aware
 * default when the string is "—" / empty / unparseable.
 */
export function parseDurationMinutes(
  duration: string | undefined,
  fallbackType: SessionType = "easy"
): number {
  if (!duration) return defaultDurationFor(fallbackType);
  const cleaned = duration.toLowerCase().replace(/\s+/g, "");

  // "1h30min" or "1h"
  const hMatch = cleaned.match(/(\d+(?:\.\d+)?)h(?:r)?(?:(\d+)m(?:in)?)?/);
  if (hMatch) {
    const h = parseFloat(hMatch[1]);
    const m = hMatch[2] ? parseInt(hMatch[2], 10) : 0;
    return h * 60 + m;
  }

  // "60-90min" or "60to90min" — take midpoint
  const range = cleaned.match(/(\d+)[\-to]+(\d+)\s*m(?:in)?/);
  if (range) {
    const lo = parseInt(range[1], 10);
    const hi = parseInt(range[2], 10);
    return (lo + hi) / 2;
  }

  // "60min" / "60 min" / "60"
  const single = cleaned.match(/(\d+(?:\.\d+)?)\s*m?(?:in)?/);
  if (single) {
    return parseFloat(single[1]);
  }

  return defaultDurationFor(fallbackType);
}

function defaultDurationFor(type: SessionType): number {
  switch (type) {
    case "rest":
      return 0;
    case "easy":
      return 45;
    case "tempo":
      return 50;
    case "key":
    case "hard":
      return 60;
    case "long":
      return 90;
    case "strength":
      return 40;
    case "swim":
      return 45;
    case "brick":
      return 75;
    case "test":
    case "race":
      return 60;
  }
}

/**
 * Estimate TSS for a single planned session. TSS = (duration_hours × IF² × 100).
 * Strength and swim are dampened because they don't drive cycling CTL the way
 * a bike or run does — including them at full TSS would inflate the projection.
 */
export function estimateSessionTss(session: PlannedSession): number {
  if (session.type === "rest") return 0;
  const minutes = parseDurationMinutes(session.duration, session.type);
  if (minutes <= 0) return 0;
  const intensity = IF_BY_TYPE[session.type] ?? 0.6;
  const hours = minutes / 60;
  const tss = hours * intensity * intensity * 100;
  return Math.round(tss);
}

function phaseForDate(phases: PlanPhase[], date: Date): PlanPhase | null {
  for (const p of phases) {
    const start = new Date(p.start_date);
    const end = new Date(p.end_date);
    end.setHours(23, 59, 59, 999);
    if (date >= start && date <= end) return p;
  }
  return null;
}

function dayKeyFor(date: Date): (typeof DAY_KEYS)[number] {
  // JS getDay: Sun=0..Sat=6 → shift to Mon=0..Sun=6
  return DAY_KEYS[(date.getDay() + 6) % 7];
}

/**
 * Estimated TSS for a given calendar date, summing across all planned
 * sessions for that day in the relevant phase. Respects weekOverrides if
 * present — drag-and-drop moves and one-off edits are reflected.
 */
export function plannedTssForDate(plan: Plan, dateIso: string): number {
  const date = new Date(dateIso);
  const phase = phaseForDate(plan.phases, date);
  if (!phase) return 0;
  const dayKey = dayKeyFor(date);
  // Monday-of-week ISO key matches plan.weekOverrides storage.
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  const mondayIso = monday.toISOString().slice(0, 10);

  const override = plan.weekOverrides?.[mondayIso]?.[dayKey];
  const sessions =
    override !== undefined
      ? normalizeDay(override)
      : normalizeDay(phase.weekly_template[dayKey]);

  return sessions.reduce((sum, s) => sum + estimateSessionTss(s), 0);
}

export type ProjectedPoint = {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
};

/**
 * Project CTL/ATL forward from today through to the race date (or `daysAhead`
 * days if no race is set). Starts from the latest known fitness values.
 *
 * @param opts.startCtl - current CTL (from synced.fitness.ctl)
 * @param opts.startAtl - current ATL (from synced.fitness.atl)
 * @param opts.plan - the plan with phases + overrides
 * @param opts.fromDateIso - today (or any starting point)
 * @param opts.untilDateIso - usually race date
 * @param opts.daysAhead - fallback if untilDateIso not provided (default 84 = 12 weeks)
 */
export function projectFitness(opts: {
  startCtl: number | null;
  startAtl: number | null;
  plan: Plan | undefined;
  fromDateIso: string;
  untilDateIso?: string;
  daysAhead?: number;
}): ProjectedPoint[] {
  if (
    opts.startCtl == null ||
    opts.startAtl == null ||
    !opts.plan ||
    !opts.plan.phases?.length
  ) {
    return [];
  }

  const lambdaCtl = 1 - Math.exp(-1 / 42);
  const lambdaAtl = 1 - Math.exp(-1 / 7);

  const start = new Date(opts.fromDateIso + "T00:00:00");
  const end = opts.untilDateIso
    ? new Date(opts.untilDateIso + "T00:00:00")
    : new Date(start.getTime() + (opts.daysAhead ?? 84) * 86400000);
  if (end <= start) return [];

  const out: ProjectedPoint[] = [];
  let ctl = opts.startCtl;
  let atl = opts.startAtl;

  // Iterate day-by-day, applying that day's planned TSS through the EWMA.
  const cur = new Date(start);
  while (cur <= end) {
    const iso = cur.toISOString().slice(0, 10);
    const tss = plannedTssForDate(opts.plan, iso);
    ctl = ctl + (tss - ctl) * lambdaCtl;
    atl = atl + (tss - atl) * lambdaAtl;
    out.push({
      date: iso,
      ctl: Number(ctl.toFixed(1)),
      atl: Number(atl.toFixed(1)),
      tsb: Number((ctl - atl).toFixed(1)),
    });
    cur.setDate(cur.getDate() + 1);
  }

  return out;
}
