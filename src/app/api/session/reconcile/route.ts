import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "edge";

const SYSTEM = `You reconcile what an athlete just did against what their training plan asked for.

You receive:
- The activity they completed (name, sport, duration, TSS, distance)
- The session(s) the plan had scheduled for that day (may be none)
- Brief plan/phase context

Output VALID JSON ONLY — no prose, no markdown:
{
  "status": "aligned" | "swapped" | "deviation" | "extra",
  "message": "<one short sentence, max 22 words, second-person, declarative>"
}

Status definitions:
- aligned: same sport AND duration/load within ~25% of plan target
- swapped: different sport OR markedly different session shape, but load is in the right ballpark (e.g. did a Z2 ride instead of an easy run)
- deviation: skipped most of the planned load, OR went meaningfully harder/longer than planned (≥40% over)
- extra: nothing was planned that day — this is bonus activity

Voice (load-bearing):
- Declarative. State what happened against the plan.
- Hard nouns. Use minutes, watts, sport names. No "great job" / "well done" / wellness fluff.
- Cause-effect when relevant. "Z2 bike trades for Z2 run — same aerobic stimulus, hits the easy-day brief."
- Never moralise. The athlete chose; we adapt.

Examples:
- aligned: "60min Z2 ride, exactly the easy aerobic stimulus today asked for."
- swapped: "Z2 bike for the planned easy run — same aerobic load, run gets recovered later in the week."
- deviation: "90min hard ride against a planned recovery day — Thursday's quality session is now at risk."
- extra: "Bonus 40min Z2 spin, no session was scheduled — small aerobic top-up, no recovery cost."

Output ONLY the JSON object.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Server missing ANTHROPIC_API_KEY" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { activity, plannedSessions, phase } = body;

  if (!activity) {
    return new Response(JSON.stringify({ error: "No activity provided" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const userPrompt = `Reconcile this completed activity against the plan.

ACTIVITY (what the athlete actually did):
${JSON.stringify(activity, null, 2)}

PLAN FOR THAT DAY (what was scheduled):
${
  Array.isArray(plannedSessions) && plannedSessions.length > 0
    ? JSON.stringify(plannedSessions, null, 2)
    : "(nothing scheduled)"
}

CURRENT PHASE:
${phase ? JSON.stringify(phase, null, 2) : "(no phase context)"}

Output the JSON now.`;

  const client = new Anthropic({ apiKey });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode("\n"));
      try {
        const anthStream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 400,
          system: SYSTEM,
          messages: [{ role: "user", content: userPrompt }],
        });
        for await (const event of anthStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        controller.enqueue(encoder.encode("\n__STREAM_ERROR__:" + msg));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
