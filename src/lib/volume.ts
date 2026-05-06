/**
 * Training-volume aggregation.
 *
 * Buckets RecentActivity[] by date range + sport, computes period totals,
 * compares against the equivalent prior period, and produces weekly buckets
 * for charting.
 */
import type { RecentActivity } from "./storage";

export type VolumeSport = "all" | "run" | "bike" | "swim" | "strength";

export type VolumeRange =
  | "this_week"
  | "this_month"
  | "last_7"
  | "last_30"
  | "last_90";

export type VolumeBucket = {
  /** Bucket start date (YYYY-MM-DD, local) */
  startDate: string;
  /** Human label for tooltip */
  label: string;
  /** Primary metric value (km for distance sports, sessions for strength, time for "all") */
  value: number;
  /** Total minutes inside the bucket */
  minutes: number;
  /** Activity count */
  sessions: number;
};

export type VolumeStats = {
  bucketGranularity: "day" | "week";
  buckets: VolumeBucket[];
  /** Primary metric for the period */
  primary: { value: number; unit: string; label: string };
  /** Secondary metrics shown alongside */
  secondary: { value: number; unit: string; label: string }[];
  /** Percentage change vs equivalent prior period (null if prior is empty) */
  delta: number | null;
  /** Raw current/prior totals for the primary metric */
  currentTotal: number;
  priorTotal: number;
};

const DAY_MS = 86_400_000;

function toLocalIsoFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeekLocal(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  // Monday = 0
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
  return r;
}

function startOfMonthLocal(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(1);
  return r;
}

/** Compute the [start, end) range covered by a VolumeRange selection. */
export function rangeBounds(range: VolumeRange, now = new Date()): { start: Date; end: Date } {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  let start: Date;
  switch (range) {
    case "this_week":
      start = startOfWeekLocal(now);
      break;
    case "this_month":
      start = startOfMonthLocal(now);
      break;
    case "last_7":
      start = new Date(now.getTime() - 6 * DAY_MS);
      start.setHours(0, 0, 0, 0);
      break;
    case "last_30":
      start = new Date(now.getTime() - 29 * DAY_MS);
      start.setHours(0, 0, 0, 0);
      break;
    case "last_90":
      start = new Date(now.getTime() - 89 * DAY_MS);
      start.setHours(0, 0, 0, 0);
      break;
  }
  return { start, end };
}

const RUN_PATTERNS = /run|treadmill|jog/i;
const BIKE_PATTERNS = /ride|bike|cycl|peloton|spin\b/i;
const SWIM_PATTERNS = /swim/i;
const STRENGTH_PATTERNS = /strength|weight|gym|workout|crossfit|lift|hyrox/i;

/**
 * Map an Intervals activity to our sport vocabulary.
 *
 * We classify on `type` first (Strava-style: "Run", "VirtualRide", "WeightTraining"),
 * but Intervals occasionally hands back generic types like "Workout" — in that case
 * we fall back to scanning the activity name. "VirtualRun" / "Zwift Run" still
 * route to "run" because we check bike LAST among the multi-word ambiguity sources.
 */
export function classifyActivitySport(type?: string, name?: string): VolumeSport {
  const t = type || "";
  const n = name || "";
  // RUN first (so "Zwift Run" / "VirtualRun" don't get bike-classified by zwift/virtual hints)
  if (RUN_PATTERNS.test(t) || RUN_PATTERNS.test(n)) return "run";
  if (SWIM_PATTERNS.test(t) || SWIM_PATTERNS.test(n)) return "swim";
  if (STRENGTH_PATTERNS.test(t) || STRENGTH_PATTERNS.test(n)) return "strength";
  if (BIKE_PATTERNS.test(t) || BIKE_PATTERNS.test(n)) return "bike";
  // Common Strava/Intervals-only platform names that hint sport
  if (/zwift|trainerroad|wahoo systm/i.test(n)) return "bike";
  return "all";
}

/** Filter activities by sport. "all" matches everything, "strength" matches gym-style activities. */
function matchesSport(a: RecentActivity, sport: VolumeSport): boolean {
  if (sport === "all") return true;
  return classifyActivitySport(a.type, a.name) === sport;
}

function withinRange(activityDate: string, start: Date, end: Date): boolean {
  // activity.date is "YYYY-MM-DD" local. Compare lexicographically against local-iso of bounds.
  const aIso = activityDate.slice(0, 10);
  const sIso = toLocalIsoFromDate(start);
  const eIso = toLocalIsoFromDate(end);
  return aIso >= sIso && aIso <= eIso;
}

/** Group activities into time buckets for charting. */
function bucketize(
  activities: RecentActivity[],
  start: Date,
  end: Date,
  granularity: "day" | "week"
): VolumeBucket[] {
  const buckets: VolumeBucket[] = [];
  if (granularity === "day") {
    const days = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
    for (let i = 0; i < days; i++) {
      const d = new Date(start.getTime() + i * DAY_MS);
      const iso = toLocalIsoFromDate(d);
      buckets.push({
        startDate: iso,
        label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        value: 0,
        minutes: 0,
        sessions: 0,
      });
    }
  } else {
    // Walk weeks Monday → Monday until we exceed end
    let cursor = startOfWeekLocal(start);
    while (cursor <= end) {
      const iso = toLocalIsoFromDate(cursor);
      buckets.push({
        startDate: iso,
        label: cursor.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        value: 0,
        minutes: 0,
        sessions: 0,
      });
      cursor = new Date(cursor.getTime() + 7 * DAY_MS);
    }
  }

  // Drop activities into their bucket
  for (const a of activities) {
    const aIso = a.date.slice(0, 10);
    const aDate = new Date(aIso + "T00:00:00");
    let bucketIso: string;
    if (granularity === "day") {
      bucketIso = aIso;
    } else {
      bucketIso = toLocalIsoFromDate(startOfWeekLocal(aDate));
    }
    const b = buckets.find((x) => x.startDate === bucketIso);
    if (!b) continue;
    b.minutes += a.duration_min ?? 0;
    b.sessions += 1;
    b.value += 0; // primary value computed below per sport
  }

  return buckets;
}

/** Choose chart granularity based on range length. */
function chooseGranularity(range: VolumeRange): "day" | "week" {
  if (range === "this_week" || range === "last_7") return "day";
  return "week";
}

function sum(arr: number[]): number {
  return arr.reduce((acc, v) => acc + v, 0);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Compute the full volume widget state for a sport+range selection.
 */
export function computeVolume(
  activities: RecentActivity[],
  sport: VolumeSport,
  range: VolumeRange,
  now = new Date()
): VolumeStats {
  const { start, end } = rangeBounds(range, now);
  const filtered = activities.filter((a) => matchesSport(a, sport) && withinRange(a.date, start, end));

  // Prior period = same length, immediately before
  const periodMs = end.getTime() - start.getTime();
  const priorEnd = new Date(start.getTime() - 1);
  const priorStart = new Date(start.getTime() - 1 - periodMs);
  const prior = activities.filter((a) => matchesSport(a, sport) && withinRange(a.date, priorStart, priorEnd));

  // Primary metric: distance for distance-sports, sessions for strength, total time for "all"
  const granularity = chooseGranularity(range);
  const buckets = bucketize(filtered, start, end, granularity);

  let primary: VolumeStats["primary"];
  let secondary: VolumeStats["secondary"];
  let currentTotal: number;
  let priorTotal: number;

  if (sport === "strength") {
    currentTotal = filtered.length;
    priorTotal = prior.length;
    primary = { value: currentTotal, unit: "sessions", label: "Strength sessions" };
    const totalMin = round1(sum(filtered.map((a) => a.duration_min ?? 0)));
    secondary = [
      { value: totalMin, unit: "min", label: "Time" },
      { value: 0, unit: "kg", label: "Volume — coming soon" },
    ];
    // Bucket value = sessions count
    for (const b of buckets) {
      const inBucket = filtered.filter((a) => activityInBucket(a, b, granularity));
      b.value = inBucket.length;
    }
  } else if (sport === "all") {
    currentTotal = round1(sum(filtered.map((a) => a.duration_min ?? 0)));
    priorTotal = round1(sum(prior.map((a) => a.duration_min ?? 0)));
    primary = { value: currentTotal, unit: "min", label: "Total time" };
    const totalKm = round1(
      sum(
        filtered
          .filter((a) => classifyActivitySport(a.type, a.name) !== "strength")
          .map((a) => a.distance_km ?? 0)
      )
    );
    const sessionCount = filtered.length;
    secondary = [
      { value: totalKm, unit: "km", label: "Distance" },
      { value: sessionCount, unit: "sessions", label: "Sessions" },
    ];
    for (const b of buckets) {
      const inBucket = filtered.filter((a) => activityInBucket(a, b, granularity));
      b.value = round1(sum(inBucket.map((a) => a.duration_min ?? 0)));
    }
  } else {
    // run / bike / swim — distance is the primary metric
    currentTotal = round1(sum(filtered.map((a) => a.distance_km ?? 0)));
    priorTotal = round1(sum(prior.map((a) => a.distance_km ?? 0)));
    primary = { value: currentTotal, unit: "km", label: "Distance" };
    const totalMin = round1(sum(filtered.map((a) => a.duration_min ?? 0)));
    secondary = [
      { value: totalMin, unit: "min", label: "Time" },
      { value: filtered.length, unit: "sessions", label: "Sessions" },
    ];
    for (const b of buckets) {
      const inBucket = filtered.filter((a) => activityInBucket(a, b, granularity));
      b.value = round1(sum(inBucket.map((a) => a.distance_km ?? 0)));
    }
  }

  const delta = priorTotal === 0 ? null : ((currentTotal - priorTotal) / priorTotal) * 100;

  return {
    bucketGranularity: granularity,
    buckets,
    primary,
    secondary,
    delta: delta === null ? null : Math.round(delta),
    currentTotal,
    priorTotal,
  };
}

function activityInBucket(
  a: RecentActivity,
  b: VolumeBucket,
  granularity: "day" | "week"
): boolean {
  const aIso = a.date.slice(0, 10);
  if (granularity === "day") return aIso === b.startDate;
  // Week bucket: a's date should be within [startDate, startDate + 7d)
  const start = new Date(b.startDate + "T00:00:00");
  const end = new Date(start.getTime() + 7 * DAY_MS);
  const aDate = new Date(aIso + "T00:00:00");
  return aDate >= start && aDate < end;
}

export const RANGE_OPTIONS: { id: VolumeRange; label: string; short: string }[] = [
  { id: "this_week", label: "This week", short: "Week" },
  { id: "this_month", label: "This month", short: "Month" },
  { id: "last_7", label: "Last 7 days", short: "7d" },
  { id: "last_30", label: "Last 30 days", short: "30d" },
  { id: "last_90", label: "Last 90 days", short: "90d" },
];

export const SPORT_OPTIONS: { id: VolumeSport; label: string }[] = [
  { id: "all", label: "All" },
  { id: "run", label: "Run" },
  { id: "bike", label: "Bike" },
  { id: "swim", label: "Swim" },
  { id: "strength", label: "Strength" },
];
