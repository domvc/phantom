/**
 * localStorage-backed user state for the demo.
 * Will be replaced by Supabase + Clerk in production.
 */

export type IntervalsConnection = {
  apiKey: string;
  athleteId: string;
  athleteName?: string;
  connectedAt: string;
};

export type RaceType =
  | "5K"
  | "10K"
  | "HM"
  | "Marathon"
  | "Ultra"
  | "Olympic Tri"
  | "Half Ironman"
  | "Ironman"
  | "Other";

export type RaceGoal = {
  name: string;
  type: RaceType;
  date: string;
  targetTime: string;
  /** Free-text race format detail — used for ultras (distance/duration), backyard formats, multi-day events. */
  raceDetails?: string;
  notes?: string;
};

export type SportPref = "run" | "bike" | "swim" | "strength" | "mobility";

export type TrainingPrefs = {
  sports: SportPref[];
  hasBike?: boolean;
  hasGym?: boolean;
  hasPool?: boolean;
  conditioningEmphasis?: "minimal" | "moderate" | "high";
  notes?: string;
};

export type AthleteNotes = {
  weeklyPattern?: string;
  upcomingDisruptions?: string;
  secondaryGoals?: string;
  constraints?: string;
  updatedAt?: string;
};

export type DailyRow = { date: string; ctl: number | null; atl: number | null; tsb: number | null };
export type RecentActivity = {
  id: string;
  date: string;
  name: string;
  type: string;
  distance_km: number | null;
  duration_min: number | null;
  tss: number | null;
  intensity: number | null;
  avg_hr: number | null;
};

export type SyncedData = {
  synced_at: string;
  athlete: { id: string; name: string; ftp: number | null; lthr: number | null; weight: number | null };
  fitness: { ctl: number; atl: number; tsb: number; date: string } | null;
  derived: { acwr: number | null; ramp_rate: number | null; phase: string };
  wkg: number | null;
  readiness: { recommendation: string; reason: string; priority: number };
  daily_90d: DailyRow[];
  recent_activities: RecentActivity[];
};

export type SessionType =
  | "rest"
  | "easy"
  | "hard"
  | "tempo"
  | "key"
  | "long"
  | "strength"
  | "swim"
  | "brick"
  | "test"
  | "race";

export type SessionSport = "bike" | "run" | "swim" | "strength" | "brick" | "rest";

/**
 * A structured interval inside a session. Used for .pwx export to TrainingPeaks etc.
 * Optional — only emitted for bike/run sessions where structured targets are useful.
 */
export type IntervalStep = {
  /** Logical role: warmup, steady, work (interval), recovery, cooldown */
  kind: "warmup" | "steady" | "work" | "recovery" | "cooldown";
  /** Duration in seconds */
  duration_s: number;
  /** Target metric — power for bike, pace for run, hr fallback */
  target_type: "power_pct_ftp" | "power_w" | "hr_pct_lthr" | "pace" | "rpe" | "free";
  /** Lower bound of target range */
  target_low?: number;
  /** Upper bound of target range */
  target_high?: number;
  /** Free-text label for the step (e.g. "Z2 main", "VO2 rep") */
  label?: string;
};

/**
 * If the session is a structured interval set (e.g. "5 × 4min @ VO2 / 3min easy"),
 * encode it as a repeated block rather than expanding all 10 steps inline.
 */
export type IntervalBlock =
  | { type: "step"; step: IntervalStep }
  | { type: "repeat"; count: number; steps: IntervalStep[] };

export type PlannedSession = {
  slot: "AM" | "PM" | "OPTIONAL" | "REST" | "";
  type: SessionType;
  title: string;
  duration: string;
  summary: string;
  sport?: SessionSport;
  /** Structured workout description for .pwx / .zwo export. Optional — older plans don't have it. */
  intervals?: IntervalBlock[];
};

export type WeeklyTemplate = {
  monday: PlannedSession[];
  tuesday: PlannedSession[];
  wednesday: PlannedSession[];
  thursday: PlannedSession[];
  friday: PlannedSession[];
  saturday: PlannedSession[];
  sunday: PlannedSession[];
};

export type PlanPhase = {
  name: string;
  weeks_from_start: number;
  weeks_to_end: number;
  start_date: string;
  end_date: string;
  focus: string;
  ctl_target_end?: number | null;
  weekly_template: WeeklyTemplate;
};

export type PlanMilestone = {
  date: string;
  title: string;
  desc: string;
  type: "test" | "ramp_up" | "race" | "checkpoint" | "phase_end";
};

export type Plan = {
  generated_at: string;
  race: { name: string; date: string; type: string };
  total_weeks: number;
  phases: PlanPhase[];
  milestones: PlanMilestone[];
  rationale?: string;
};

export type PlanAmendment = {
  id: string;
  appliedAt: string;
  weekContext?: string;
  description: string;
};

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type SessionFeedback = {
  activityId: string;
  activityDate: string;
  activityName: string;
  feedback: string;
  recordedAt: string;
};

export type NutritionAdherence = "under" | "hit" | "over";

export type NutritionLog = {
  date: string;
  kcalAdherence?: NutritionAdherence;
  proteinAdherence?: NutritionAdherence;
  note?: string;
};

export type BodyMeasurement = {
  date: string;
  weightKg?: number;
  bodyFatPct?: number;
  note?: string;
};

export type UserState = {
  intervals?: IntervalsConnection;
  raceGoal?: RaceGoal;
  trainingPrefs?: TrainingPrefs;
  athleteNotes?: AthleteNotes;
  onboardingComplete?: boolean;
  synced?: SyncedData;
  plan?: Plan;
  amendments?: PlanAmendment[];
  weeklyBriefs?: Record<string, string>;
  chatHistory?: ChatMessage[];
  sessionFeedbacks?: SessionFeedback[];
  nutritionLogs?: NutritionLog[];
  bodyMeasurements?: BodyMeasurement[];
  /** Internal migration flag — bump key when prompts change */
  briefVersion?: number;
};

const CURRENT_BRIEF_VERSION = 5;

const KEY = "phantomcoach:user";

export function getUserState(): UserState {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const state: UserState = JSON.parse(raw);
    // One-shot migration: clear stale weekly briefs when prompt schema bumps.
    if ((state.briefVersion ?? 0) < CURRENT_BRIEF_VERSION) {
      state.weeklyBriefs = {};
      state.briefVersion = CURRENT_BRIEF_VERSION;
      localStorage.setItem(KEY, JSON.stringify(state));
    }
    return state;
  } catch {
    return {};
  }
}

export function setUserState(patch: Partial<UserState>) {
  if (typeof window === "undefined") return;
  const current = getUserState();
  const next = { ...current, ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function clearUserState() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}

/**
 * Normalize a weekly_template value — older plans stored each day as a free-text
 * string ("AM: Zwift | PM: Strength"). New plans store an array of session objects.
 * This helper accepts either shape and returns PlannedSession[].
 */
export function normalizeDay(value: unknown): PlannedSession[] {
  if (Array.isArray(value)) {
    return value as PlannedSession[];
  }
  if (typeof value !== "string" || !value.trim()) {
    return [{ slot: "REST", type: "rest", title: "Rest", duration: "—", summary: "Rest day", sport: "rest" }];
  }
  const t = value.toLowerCase();
  if (t.includes("rest") && !t.includes(" | ")) {
    return [{ slot: "REST", type: "rest", title: "Rest", duration: "—", summary: value, sport: "rest" }];
  }
  return value.split(" | ").map((part): PlannedSession => {
    const slotMatch = part.match(/^(AM|PM|OPTIONAL|optional)/i);
    const slot = (slotMatch ? slotMatch[0].toUpperCase() : "AM") as PlannedSession["slot"];
    const desc = part.replace(/^(AM|PM|optional|OPTIONAL):\s*/i, "").replace(/^optional\s+/i, "").trim();
    const tl = desc.toLowerCase();
    let type: SessionType = "easy";
    let title = desc.slice(0, 30);
    let sport: SessionSport | undefined;
    if (tl.includes("zwift") && tl.includes("key")) { type = "key"; title = "Key Ride"; sport = "bike"; }
    else if (tl.includes("zwift")) { type = "easy"; title = "Z2 Ride"; sport = "bike"; }
    else if (tl.includes("strength")) { type = "strength"; title = "Strength"; sport = "strength"; }
    else if (tl.includes("threshold") || tl.includes("interval")) { type = "hard"; title = "Quality Run"; sport = "run"; }
    else if (tl.includes("long ride")) { type = "long"; title = "Long Ride"; sport = "bike"; }
    else if (tl.includes("long run")) { type = "long"; title = "Long Run"; sport = "run"; }
    else if (tl.includes("long")) { type = "long"; title = "Long Session"; }
    else if (tl.includes("brick")) { type = "brick"; title = "Brick"; sport = "brick"; }
    else if (tl.includes("run")) { type = "easy"; title = "Easy Run"; sport = "run"; }
    else if (tl.includes("swim")) { type = "swim"; title = "Swim"; sport = "swim"; }
    return {
      slot,
      type,
      title,
      duration: "",
      summary: desc,
      sport,
    };
  });
}
