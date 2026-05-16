import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "edge";

const SYSTEM = `You are a coach having a focused conversation with the athlete about ONE specific session they just completed. You are the SAME coach the athlete has been chatting with on the main dashboard — read the recent chat history and act accordingly. If they already told you about this session earlier (e.g. "doing a 100km ride today"), don't act surprised when they come back to log it.

Process:
1. Listen actively to how the session felt — body, mind, fueling, environment.
2. Ask short follow-ups if useful (max 1-2 questions, never interrogate).
3. When the athlete has shared what they want to share OR explicitly says "that's it" / "save it" / similar, call save_session_feedback with a tight 2-3 sentence summary capturing:
   - How the session felt (energy, effort, body)
   - Any surprises (positive or negative)
   - Implications for upcoming sessions if any

Style:
- Warm but not saccharine. Direct. British spelling.
- Reference the actual session details and numbers when relevant.
- Reference earlier chat context when it's useful — e.g. "you flagged this would be a Z2 effort and the data backs that up" or "you said your legs felt heavy yesterday — that fits the lower-than-usual cadence today".
- DO NOT moralise or lecture. The athlete reports — you record.
- Keep responses TIGHT. 1-3 sentences usually. Don't write essays.
- After calling save_session_feedback, briefly confirm what was saved in plain language.

DO NOT call the tool until the athlete has shared at least one substantive sentence about how it went.`;

const SAVE_FEEDBACK_TOOL = {
  name: "save_session_feedback",
  description:
    "Persist a tight 2-3 sentence summary of the athlete's reflection on this session. Call after the athlete has shared their take, not before.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: {
        type: "string",
        description:
          "2-3 sentence summary of: how it felt (energy, body, effort), notable surprises, and implications for upcoming sessions. Use the athlete's voice where useful.",
      },
    },
    required: ["summary"],
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
  const {
    messages,
    activity,
    plannedSession,
    analysis,
    synced,
    athleteNotes,
    raceGoal,
    recentChat,
  } = body as {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: any[];
    activity?: unknown;
    plannedSession?: unknown;
    analysis?: string;
    synced?: {
      athlete?: { ftp?: number | null };
      fitness?: { ctl?: number; atl?: number; tsb?: number };
      derived?: { acwr?: number | null };
    };
    athleteNotes?: unknown;
    raceGoal?: { name?: string; type?: string; date?: string };
    recentChat?: { role: "user" | "assistant"; content: string }[];
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: "no messages" }), { status: 400 });
  }

  const contextBlock = `=== SESSION FEEDBACK CONTEXT ===

You are discussing this completed session with the athlete:
${JSON.stringify(activity, null, 2)}

What was planned (may be off-plan if they did something different):
${plannedSession ? JSON.stringify(plannedSession, null, 2) : "(no specific plan for this day)"}

YOUR PRIOR ANALYSIS OF THE SESSION:
${analysis || "(none)"}

ATHLETE FITNESS: ${synced ? `CTL ${synced.fitness?.ctl}, ATL ${synced.fitness?.atl}, TSB ${synced.fitness?.tsb}, ACWR ${synced.derived?.acwr}, FTP ${synced.athlete?.ftp}W` : "(not synced)"}

ATHLETE NOTES:
${athleteNotes ? JSON.stringify(athleteNotes, null, 2) : "(none)"}

RACE: ${raceGoal ? `${raceGoal.name} (${raceGoal.type}) on ${raceGoal.date}` : "(none)"}

RECENT CHAT WITH YOU ON THE MAIN DASHBOARD (you are continuing the same conversation here — reference what they already told you, don't act surprised by intent they already shared):
${
  Array.isArray(recentChat) && recentChat.length > 0
    ? recentChat
        .map((m) => `${m.role === "user" ? "Athlete" : "You"}: ${m.content}`)
        .join("\n---\n")
    : "(no recent chat history — treat this as a fresh conversation)"
}`;

  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const anthStream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 800,
          tools: [SAVE_FEEDBACK_TOOL],
          system: [
            { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
            { type: "text", text: contextBlock },
          ],
          messages,
        });

        const toolBuffers: Record<number, { name: string; jsonStr: string }> = {};

        for await (const event of anthStream) {
          if (event.type === "content_block_start") {
            if (event.content_block.type === "tool_use") {
              toolBuffers[event.index] = { name: event.content_block.name, jsonStr: "" };
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
                  encoder.encode(`data: ${JSON.stringify({ toolUse: { name: buf.name, input } })}\n\n`)
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
