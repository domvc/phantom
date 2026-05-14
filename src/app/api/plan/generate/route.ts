import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "edge";

const PLAN_SYSTEM = `You are a senior endurance coach generating a phased training plan. Output VALID JSON ONLY — no prose, no markdown.

OUTPUT IS LATENCY-CRITICAL. Be terse. Every extra word costs the athlete time on the loading screen. Do not repeat yourself across sessions or phases.

Schema:

{
  "total_weeks": <int>,
  "phases": [
    {
      "name": "<2-3 words, e.g. 'Base 1', 'Build', 'Peak', 'Taper'>",
      "weeks_from_start": <int>,
      "weeks_to_end": <int>,
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD",
      "focus": "<≤8 words>",
      "ctl_target_end": <int or null>,
      "weekly_template": {
        "monday": [<session>], "tuesday": [<session>], "wednesday": [<session>],
        "thursday": [<session>], "friday": [<session>],
        "saturday": [<session>], "sunday": [<session>]
      },
      "progression_logic": "<one sentence, ≤30 words, describing how this phase progresses week-by-week — what shifts in volume / intensity / specificity from week 1 to the final week>",
      "weekly_notes": ["<wk1 note ≤15 words>", "<wk2 note>", ..., "<wkN note>"]
    }
  ],
  "milestones": [
    { "date": "YYYY-MM-DD", "title": "<≤4 words>", "desc": "<≤10 words>",
      "type": "test"|"ramp_up"|"race"|"checkpoint"|"phase_end" }
  ]
}

Session object — keep ALL fields short:
{
  "slot": "AM"|"PM"|"OPTIONAL"|"REST",
  "type": "rest"|"easy"|"hard"|"tempo"|"key"|"long"|"strength"|"swim"|"brick"|"test",
  "title": "<≤3 words, e.g. 'Z2 Ride', 'VO2 Intervals'>",
  "duration": "<e.g. '60min', '90-120min'>",
  "summary": "<≤12 words, what + intensity + targets only>",
  "sport": "bike"|"run"|"swim"|"strength"|"brick"|"rest"
}

(Structured intervals for export/.pwx are generated on-demand by a separate endpoint — DO NOT emit intervals here.)

Hard rules:
1. Each day is an array. Rest day: [{"slot":"REST","type":"rest","title":"Rest","duration":"—","summary":"Rest. Sleep 8h+.","sport":"rest"}].
2. AM and PM are SEPARATE entries. Never combine.
3. Phases cover today → race date with NO gaps. Sum of (weeks_to_end - weeks_from_start + 1) = total_weeks.
4. End with a 1–2 week taper phase ending on race date.
5. Phase count: 3-5 for plans <16 weeks, 5-7 for longer.
6. Standard progression: Base → Build → Peak → Taper. If ACWR <0.7, front-load Rebuild.
7. Respect athlete's weekly pattern (training days, AM/PM availability). 5-day pattern → 2 REST days.
8. Athlete notes are load-bearing — holidays, secondary goals, constraints all shape templates.
9. 4-6 milestones: phase ends, key tests, race simulation 4 weeks out, race day. Race day mandatory and last.
10. CTL ramp ≤ 5/week.

Within-phase progression — NON-NEGOTIABLE (the calendar will surface this):
11. NEVER emit a phase whose weeks all look identical. The weekly_template is a shape; weekly_notes carries the week-by-week change. A 5-week phase with weekly_notes = ["wk1: introduce", "wk1: introduce", ...] is rejected.
12. The session "duration" field is the primary lever for in-phase volume progression. Use ranges that ramp across weeks ("60-75min" wk1, "75-90min" wk3, "90-105min" wk4 deload). Pick durations that imply ≤10% week-over-week increase, NOT a flat number across 5 weeks.
13. Within a phase of N weeks, include at least ONE distinct intra-phase progression: a key session intensity bump in the middle weeks, a deload (cut volume ~25%) every 3-4 weeks, or a specificity layer added in the final weeks.
14. weekly_notes[i] is mandatory for every week of every phase. Be specific: "wk3: +1 Z3 tempo block on Tue, long ride extends to 2h" not "wk3: continued aerobic build". Generic notes are rejected.
15. progression_logic is mandatory per phase. Explain the structural arc: what gets added, what gets dropped, when the deload falls.

Output ONLY the JSON object.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Server missing ANTHROPIC_API_KEY" },
      { status: 500 }
    );
  }

  const reqBody = await req.json().catch(() => ({}));
  const {
    synced,
    raceGoal,
    races: racesIn,
    trainingPrefs,
    athleteNotes,
    amendments,
    sessionFeedbacks,
  } = reqBody;

  if (!raceGoal?.date) {
    return NextResponse.json({ ok: false, error: "No race goal set" }, { status: 400 });
  }

  const today = new Date();
  const race = new Date(raceGoal.date);
  const totalDays = Math.ceil((race.getTime() - today.getTime()) / 86400000);
  const totalWeeks = Math.max(1, Math.ceil(totalDays / 7));

  if (totalDays < 7) {
    return NextResponse.json(
      { ok: false, error: "Race is less than a week away — no plan to generate" },
      { status: 400 }
    );
  }

  // races[] is the source of truth, but back-compat: build it from raceGoal if absent
  type IncomingRace = {
    id?: string;
    name: string;
    type: string;
    date: string;
    targetTime?: string;
    priority?: "A" | "B" | "C";
    raceDetails?: string;
  };
  const races: IncomingRace[] = Array.isArray(racesIn) && racesIn.length > 0
    ? racesIn
    : [{ ...raceGoal, priority: "A" as const }];
  const todayIso = today.toISOString().slice(0, 10);
  const upcomingRaces = races
    .filter((r) => r.date && r.date >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date));
  const secondaryRaces = upcomingRaces.filter((r) => r.date !== raceGoal.date);

  const userPrompt = `Generate the training plan now.

TODAY: ${todayIso}
WEEKS TO PRIMARY A-RACE: ${totalWeeks}

PRIMARY A-RACE (the plan anchors here):
${JSON.stringify(raceGoal, null, 2)}
${
  raceGoal.type === "Ultra"
    ? `
ULTRA-SPECIFIC GUIDANCE:
- Ultras are NOT marathons stretched out. Time-on-feet beats top-end intensity.
- Backyard formats (loops every hour, last person standing) demand pacing discipline, fuelling rhythm, mental rehearsal of the loop format. Long sessions should simulate cumulative time-on-feet across consecutive days, not single mega-runs.
- Distance ultras (50K-100mi) need progressive long runs, back-to-back weekends, hike-walk-run pacing, and night-running rehearsal where applicable.
- Read the raceDetails field above carefully — it tells you the format. Build the plan around it, not around generic ultra advice.
- Strength/mobility is non-negotiable for ultras: posterior chain, hip stability, foot strength.`
    : ""
}

SECONDARY RACES (B/C — must be respected in the plan):
${
  secondaryRaces.length === 0
    ? "(none — single A-race plan)"
    : secondaryRaces
        .map(
          (r) =>
            `- ${r.priority ?? "A"}-race · ${r.name} · ${r.type} · ${r.date}${r.targetTime ? ` · target ${r.targetTime}` : ""}${r.raceDetails ? ` · ${r.raceDetails}` : ""}`
        )
        .join("\n")
}

A/B/C RACE HANDLING (load-bearing — periodisation lives here):
- A-RACE: full taper (1-2 week reduced volume, intensity maintained), full peak phase before. Plan anchors to its date. Race day milestone is mandatory and last.
- B-RACE: 3-5 day mini-taper (no full week off), then a 4-7 day recovery week after. Phase structure must accommodate: build INTO the B-race, mini-peak, B-race day, recovery, then resume build toward the A-race. Treat the B-race itself as a milestone (type: "race"). Do NOT abandon the A-race trajectory — recovery should be brief.
- C-RACE: NO taper, NO recovery week. Treated as a race-pace simulation that REPLACES that day's planned quality session. Milestone type: "race" but flag in the desc as "fitness check / race-pace simulation". Surrounding week stays normal.
- If multiple B-races stack within 4 weeks: the closest one to the A-race gets the mini-taper; earlier B-races within that window are downgraded to C-race treatment automatically (mention this in your phase focus copy).
- Phases must respect race timing — e.g. you cannot be deep in a "build" phase 4 days before a B-race; insert a pre-B-race mini-taper phase if needed.
- If the secondary list is empty, ignore all of this and run a standard A-race-only plan.

TRAINING PREFERENCES (the athlete chose these — RESPECT THEM):
${
  trainingPrefs
    ? `Sports to include: ${(trainingPrefs.sports || []).join(", ") || "(none specified)"}
Bike access: ${trainingPrefs.hasBike === false ? "INDOOR/SPIN ONLY — no outdoor rides" : "Has a bike"}
Pool access: ${trainingPrefs.hasPool === false ? "LIMITED — favour open water or skip pool work" : "Regular pool"}
Conditioning emphasis: ${trainingPrefs.conditioningEmphasis || "moderate"}
Notes: ${trainingPrefs.notes || "(none)"}

HARD RULE: Only emit sessions whose sport is in the "Sports to include" list. If "swim" isn't included, the weekly_template must contain ZERO swim sessions. If "bike" isn't included, the weekly_template must contain ZERO bike sessions. Never emit sessions in sports the athlete didn't pick — even if the race type would normally require it (e.g. someone training for an Ironman who explicitly excludes swim is doing pool-skip prep, respect their call).
If conditioning emphasis is "high", schedule 2-3 strength/conditioning sessions per week. If "minimal", schedule 0-1. If "moderate", schedule 1-2.`
    : "(not captured — assume default sports for the race type)"
}

CURRENT FITNESS:
${synced ? JSON.stringify({ athlete: synced.athlete, fitness: synced.fitness, derived: synced.derived, wkg: synced.wkg }, null, 2) : "(not synced)"}

ATHLETE NOTES:
${
  athleteNotes && Object.values(athleteNotes).some((v) => v)
    ? `Weekly pattern: ${athleteNotes.weeklyPattern || "(none)"}
Upcoming disruptions: ${athleteNotes.upcomingDisruptions || "(none)"}
Secondary goals: ${athleteNotes.secondaryGoals || "(none)"}
Constraints: ${athleteNotes.constraints || "(none)"}`
    : "(none captured)"
}

PRIOR AMENDMENTS (apply ALL of these — they reflect commitments the athlete has made):
${
  Array.isArray(amendments) && amendments.length
    ? amendments
        .map(
          (a: { weekContext?: string; description: string; appliedAt: string }, i: number) =>
            `${i + 1}. [${a.appliedAt.slice(0, 10)}${a.weekContext ? ` · ${a.weekContext}` : ""}] ${a.description}`
        )
        .join("\n")
    : "(none — first generation)"
}

CRITICAL — distinguishing amendment intent:

A) STRUCTURAL amendments (keywords: "remove", "drop", "no more", "stop", "swap X for Y", "replace X with Y", "until", "for the next N weeks", "permanently", "no swims", "no running"):
   - These change the WEEKLY TEMPLATE itself across affected weeks.
   - If the athlete says "remove all swims" or "swap swims for strength until September", the weekly_template for every affected week MUST contain ZERO sessions of the removed sport. Do NOT keep them and try to "recuperate" them.
   - If the athlete says "swap X for Y", emit Y in the slot where X used to live — sport, type, title, sport must all reflect Y. Do NOT leave a session whose title mentions X or whose sport is X.
   - Honour the duration if specified ("for 6 weeks", "until X date"). After the duration ends, the template can return to its original shape.
   - It is acceptable, even required, to drop work entirely when the athlete explicitly asks to remove it.

B) DISPLACEMENT amendments (keywords: "this Saturday", "Wednesday this week", "wedding on the 12th", "travelling next week"):
   - One-off life events affecting a single week. Move displaced quality into adjacent weeks where capacity exists.

If unsure which type an amendment is, treat removal language as STRUCTURAL. Re-read every amendment against this rule before emitting weekly_templates. The athlete's word is final — never re-introduce a session category they have asked to remove.

RECENT SESSION FEEDBACK FROM ATHLETE (use this to calibrate intensity, identify struggles, double down on what's working):
${
  Array.isArray(sessionFeedbacks) && sessionFeedbacks.length
    ? sessionFeedbacks
        .slice(-8)
        .map(
          (f: { activityName: string; activityDate: string; feedback: string }) =>
            `[${f.activityDate} · ${f.activityName}] ${f.feedback}`
        )
        .join("\n")
    : "(none yet)"
}

Output JSON now.`;

  const client = new Anthropic({ apiKey });

  // Stream raw model tokens directly to the client. Client parses the JSON
  // and constructs the plan envelope locally. This avoids Netlify's edge
  // response buffering, which silently drops the trailing flush when we
  // try to send a single large JSON body at the end.
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      // Initial flush so headers go out immediately
      controller.enqueue(encoder.encode("\n"));

      try {
        const stream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 12000,
          system: PLAN_SYSTEM,
          messages: [{ role: "user", content: userPrompt }],
        });

        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Network error";
        controller.enqueue(encoder.encode("\n__STREAM_ERROR__:" + msg));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
