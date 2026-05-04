import type { AthleteNotes, BodyMeasurement, PlannedSession } from "./storage";

export type NutritionTargets = {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  isHardDay: boolean;
  baseKcal: number;
  trainingKcal: number;
  goalMode: "cut" | "maintain" | "gain";
};

export type ReminderState = {
  daysSinceLastWeight: number | null;
  weightDue: boolean;
  daysSinceLastBodyFat: number | null;
  bodyFatDue: boolean;
};

export type BodyCompTrend = {
  series: { date: string; value: number }[];
  /** kg/week (weight) or %/week (body fat) */
  slopePerWeek: number | null;
  /** Projected value 8 weeks from latest reading */
  projectedIn8Weeks: number | null;
  /** First and last measurement values for delta */
  delta: number | null;
};

export type BodyCompGoal = {
  metric: "weight" | "bodyFat";
  target: number;
  /** ISO date if user named one — otherwise null */
  targetDate: string | null;
};

const CHECK_IN_INTERVAL_DAYS = 4;

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function computeNutritionTargets(opts: {
  weightKg: number | null;
  todaysSessions: PlannedSession[];
  athleteNotes?: AthleteNotes;
}): NutritionTargets | null {
  const { weightKg, todaysSessions, athleteNotes } = opts;
  if (!weightKg) return null;

  const baseKcal = Math.round(weightKg * 30);

  let trainingKcal = 0;
  let hardSessions = 0;
  for (const s of todaysSessions) {
    if (s.type === "rest" || s.slot === "REST") continue;
    const mins = parseMinutes(s.duration);
    let kcalPerMin = 8;
    if (s.type === "easy" || s.type === "swim") kcalPerMin = 8;
    else if (s.type === "strength") kcalPerMin = 6;
    else if (s.type === "long") {
      kcalPerMin = 9;
      hardSessions++;
    } else if (
      s.type === "tempo" ||
      s.type === "hard" ||
      s.type === "key" ||
      s.type === "brick" ||
      s.type === "test"
    ) {
      kcalPerMin = 11;
      hardSessions++;
    }
    trainingKcal += Math.round(mins * kcalPerMin);
  }

  const isHardDay = hardSessions > 0 || trainingKcal > 600;

  let goalMode: NutritionTargets["goalMode"] = "maintain";
  const goalText = (athleteNotes?.secondaryGoals || "").toLowerCase();
  if (/body ?fat|lean|cut\b|drop weight|lose weight|leaner/.test(goalText)) goalMode = "cut";
  else if (/\bbulk\b|gain mass|gain muscle/.test(goalText)) goalMode = "gain";

  let totalKcal = baseKcal + trainingKcal;
  if (!isHardDay) {
    if (goalMode === "cut") totalKcal -= 300;
    else if (goalMode === "gain") totalKcal += 200;
  }

  const proteinPerKg = goalMode === "cut" ? 2.0 : 1.8;
  const proteinG = Math.round(weightKg * proteinPerKg);
  const fatG = Math.round(weightKg * 1.0);

  const proteinKcal = proteinG * 4;
  const fatKcal = fatG * 9;
  const carbsKcal = totalKcal - proteinKcal - fatKcal;
  const carbsG = Math.max(50, Math.round(carbsKcal / 4));

  return {
    kcal: totalKcal,
    proteinG,
    carbsG,
    fatG,
    isHardDay,
    baseKcal,
    trainingKcal,
    goalMode,
  };
}

function parseMinutes(duration: string | undefined): number {
  if (!duration) return 0;
  const lower = duration.toLowerCase();
  const hourMatch = lower.match(/(\d+\.?\d*)\s*h/);
  if (hourMatch) return parseFloat(hourMatch[1]) * 60;
  const rangeMatch = lower.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (rangeMatch) return (parseInt(rangeMatch[1]) + parseInt(rangeMatch[2])) / 2;
  const minMatch = lower.match(/(\d+)/);
  if (minMatch) return parseInt(minMatch[1]);
  return 0;
}

export function computeReminders(measurements: BodyMeasurement[] = []): ReminderState {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weightMs = measurements.filter((m) => m.weightKg != null);
  const bfMs = measurements.filter((m) => m.bodyFatPct != null);

  const lastWeight = weightMs.sort((a, b) => b.date.localeCompare(a.date))[0];
  const lastBf = bfMs.sort((a, b) => b.date.localeCompare(a.date))[0];

  const daysSinceLastWeight = lastWeight
    ? Math.floor((today.getTime() - new Date(lastWeight.date).getTime()) / 86400000)
    : null;
  const daysSinceLastBodyFat = lastBf
    ? Math.floor((today.getTime() - new Date(lastBf.date).getTime()) / 86400000)
    : null;

  const weightDue =
    daysSinceLastWeight === null || daysSinceLastWeight >= CHECK_IN_INTERVAL_DAYS;
  const bodyFatDue =
    daysSinceLastBodyFat === null || daysSinceLastBodyFat >= CHECK_IN_INTERVAL_DAYS;

  return {
    daysSinceLastWeight,
    weightDue,
    daysSinceLastBodyFat,
    bodyFatDue,
  };
}

function linearRegression(points: { x: number; y: number }[]) {
  if (points.length < 2) return null;
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

export function computeBodyCompTrend(
  measurements: BodyMeasurement[],
  metric: "weight" | "bodyFat"
): BodyCompTrend {
  const series = measurements
    .filter((m) => (metric === "weight" ? m.weightKg != null : m.bodyFatPct != null))
    .map((m) => ({
      date: m.date,
      value: (metric === "weight" ? m.weightKg : m.bodyFatPct) as number,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (series.length < 2) {
    return {
      series,
      slopePerWeek: null,
      projectedIn8Weeks: null,
      delta: series.length === 1 ? 0 : null,
    };
  }

  const firstTime = new Date(series[0].date).getTime();
  const points = series.map((p) => ({
    x: (new Date(p.date).getTime() - firstTime) / 86400000,
    y: p.value,
  }));
  const reg = linearRegression(points);
  if (!reg) {
    return { series, slopePerWeek: null, projectedIn8Weeks: null, delta: null };
  }

  const slopePerWeek = reg.slope * 7;
  const lastX = points[points.length - 1].x;
  const projectedIn8Weeks = reg.slope * (lastX + 56) + reg.intercept;
  const delta = series[series.length - 1].value - series[0].value;

  return { series, slopePerWeek, projectedIn8Weeks, delta };
}

export function parseBodyCompGoal(
  athleteNotes?: AthleteNotes
): BodyCompGoal | null {
  const text = (athleteNotes?.secondaryGoals || "").toLowerCase();
  if (!text) return null;

  // "11% body fat" / "drop to 12 percent body fat"
  const bfMatch = text.match(/(\d+(?:\.\d+)?)\s*%?\s*(?:body ?fat|bf)/);
  if (bfMatch) {
    return {
      metric: "bodyFat",
      target: parseFloat(bfMatch[1]),
      targetDate: parseTargetDate(text),
    };
  }

  // "drop to 75kg" / "75 kg"
  const wMatch = text.match(/(\d+(?:\.\d+)?)\s*kg/);
  if (wMatch) {
    return {
      metric: "weight",
      target: parseFloat(wMatch[1]),
      targetDate: parseTargetDate(text),
    };
  }

  return null;
}

function parseTargetDate(text: string): string | null {
  const months = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const m = text.match(/by\s+([a-z]+)/);
  if (!m) return null;
  const idx = months.indexOf(m[1]);
  if (idx === -1) return null;
  const now = new Date();
  let year = now.getFullYear();
  if (idx < now.getMonth()) year++;
  // Default to mid-month
  return new Date(year, idx, 15).toISOString().slice(0, 10);
}
