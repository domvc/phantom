import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "edge";

const PLAN_SYSTEM = `You are a senior endurance coach generating a phased training plan for an athlete. Output VALID JSON ONLY — no surrounding prose, no markdown fencing.

You receive:
- Race goal (type, date, target time)
- Current fitness state (CTL, ATL, FTP, weight)
- Athlete notes (weekly pattern, holidays, secondary goals, constraints)
- Today's date

You output a structured plan with this schema:

{
  "total_weeks": <integer — weeks from today to race>,
  "phases": [
    {
      "name": "<short phase name>",
      "weeks_from_start": <integer — first week of phase>,
      "weeks_to_end": <integer — last week of phase>,
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD",
      "focus": "<one-sentence focus>",
      "ctl_target_end": <integer or null>,
      "weekly_template": {
        "monday":    [<session objects>],
        "tuesday":   [<session objects>],
        "wednesday": [<session objects>],
        "thursday":  [<session objects>],
        "friday":    [<session objects>],
        "saturday":  [<session objects>],
        "sunday":    [<session objects>]
      }
    }
  ],
  "milestones": [
    {
      "date": "YYYY-MM-DD",
      "title": "<short>",
      "desc": "<one-line>",
      "type": "test" | "ramp_up" | "race" | "checkpoint" | "phase_end"
    }
  ],
  "rationale": "<2-3 sentences: why these phases, how athlete notes shaped the plan>"
}

A session object looks like:
{
  "slot":     "AM" | "PM" | "OPTIONAL" | "REST",
  "type":     "rest" | "easy" | "hard" | "tempo" | "key" | "long" | "strength" | "swim" | "brick" | "test",
  "title":    "<2-4 word label e.g. 'Z2 Ride', 'Long Run', 'VO2 Intervals', 'Strength · Lower'>",
  "duration": "<e.g. '60 min', '90-120 min'>",
  "summary":  "<single sentence — what + intensity + key targets, e.g. 'Zwift Z2 ride, 147-168W, HR <148bpm'>",
  "sport":    "bike" | "run" | "swim" | "strength" | "brick" | "rest"
}

CRITICAL RULES for daily session arrays:
1. Each day MUST be an array. A rest day is [{ "slot": "REST", "type": "rest", "title": "Rest", "duration": "—", "summary": "Mandatory rest. Sleep 8h+.", "sport": "rest" }].
2. AM and PM sessions are SEPARATE entries. NEVER combine "Strength + Bike" into one entry — emit two objects.
3. A typical hard day with morning intervals + evening strength is two entries: AM key bike + PM strength.
4. Use "OPTIONAL" slot for sessions the athlete can drop based on feel.
5. Order entries chronologically (AM before PM).

Plan-level rules:
1. Phases must cover today → race date with no gaps. Sum of (weeks_to_end - weeks_from_start + 1) across phases = total_weeks.
2. Always end with a 1–2 week taper phase ending on race date.
3. Phase progression: typically Base → Build → Peak → Taper. Adjust to current CTL — if athlete is undertrained (ACWR <0.7), front-load with a Rebuild phase.
4. Weekly templates: respect the athlete's weekly pattern. If they only train 5 days, two days must be REST.
5. Athlete notes are LOAD-BEARING. Holidays trigger a maintenance phase or modified template. Secondary goals (body comp, strength) must appear in templates. Constraints (injuries) shape session selection.
6. Include 4–8 milestones: phase ends, FTP/run tests at logical inflection points, race simulation 4 weeks out, race day.
7. Race day milestone is mandatory and last.
8. CTL targets should be progressive but realistic (ramp ≤5/week).

Output ONLY the JSON object, no other text.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Server missing ANTHROPIC_API_KEY" },
      { status: 500 }
    );
  }

  const reqBody = await req.json().catch(() => ({}));
  const { synced, raceGoal, athleteNotes, amendments, sessionFeedbacks } = reqBody;

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

  const userPrompt = `Generate the training plan now.

TODAY: ${today.toISOString().slice(0, 10)}
WEEKS TO RACE: ${totalWeeks}

RACE GOAL:
${JSON.stringify(raceGoal, null, 2)}

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

  // Stream tokens from Anthropic and flush keepalive whitespace to the client
  // so Netlify's edge idle-timeout doesn't kill the connection during the
  // ~30-40s plan generation. The body stays valid JSON because JSON.parse
  // ignores leading/interleaved whitespace before the actual object.
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      // Initial flush so TTFB is immediate
      controller.enqueue(encoder.encode(" "));

      let lastFlush = Date.now();
      const flushKeepalive = () => {
        if (Date.now() - lastFlush > 5000) {
          try {
            controller.enqueue(encoder.encode(" "));
            lastFlush = Date.now();
          } catch {}
        }
      };

      let fullText = "";
      let final: unknown;

      try {
        const stream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 12000,
          system: PLAN_SYSTEM,
          messages: [{ role: "user", content: userPrompt }],
        });

        for await (const event of stream) {
          flushKeepalive();
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            fullText += event.delta.text;
          }
        }

        let raw = fullText.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
        try {
          const plan = JSON.parse(raw);
          final = {
            ok: true,
            plan: {
              generated_at: new Date().toISOString(),
              race: {
                name: raceGoal.name,
                date: raceGoal.date,
                type: raceGoal.type,
              },
              total_weeks: plan.total_weeks ?? totalWeeks,
              phases: plan.phases ?? [],
              milestones: plan.milestones ?? [],
              rationale: plan.rationale,
            },
          };
        } catch (e) {
          final = {
            ok: false,
            error: "Plan JSON parse failed",
            detail: e instanceof Error ? e.message : "unknown",
            raw: raw.slice(0, 500),
          };
        }
      } catch (e) {
        final = {
          ok: false,
          error: e instanceof Error ? e.message : "Network error",
        };
      }

      controller.enqueue(encoder.encode(JSON.stringify(final)));
      controller.close();
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}
