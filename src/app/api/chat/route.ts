import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { computeNutritionTargets, parseBodyCompGoal } from "@/lib/nutrition";
import { normalizeDay } from "@/lib/storage";
import type {
  AthleteNotes,
  BodyMeasurement,
  PlannedSession,
  PlanPhase,
} from "@/lib/storage";

export const runtime = "edge";

const DAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const SYSTEM_PROMPT = `You are the endurance coach inside MyGOAT. You speak directly to the athlete using their real training data. You are a complete performance coach: training, fuelling, body composition, and recovery all sit inside your lane.

Voice (load-bearing):
- Declarative, never exploratory. "This is the call" beats "we think this might".
- Hard nouns over soft verbs. Use data, watts, minutes, reps, protocols. Never use "journey", "support", "help you on", or wellness language.
- Cause and effect framing. "X produces Y" beats hedging.
- Never call yourself an AI or a chatbot. You are a coach.
- Anchor every recommendation to the athlete's actual numbers (CTL, ATL, TSB, ACWR, FTP, weight, recent activities, daily kcal/macro targets). If a number is null, say so — never invent values.
- British spelling. Tight by default. Expand only when the athlete asks for detail.
- No filler ("Great question", "Let me think", "I hope this helps"). No emoji. No exclamation marks.
- NEVER disclaim scope ("I'm a training coach, not a nutritionist", "outside my lane", "consult a professional"). MyGOAT covers training, fuelling, recovery, body comp, and pacing. If you have the data to answer, answer.

When asked for a session, output:
1. GO / MODIFY / SKIP with priority
2. Specific session: sport, duration, zone targets (HR or watts)
3. One-line rationale tied to data

When asked about FUELLING / NUTRITION (in scope — answer directly):
- You have the athlete's weight, today's planned sessions, weekly TSS load, body comp goals (from secondary goals), and computed kcal/macro targets in the data block.
- Give specific numbers: total carbs (g), protein (g per meal), kcal range, fluid (L), sodium (mg) where relevant. Anchor to body weight (e.g. "1.6 g/kg protein → 115g/day at your 72kg").
- Pre-event: carb load magnitudes ("8-10 g/kg in the 24h before a 100km Z2 ride"), meal timing, sleep nutrition.
- During session: carb intake rate (g/hr by intensity and duration — 30-60 g/hr Z2, 60-90 g/hr above tempo, 90-120 g/hr for events >2h).
- Recovery: protein within 30min post (0.3-0.4 g/kg), carb replenishment by session TSS.
- Body composition: tie to secondary goals + recent body measurements. Be specific about deficit/surplus magnitudes and how to fuel hard days even in a deficit.
- Meal evaluation: if the athlete asks "is X a good choice tonight?" — say yes/no/adjust with the macro reasoning. Don't refuse.
- Only redirect to a registered dietitian when the question involves clinical conditions (diabetes management, eating disorders, kidney disease, severe allergies). Everyday fuelling is yours.

Reference framework:
- ACWR <0.8 = undertrained, 0.8–1.3 = optimal, >1.3 = injury risk.
- TSB > +5 fresh, < -25 fatigued.
- Polarised TID target: ≥80% Z1/Z2, <15% grey-zone Z3.
- Phase definitions: Base (CTL flat/slight rise), Build (CTL rising, ACWR 0.9–1.1), Peak (ACWR 1.0–1.2), Taper (volume −30–50%, intensity maintained).
- Fuelling defaults (override with computed targets when given): protein 1.6-2.0 g/kg; carbs 3-5 g/kg easy days, 6-8 g/kg hard days, 8-10 g/kg event prep; fat 0.8-1.2 g/kg; cap deficit at -500 kcal on hard days, -300 on easy.

TOOL USE — TWO TOOLS AVAILABLE:

1. update_athlete_notes — for saving NEW life context shared by the athlete (holidays, injuries, secondary goals, schedule changes). Examples:
   - "I'm in Lisbon Aug 15–22" → save to upcomingDisruptions
   - "My calf is sore — keep volume low for a week" → save to constraints
   - "I can't train Wed evenings any more" → save to weeklyPattern

   Don't call this tool when answering questions or making recommendations.

2. apply_plan_amendment — for ACTUAL plan changes. CALL THIS aggressively for any structural request. Examples that ALWAYS warrant the tool:
   - "Swap all swims for [strength/cycling/running] until [date]"
   - "Replace Tuesday's quality session with an easy run"
   - "Move my long ride from Sat to Sun"
   - "Add an FTP test in week X"
   - "Drop volume by 20% next week — work travel"
   - "Take it easy this week"
   - "Cut all running for 2 weeks — knee pain"
   - "Front-load the next phase with more strength"

   Process:
   a. Detect plan-change request — be liberal. Anything that changes the prescribed schedule across days/weeks is a plan change.
   b. Propose specific changes with rationale tying to phase goals (which sessions move/swap/drop/replace, AND where displaced stimulus is recuperated).
   c. Confirm understanding with the athlete in 1-2 sentences. If the request is unambiguous and fully scoped (e.g. "swap all swims for cycling until September"), you MAY proceed straight to the tool call — no need to ask "are you sure" repeatedly. If ambiguous, ask 1 short clarifying question first.
   d. Call apply_plan_amendment with a complete, specific description: dates affected, every session that moves/swaps/drops/replaces, and explicit recuperation strategy.
   e. After calling, tell the athlete the amendment is QUEUED and will apply on their next regeneration — they need to click Regenerate on the dashboard. You CANNOT regenerate the plan yourself.

   DO NOT call apply_plan_amendment for hypothetical questions ("what if I moved...?") or info-only requests ("how does my plan look?"). Only when the athlete is REQUESTING a change.

CAPABILITIES YOU DO NOT HAVE — be honest about these:
- You cannot regenerate the training plan. Calling apply_plan_amendment QUEUES the change; the athlete must click Regenerate on the dashboard to rebuild the plan with all queued amendments.
- You cannot edit the race goal (date, type, target time). If the athlete tells you their race date has changed (e.g. "my race is actually on 18 October"), tell them to update it in Settings → Race goal, then click Regenerate. Do NOT save race date changes via update_athlete_notes — the notes tool is for life context, not race configuration.
- You cannot trigger a sync. If they say activities are missing, point them at the Sync data button.
- Never claim you "tried to" or "hit an error" doing something you don't have a tool for. If you can't do it, say so plainly.

After calling either tool, briefly acknowledge in your text what was saved/queued. Be precise about what happens next.

Today's date will be provided. Always reason from the most recent data available.`;

const NOTE_TOOL = {
  name: "update_athlete_notes",
  description:
    "Save NEW factual life context the athlete shares (holidays, injuries, schedule changes, secondary goals, constraints) to their persistent athlete notes. Only call when the athlete is telling you something new about themselves.",
  input_schema: {
    type: "object" as const,
    properties: {
      field: {
        type: "string",
        enum: ["weeklyPattern", "upcomingDisruptions", "secondaryGoals", "constraints"],
        description:
          "weeklyPattern: when they can/can't train. upcomingDisruptions: holidays, travel, busy periods. secondaryGoals: body comp, strength, additional events. constraints: injuries, niggles, hard limits.",
      },
      mode: {
        type: "string",
        enum: ["append", "replace"],
        description: "append adds to existing field (preferred). replace overwrites — use only when the athlete is explicitly correcting prior info.",
      },
      content: {
        type: "string",
        description: "The text to save. Be concise but capture the specifics (dates, durations, conditions).",
      },
    },
    required: ["field", "mode", "content"],
  },
};

const AMEND_PLAN_TOOL = {
  name: "apply_plan_amendment",
  description:
    "Persist a plan amendment AFTER the athlete has explicitly confirmed your proposed changes. Triggers a full plan regeneration. Use when the athlete is asking for substantive plan changes (skip a week, swap sessions, alter phase structure, replace workouts).",
  input_schema: {
    type: "object" as const,
    properties: {
      description: {
        type: "string",
        description:
          "Complete instruction set for the plan regenerator. Include all dates affected, every session that moves/swaps/drops/replaces, and explicit recuperation strategy for displaced quality work. Be specific.",
      },
    },
    required: ["description"],
  },
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      "data: " +
        JSON.stringify({ text: "⚠️ Server missing ANTHROPIC_API_KEY" }) +
        "\n\ndata: [DONE]\n\n",
      { headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const {
    messages,
    synced,
    raceGoal,
    athleteNotes,
    plan,
    bodyMeasurements,
    effectiveWeightKg,
  } = body as {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: any[];
    // synced is the full SyncedData shape — kept loose here to match the
    // dataBlock JSON.stringify below (which doesn't need a narrow type).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    synced?: any;
    raceGoal?: unknown;
    athleteNotes?: AthleteNotes;
    plan?: { phases?: PlanPhase[]; [k: string]: unknown };
    bodyMeasurements?: BodyMeasurement[];
    effectiveWeightKg?: number | null;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: "no messages" }), { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);

  const liveData = synced
    ? {
        athlete: synced.athlete,
        fitness: synced.fitness,
        derived: synced.derived,
        wkg: synced.wkg,
        readiness: synced.readiness,
        recent_activities: synced.recent_activities?.slice(0, 8),
        daily_summary: synced.daily_90d?.length
          ? {
              first: synced.daily_90d[0],
              last: synced.daily_90d[synced.daily_90d.length - 1],
              days_count: synced.daily_90d.length,
            }
          : null,
      }
    : null;

  const dataBlock = liveData
    ? `=== LIVE TRAINING DATA (today: ${today}) ===\n\n${JSON.stringify(liveData, null, 2)}`
    : `No training data synced yet — ask the athlete to hit "Sync data" in the sidebar.`;

  const raceBlock = raceGoal
    ? `=== RACE GOAL ===\n\n${JSON.stringify(raceGoal, null, 2)}`
    : `No race goal set yet.`;

  const notesBlock =
    athleteNotes && Object.values(athleteNotes).some((v) => v)
      ? `=== ATHLETE NOTES (life context — respect these in every recommendation) ===

Weekly pattern:
${athleteNotes.weeklyPattern || "(not specified)"}

Upcoming disruptions / holidays / travel:
${athleteNotes.upcomingDisruptions || "(none specified)"}

Secondary goals (body comp, strength, etc.):
${athleteNotes.secondaryGoals || "(none specified)"}

Constraints / things to avoid:
${athleteNotes.constraints || "(none specified)"}`
      : `=== ATHLETE NOTES ===\n\nNo nuance captured yet.`;

  const planBlock = plan
    ? `=== TRAINING PLAN (current phase priorities — respect when answering session questions) ===\n\n${JSON.stringify(
        {
          generated_at: plan.generated_at,
          phases: plan.phases?.map((p: { name: string; start_date: string; end_date: string; focus: string; ctl_target_end?: number | null }) => ({
            name: p.name,
            start_date: p.start_date,
            end_date: p.end_date,
            focus: p.focus,
            ctl_target_end: p.ctl_target_end,
          })),
          rationale: plan.rationale,
        },
        null,
        2
      )}`
    : `=== TRAINING PLAN ===\n\nNo plan generated yet. The athlete can hit "Generate Plan" on the dashboard.`;

  // --- Nutrition context block (in scope, computed deterministically) ---
  const weight = effectiveWeightKg ?? synced?.athlete?.weight ?? null;
  let todaysSessions: PlannedSession[] = [];
  let tomorrowsSessions: PlannedSession[] = [];
  if (plan?.phases?.length) {
    const todayDate = new Date(today + "T00:00:00");
    const tomorrowDate = new Date(todayDate.getTime() + 86400000);
    const phaseFor = (d: Date) => {
      for (const p of plan.phases ?? []) {
        const s = new Date(p.start_date);
        const e = new Date(p.end_date);
        e.setHours(23, 59, 59, 999);
        if (d >= s && d <= e) return p;
      }
      return null;
    };
    const dayKeyOf = (d: Date) => DAY_KEYS[(d.getDay() + 6) % 7];
    const todayPhase = phaseFor(todayDate);
    const tomorrowPhase = phaseFor(tomorrowDate);
    todaysSessions = todayPhase
      ? normalizeDay(todayPhase.weekly_template[dayKeyOf(todayDate)])
      : [];
    tomorrowsSessions = tomorrowPhase
      ? normalizeDay(tomorrowPhase.weekly_template[dayKeyOf(tomorrowDate)])
      : [];
  }
  const todaysTargets = weight
    ? computeNutritionTargets({
        weightKg: weight,
        todaysSessions,
        athleteNotes,
      })
    : null;
  const tomorrowsTargets = weight
    ? computeNutritionTargets({
        weightKg: weight,
        todaysSessions: tomorrowsSessions,
        athleteNotes,
      })
    : null;
  const bodyCompGoal = parseBodyCompGoal(athleteNotes);
  const latestMeasurement = Array.isArray(bodyMeasurements)
    ? [...bodyMeasurements]
        .sort((a, b) => b.date.localeCompare(a.date))
        .find((m) => m.weightKg != null || m.bodyFatPct != null) ?? null
    : null;

  const nutritionBlock = `=== NUTRITION & BODY COMPOSITION (IN SCOPE — answer fuelling questions directly) ===

Effective athlete weight: ${weight != null ? `${weight} kg` : "(not known)"}
Latest body log: ${
    latestMeasurement
      ? `${latestMeasurement.date}${latestMeasurement.weightKg != null ? ` · ${latestMeasurement.weightKg}kg` : ""}${latestMeasurement.bodyFatPct != null ? ` · ${latestMeasurement.bodyFatPct}% BF` : ""}${latestMeasurement.note ? ` · ${latestMeasurement.note}` : ""}`
      : "(none logged yet)"
  }
Body comp goal (parsed from secondary goals): ${
    bodyCompGoal
      ? `${bodyCompGoal.metric} → ${bodyCompGoal.target}${bodyCompGoal.metric === "bodyFat" ? "%" : "kg"}${bodyCompGoal.targetDate ? ` by ${bodyCompGoal.targetDate}` : ""}`
      : "(none — fuel for performance)"
  }

Today (${today}) fuelling targets:
${
    todaysTargets
      ? `- kcal: ${todaysTargets.kcal} (${todaysTargets.isHardDay ? "HARD day" : "easy day"}, goal mode: ${todaysTargets.goalMode})
- protein: ${todaysTargets.proteinG}g  ·  carbs: ${todaysTargets.carbsG}g  ·  fat: ${todaysTargets.fatG}g
- planned sessions: ${todaysSessions.filter((s) => s.type !== "rest").map((s) => s.title).join(", ") || "rest"}`
      : "(need weight + plan to compute)"
  }

Tomorrow fuelling targets:
${
    tomorrowsTargets
      ? `- kcal: ${tomorrowsTargets.kcal} (${tomorrowsTargets.isHardDay ? "HARD day" : "easy day"})
- protein: ${tomorrowsTargets.proteinG}g  ·  carbs: ${tomorrowsTargets.carbsG}g  ·  fat: ${tomorrowsTargets.fatG}g
- planned sessions: ${tomorrowsSessions.filter((s) => s.type !== "rest").map((s) => s.title).join(", ") || "rest"}`
      : "(need weight + plan to compute)"
  }

Use these numbers when the athlete asks about meals, pre-event carb loading, recovery nutrition, or body composition. Quote the actual gram/kcal figures. Don't refuse the question.`;

  const client = new Anthropic({ apiKey });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const anthStream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 1500,
          tools: [NOTE_TOOL, AMEND_PLAN_TOOL],
          system: [
            { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
            {
              type: "text",
              text: `${dataBlock}\n\n${raceBlock}\n\n${notesBlock}\n\n${planBlock}\n\n${nutritionBlock}`,
            },
          ],
          messages,
        });

        // Tool-use accumulator: built up via input_json_delta events
        const toolBuffers: Record<number, { name: string; jsonStr: string }> = {};

        for await (const event of anthStream) {
          if (event.type === "content_block_start") {
            if (event.content_block.type === "tool_use") {
              toolBuffers[event.index] = {
                name: event.content_block.name,
                jsonStr: "",
              };
            }
          } else if (event.type === "content_block_delta") {
            if (event.delta.type === "text_delta") {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
              );
            } else if (event.delta.type === "input_json_delta") {
              const buf = toolBuffers[event.index];
              if (buf) buf.jsonStr += event.delta.partial_json;
            }
          } else if (event.type === "content_block_stop") {
            const buf = toolBuffers[event.index];
            if (buf) {
              try {
                const input = JSON.parse(buf.jsonStr);
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      toolUse: { name: buf.name, input },
                    })}\n\n`
                  )
                );
              } catch {
                // bad JSON — skip
              }
              delete toolBuffers[event.index];
            }
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ text: `⚠️ ${msg}` })}\n\n`)
        );
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
