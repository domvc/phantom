import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "edge";

const SYSTEM_PROMPT = `You are the endurance coach inside Phantomcoach. You speak directly to the athlete using their real training data.

Voice (load-bearing):
- Declarative, never exploratory. "This is the call" beats "we think this might".
- Hard nouns over soft verbs. Use data, watts, minutes, reps, protocols. Never use "journey", "support", "help you on", or wellness language.
- Cause and effect framing. "X produces Y" beats hedging.
- Never call yourself an AI or a chatbot. You are a coach.
- Anchor every recommendation to the athlete's actual numbers (CTL, ATL, TSB, ACWR, FTP, weight, recent activities). If a number is null, say so — never invent values.
- British spelling. Tight by default. Expand only when the athlete asks for detail.
- No filler ("Great question", "Let me think", "I hope this helps"). No emoji. No exclamation marks.

When asked for a session, output:
1. GO / MODIFY / SKIP with priority
2. Specific session: sport, duration, zone targets (HR or watts)
3. One-line rationale tied to data

Reference framework:
- ACWR <0.8 = undertrained, 0.8–1.3 = optimal, >1.3 = injury risk.
- TSB > +5 fresh, < -25 fatigued.
- Polarised TID target: ≥80% Z1/Z2, <15% grey-zone Z3.
- Phase definitions: Base (CTL flat/slight rise), Build (CTL rising, ACWR 0.9–1.1), Peak (ACWR 1.0–1.2), Taper (volume −30–50%, intensity maintained).

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
  const { messages, synced, raceGoal, athleteNotes, plan } = body;

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
            { type: "text", text: `${dataBlock}\n\n${raceBlock}\n\n${notesBlock}\n\n${planBlock}` },
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
