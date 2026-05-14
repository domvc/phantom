import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "edge";

const SYSTEM = `You are an expert endurance coach producing a SINGLE workout in detail. Stream a structured markdown response — no surrounding prose, no code fences except where indicated.

You receive:
- The session (slot, type, title, summary, duration, sport)
- The day and date this session falls on
- Current phase context (name, focus, ctl_target_end, week within phase)
- Athlete's current numbers (FTP, LTHR, weight, CTL, ATL, TSB, ACWR)
- Athlete notes (life context — respect them)

Output EXACTLY this format with these section markers (markers must appear verbatim — no extra colons, no skipped sections):

---TITLE---
<the session title>
---DURATION---
<concrete e.g. '75 minutes total'>
---WARMUP---
<specific warmup, multi-line allowed>
---MAIN---
<specific main set with intervals, watts/HR/pace targets, multi-line>
---COOLDOWN---
<specific cooldown>
---PRIMARY---
<key target e.g. 'Avg power 180-200W' or 'Easy Z2 throughout'>
---HR---
<HR range or ceiling>
---RPE---
<perceived exertion 1-10>
---FUELING---
<short fueling note>
---SUCCESS---
<one sentence describing what 'a good session' looks like>
---RATIONALE---
<2-3 sentences: why THIS specific session, RIGHT NOW, for THIS athlete. Cite numbers (CTL, ACWR, phase). Tie to wider plan trajectory. Reference the session's SPORT — if strength, talk about strength rationale; if bike, talk about bike rationale. Never describe a different sport than the session you were given.>
---GARMIN---
<plain text formatted for pasting into a Garmin/Wahoo workout note. Use minutes format like '5min @ 60% FTP' lines. Multi-line.>
---TRAININGPEAKS---
<TrainingPeaks-friendly structured workout text. Use their style: 'Warmup: 10 min Z1\\nMain: 2x20 min Z4 (5 min Z1 RI)\\nCooldown: 10 min Z1'.>
---END---

Style:
- Use the athlete's actual FTP/LTHR for power & HR targets when relevant.
- Use British spelling. Be specific, not generic.
- Rationale must reference REAL data points AND the actual session sport.
- For strength sessions: rationale must focus on strength (hypertrophy, durability, body comp), NOT on cardiovascular metrics primarily.
- For run sessions: rationale focuses on aerobic base, lactate threshold, durability, etc.
- For bike sessions: rationale focuses on power, FTP development, etc.
- Always emit ALL sections in order. Never skip.

WEEK-IN-PHASE PROGRESSION (load-bearing):
- The plan emits ONE weekly_template per phase, but you must NOT prescribe identical workouts across every week of a phase. Week 1 of 5 in Base is an introduction; week 5 of 5 is a meaningful step up; week 4 might be a deload.
- If you're told "week N of M" and given a "weekly emphasis" note, the warmup/main/cooldown structure, set counts, and durations must reflect WHERE in the phase this week sits:
  • Early weeks: shorter main sets, slightly easier targets, longer warmups to bed in technique.
  • Middle weeks: full prescription, hardest sets within the phase's intent.
  • Final week before next phase: either consolidation OR mild deload — read the weekly emphasis note.
- Volume progression rule of thumb: each non-deload week within a phase adds 5-10% to the main-set time or rep count vs the previous week. Quote the volume difference in the rationale ("This is week 3 of 5 — main set is 30% longer than week 1 to build the aerobic time-at-threshold base").
- If the weekly emphasis note says "deload" or "consolidation", CUT main-set volume by 25-35% and keep intensity at the lower end of the prescription. Call this out explicitly in the rationale.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      "data: " + JSON.stringify({ error: "Missing ANTHROPIC_API_KEY" }) + "\n\ndata: [DONE]\n\n",
      { headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { session, day, date, phase, synced, athleteNotes } = body;

  if (!session) {
    return new Response(JSON.stringify({ error: "No session provided" }), { status: 400 });
  }

  // Compute week-in-phase from the session date + phase.start_date so the
  // detailed prescription can progressively load (wk 3 of 5 should be harder
  // than wk 1 of 5 even when the weekly_template is identical).
  let weekInPhase: number | null = null;
  let phaseWeeksTotal: number | null = null;
  let weeklyNote: string | null = null;
  if (phase && phase.start_date && date) {
    const phaseStart = new Date(phase.start_date);
    const sessionDate = new Date(date);
    weekInPhase = Math.floor(
      (sessionDate.getTime() - phaseStart.getTime()) / (7 * 86400000)
    ) + 1;
    phaseWeeksTotal =
      (phase.weeks_to_end ?? 0) - (phase.weeks_from_start ?? 0) + 1;
    if (Array.isArray(phase.weekly_notes)) {
      weeklyNote = phase.weekly_notes[Math.max(0, weekInPhase - 1)] ?? null;
    }
  }

  const userPrompt = `Generate the workout in detail for THIS specific session (note the sport — your rationale must match it).

DAY: ${day || ""} ${date ? `(${date})` : ""}
POSITION IN PHASE: ${weekInPhase != null && phaseWeeksTotal != null ? `week ${weekInPhase} of ${phaseWeeksTotal}` : "(unknown)"}
THIS WEEK'S EMPHASIS (load-bearing — adjust volume/intensity to match): ${weeklyNote || "(not specified — infer from phase progression)"}

SESSION (output rationale must reference THIS session, not any other):
${JSON.stringify(session, null, 2)}

CURRENT PHASE:
${phase ? JSON.stringify(phase, null, 2) : "(no phase context)"}

ATHLETE FITNESS:
${
  synced
    ? JSON.stringify(
        {
          athlete: synced.athlete,
          fitness: synced.fitness,
          derived: synced.derived,
          wkg: synced.wkg,
        },
        null,
        2
      )
    : "(not synced)"
}

ATHLETE NOTES:
${
  athleteNotes && Object.values(athleteNotes).some((v) => v)
    ? `Weekly pattern: ${athleteNotes.weeklyPattern || "(none)"}
Upcoming disruptions: ${athleteNotes.upcomingDisruptions || "(none)"}
Secondary goals: ${athleteNotes.secondaryGoals || "(none)"}
Constraints: ${athleteNotes.constraints || "(none)"}`
    : "(none)"
}

Stream the structured response now using the section markers.`;

  const client = new Anthropic({ apiKey });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const anthStream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 2500,
          system: SYSTEM,
          messages: [{ role: "user", content: userPrompt }],
        });

        for await (const event of anthStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
            );
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`)
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
