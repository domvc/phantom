import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "edge";

const SYSTEM = `You convert one prescribed workout into a structured interval list for export to TrainingPeaks / Zwift / Garmin.

Output VALID JSON ONLY — no prose, no markdown.

Schema:
{
  "intervals": [<block>, <block>, ...]
}

Each block is either a single step or a repeated set:

Step (use for warmup, cooldown, single steady efforts):
{ "type": "step", "step": <step> }

Repeat (use for "5 x 4min on / 3min off" style sets):
{ "type": "repeat", "count": <int>, "steps": [<step>, <step>] }

Step shape:
{
  "kind": "warmup"|"steady"|"work"|"recovery"|"cooldown",
  "duration_s": <int seconds>,
  "target_type": "power_pct_ftp"|"power_w"|"hr_pct_lthr"|"pace"|"rpe"|"free",
  "target_low": <number, optional>,
  "target_high": <number, optional>,
  "label": "<≤3 words, optional>"
}

Target conventions:
- power_pct_ftp — value is percent of FTP (e.g. 60-75 for Z2)
- power_w — absolute watts (use if athlete FTP known: target_low/high in W)
- hr_pct_lthr — percent of LTHR (e.g. 70-80 for easy run)
- pace — min/km decimal (e.g. 5.30 = 5:30/km). Use for run when pace anchored.
- rpe — 1-10 scale; only target_low (no high)
- free — no specific target

Rules:
- For BIKE sessions, prefer power_pct_ftp (or power_w if FTP given). Athlete uses % of FTP.
- For RUN sessions, prefer hr_pct_lthr; pace as a secondary if specific paces given in summary.
- For SWIM/STRENGTH/BRICK, output ONE single step with target_type "free", duration matching the session.
- Total duration_s should match the session "duration" field within ±10%.
- Use the session's title/summary to infer warmup/main/cooldown structure. Easy Z2 = single steady step. Interval sets = warmup + repeat block + cooldown.
- For very long aerobic sessions (>90min Z2), ONE steady step is fine.
- Be conservative on counts — never invent more reps than the summary implies.

Output ONLY the JSON object.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing ANTHROPIC_API_KEY" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({}));
  const { session, athlete } = body;

  if (!session) {
    return new Response(JSON.stringify({ error: "No session provided" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const userPrompt = `Generate structured intervals for this prescribed workout.

SESSION:
${JSON.stringify(session, null, 2)}

ATHLETE FITNESS (use these when emitting power_w / pace targets):
${
  athlete
    ? JSON.stringify(
        {
          ftp: athlete.ftp ?? null,
          lthr: athlete.lthr ?? null,
          weight: athlete.weight ?? null,
        },
        null,
        2
      )
    : "(not provided — use percent-based targets only)"
}

Output the intervals JSON now.`;

  const client = new Anthropic({ apiKey });

  // Stream raw tokens to client (same pattern as plan/generate to dodge edge buffering)
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode("\n"));
      try {
        const anthStream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 2000,
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
