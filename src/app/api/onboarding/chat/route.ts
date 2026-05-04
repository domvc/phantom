import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "edge";

const SYSTEM = `You are an endurance coach welcoming a new athlete to Phantomcoach. Your job is to capture their training context conversationally so the system can tailor their plan.

You need to gather FOUR pieces of information, ONE at a time:
1. weeklyPattern — when they can train, when they can't, days per week, AM/PM preferences
2. upcomingDisruptions — holidays, travel, busy work periods, weddings, illness in the next 6 months
3. secondaryGoals — anything beyond the main race (body composition, strength, technique, life outside endurance)
4. constraints — injuries, niggles, time limits, methodology preferences, things to avoid

RULES:
- Ask ONE question at a time and wait for the answer.
- Each question is 1-2 sentences, warm but brief. No filler ("Great question!", "Awesome").
- Acknowledge each answer in a SHORT line (8-15 words) before asking the next question.
- Take whatever they give you — vague answers are fine. Don't probe or push back.
- After the FOURTH topic answer, do TWO things in this order:
  (a) Reply with one closing line (e.g. "That's everything I need — building your plan now.").
  (b) Call the save_athlete_notes tool with the four extracted strings.
- British spelling. Direct. No bullet lists or markdown — plain conversational text only.
- The athlete already gave their race details before this conversation, so DO NOT ask about the race itself.

START IMMEDIATELY with a brief greeting (one short sentence, address them by name if known) and the first question (about their weekly training pattern). No preamble.`;

const SAVE_TOOL = {
  name: "save_athlete_notes",
  description:
    "Save the captured athlete training context. Call this AFTER you have collected answers for all four topics.",
  input_schema: {
    type: "object" as const,
    properties: {
      weeklyPattern: {
        type: "string",
        description: "Their typical training week — when they train, days per week, time of day.",
      },
      upcomingDisruptions: {
        type: "string",
        description: "Holidays, travel, busy periods in the next 6 months. '(none)' if nothing notable.",
      },
      secondaryGoals: {
        type: "string",
        description: "Goals beyond the race — body comp, strength, technique. '(none)' if just race-focused.",
      },
      constraints: {
        type: "string",
        description: "Injuries, niggles, time limits, things to avoid. '(none)' if nothing flagged.",
      },
    },
    required: ["weeklyPattern", "upcomingDisruptions", "secondaryGoals", "constraints"],
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
  const { messages, athleteName, raceGoal } = body;

  if (!Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: "no messages" }), { status: 400 });
  }

  const contextBlock = `=== ATHLETE CONTEXT ===
Name: ${athleteName || "(unknown)"}
Race already captured: ${
    raceGoal
      ? `${raceGoal.name} (${raceGoal.type}) on ${raceGoal.date}${
          raceGoal.targetTime ? ` · target ${raceGoal.targetTime}` : ""
        }`
      : "(none)"
  }`;

  const client = new Anthropic({ apiKey });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const anthStream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 1200,
          tools: [SAVE_TOOL],
          system: [
            { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
            { type: "text", text: contextBlock },
          ],
          messages: messages.length === 0 ? [{ role: "user", content: "Start" }] : messages,
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
