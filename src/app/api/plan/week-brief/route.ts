import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  computeNutritionTargets,
  type NutritionTargets,
} from "@/lib/nutrition";
import type { PlannedSession } from "@/lib/storage";

export const runtime = "edge";

const SYSTEM = `You write a tight TRAINING brief for one specific week. 45-65 words, 3 sentences max.

Required content:
1. THIS week's distinct purpose within the phase — not a generic phase summary. If you have a weekly_note for this week, lead with what makes IT different from the week before/after (volume bump, key-session swap, deload, specificity layer).
2. One concrete number that anchors it (target TSS, FTP %, duration of key session).
3. How it serves the bigger goal (phase end-target or race day).

Anti-patterns to avoid:
- Don't write a paragraph that could equally describe any week of the phase. If the brief would still be true 3 weeks from now, rewrite it.
- Don't just paraphrase the phase focus. The brief is for ONE week — be specific to it.

Style: Plain text. No markdown. No headers. No bullets. Direct, second-person ("you"). British spelling. No preamble.`;

const DAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const { weekKey, weekStartDate, phase, dailyTemplate, raceGoal, athleteNotes, synced } = body;

  if (!weekStartDate || !phase) {
    return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
  }

  const weekEnd = new Date(weekStartDate);
  weekEnd.setDate(weekEnd.getDate() + 6);

  // Derive 1-based week index within the phase so the model can write a
  // brief that's specific to this week (not a generic phase summary).
  const phaseStart = new Date(phase.start_date);
  const thisWeekStart = new Date(weekStartDate);
  const weekIndexInPhase =
    Math.floor(
      (thisWeekStart.getTime() - phaseStart.getTime()) / (7 * 86400000)
    ) + 1;
  const phaseWeeksTotal =
    (phase.weeks_to_end ?? 0) - (phase.weeks_from_start ?? 0) + 1;
  const weeklyNote: string | null = Array.isArray(phase.weekly_notes)
    ? (phase.weekly_notes[Math.max(0, weekIndexInPhase - 1)] ?? null)
    : null;

  const userPrompt = `Write the training brief for this week.

WEEK: ${weekStartDate} → ${weekEnd.toISOString().slice(0, 10)}
POSITION IN PHASE: week ${weekIndexInPhase} of ${phaseWeeksTotal}
PHASE: ${phase.name} (${phase.focus})  CTL target by phase end: ${phase.ctl_target_end ?? "n/a"}
PHASE PROGRESSION LOGIC: ${phase.progression_logic || "(not specified — infer from template)"}
THIS WEEK'S NOTE (load-bearing — lead with this): ${weeklyNote || "(not specified)"}
RACE: ${raceGoal?.name} (${raceGoal?.type}) on ${raceGoal?.date} ${raceGoal?.targetTime ? `· target ${raceGoal.targetTime}` : ""}

DAILY TEMPLATE:
${JSON.stringify(dailyTemplate, null, 2)}

ATHLETE STATE: ${synced ? `CTL ${synced.fitness?.ctl}, ATL ${synced.fitness?.atl}, TSB ${synced.fitness?.tsb}, ACWR ${synced.derived?.acwr}, FTP ${synced.athlete?.ftp}W` : "(not synced)"}

ATHLETE NOTES:
- weekly: ${athleteNotes?.weeklyPattern || "(none)"}
- disruptions: ${athleteNotes?.upcomingDisruptions || "(none)"}
- secondary: ${athleteNotes?.secondaryGoals || "(none)"}
- constraints: ${athleteNotes?.constraints || "(none)"}

Output the brief paragraph only.`;

  void weekKey;
  const client = new Anthropic({ apiKey });

  // Compute nutrition guide deterministically (no LLM cost, instant)
  const nutrition = computeWeeklyNutritionGuide({
    dailyTemplate,
    weight: synced?.athlete?.weight ?? null,
    athleteNotes,
  });

  try {
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      system: SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
    });
    const text = res.content.find((c) => c.type === "text");
    if (!text || text.type !== "text") {
      return NextResponse.json({ ok: false, error: "No text in response" }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      brief: text.text.trim(),
      nutrition,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Network error" },
      { status: 500 }
    );
  }
}

type WeeklyNutritionGuide = {
  hardDays: number;
  easyDays: number;
  avgKcal: number | null;
  hardDayKcal: number | null;
  easyDayKcal: number | null;
  proteinG: number | null;
  fatG: number | null;
  goalMode: "cut" | "maintain" | "gain" | null;
  fuelingNote: string;
};

function computeWeeklyNutritionGuide(opts: {
  dailyTemplate: Record<string, PlannedSession[]> | undefined;
  weight: number | null;
  athleteNotes?: {
    secondaryGoals?: string;
  };
}): WeeklyNutritionGuide {
  const { dailyTemplate, weight, athleteNotes } = opts;
  if (!dailyTemplate || !weight) {
    return {
      hardDays: 0,
      easyDays: 0,
      avgKcal: null,
      hardDayKcal: null,
      easyDayKcal: null,
      proteinG: null,
      fatG: null,
      goalMode: null,
      fuelingNote: "Sync athlete data to see fuelling targets.",
    };
  }

  const dailyTargets: NutritionTargets[] = [];
  for (const day of DAY_KEYS) {
    const sessions = dailyTemplate[day] || [];
    const t = computeNutritionTargets({
      weightKg: weight,
      todaysSessions: sessions,
      athleteNotes,
    });
    if (t) dailyTargets.push(t);
  }

  if (dailyTargets.length === 0) {
    return {
      hardDays: 0,
      easyDays: 0,
      avgKcal: null,
      hardDayKcal: null,
      easyDayKcal: null,
      proteinG: null,
      fatG: null,
      goalMode: null,
      fuelingNote: "No sessions planned this week.",
    };
  }

  const hardDays = dailyTargets.filter((t) => t.isHardDay).length;
  const easyDays = dailyTargets.length - hardDays;
  const avgKcal = Math.round(
    dailyTargets.reduce((s, t) => s + t.kcal, 0) / dailyTargets.length
  );
  const hardKcals = dailyTargets.filter((t) => t.isHardDay).map((t) => t.kcal);
  const easyKcals = dailyTargets.filter((t) => !t.isHardDay).map((t) => t.kcal);
  const hardDayKcal =
    hardKcals.length > 0
      ? Math.round(hardKcals.reduce((a, b) => a + b, 0) / hardKcals.length)
      : null;
  const easyDayKcal =
    easyKcals.length > 0
      ? Math.round(easyKcals.reduce((a, b) => a + b, 0) / easyKcals.length)
      : null;

  const proteinG = dailyTargets[0].proteinG;
  const fatG = dailyTargets[0].fatG;
  const goalMode = dailyTargets[0].goalMode;

  const fuelingNote =
    hardDays > 0
      ? "Top up carbs the night before hard days. Aim 60-90g carbs/hour on long sessions and refuel within 30 minutes after."
      : "Steady eating window — protein at every meal, carbs around movement, fat to satisfy.";

  return {
    hardDays,
    easyDays,
    avgKcal,
    hardDayKcal,
    easyDayKcal,
    proteinG,
    fatG,
    goalMode,
    fuelingNote,
  };
}
