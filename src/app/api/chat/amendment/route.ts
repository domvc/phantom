import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are a coach helping the athlete amend their training plan for a SPECIFIC week. Be focused, concise, evidence-based.

Process:
1. Listen to what's changing (injury, travel, social plans, swap requests, preference change).
2. Ask AT MOST 1-2 short clarifying questions if you genuinely need them (severity, exact dates, days of week). Don't over-interview.
3. Propose specific changes:
   - Which sessions move, swap, get replaced, or drop.
   - Where displaced quality work is RECUPERATED elsewhere in the plan (do not silently lose stimulus).
   - One-line rationale tying changes to phase goals.
4. Wait for athlete confirmation ("yes", "go ahead", "do it").
5. ON CONFIRMATION ONLY: call apply_plan_amendment with a clear, complete description of every change. The description is the instruction set for a plan regenerator — be specific (dates, sessions, recuperation strategy).

Style:
- British spelling. Direct. Reference the athlete's actual numbers when relevant (CTL, ACWR, FTP, etc.).
- Avoid filler ("Great question", "Let me think about this", etc.).
- When proposing changes, format as a tight bulleted list inside markdown.
- After tool call, briefly acknowledge in text that the plan is being rebuilt.

DO NOT call apply_plan_amendment until the athlete has explicitly confirmed.`;

const AMEND_TOOL = {
  name: "apply_plan_amendment",
  description:
    "Persist a plan amendment AFTER the athlete has explicitly confirmed your proposed changes. Triggers a plan regeneration with the amendment baked in.",
  input_schema: {
    type: "object" as const,
    properties: {
      description: {
        type: "string",
        description:
          "A complete, specific instruction set for the plan regenerator. Include all dates affected, every session that moves/swaps/drops/replaces, and explicit recuperation strategy for displaced quality work. Example: 'Wedding Jul 17-19, no training those 3 days. Move Tue 14 VO2 to Mon 13 (replacing easy run). Recuperate Sat 18 long ride on Sun 26. Add 30min easy walk Jul 18 if possible.'",
      },
    },
    required: ["description"],
  },
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      "data: " + JSON.stringify({ text: "⚠️ Server missing ANTHROPIC_API_KEY" }) + "\n\ndata: [DONE]\n\n",
      { headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { messages, weekContext, weekStartDate, plan, synced, raceGoal, athleteNotes } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: "no messages" }), { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);

  const contextBlock = `=== AMENDMENT CONTEXT ===

You are amending the plan starting from: ${weekContext || "this week"}
Week start date: ${weekStartDate || today}
Today: ${today}

CURRENT PLAN (relevant slice):
${
  plan
    ? JSON.stringify(
        {
          phases: plan.phases?.map((p: { name: string; start_date: string; end_date: string; focus: string; weekly_template: object }) => ({
            name: p.name,
            start_date: p.start_date,
            end_date: p.end_date,
            focus: p.focus,
            weekly_template: p.weekly_template,
          })),
        },
        null,
        2
      )
    : "(no plan)"
}

RACE: ${raceGoal ? JSON.stringify(raceGoal) : "(no race goal)"}

ATHLETE FITNESS:
${
  synced
    ? `CTL ${synced.fitness?.ctl}, ATL ${synced.fitness?.atl}, TSB ${synced.fitness?.tsb}, ACWR ${synced.derived?.acwr}, FTP ${synced.athlete?.ftp}W`
    : "(not synced)"
}

ATHLETE NOTES:
- weekly: ${athleteNotes?.weeklyPattern || "(none)"}
- disruptions: ${athleteNotes?.upcomingDisruptions || "(none)"}
- secondary: ${athleteNotes?.secondaryGoals || "(none)"}
- constraints: ${athleteNotes?.constraints || "(none)"}`;

  const client = new Anthropic({ apiKey });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const anthStream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 1500,
          tools: [AMEND_TOOL],
          system: [
            { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
            { type: "text", text: contextBlock },
          ],
          messages,
        });

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
                /* skip */
              }
              delete toolBuffers[event.index];
            }
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: `⚠️ ${msg}` })}\n\n`));
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
