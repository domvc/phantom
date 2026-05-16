import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "edge";

const SYSTEM = `You analyse a SINGLE training session that an athlete has just completed. Stream a markdown response — no fences except where indicated.

You receive:
- The activity (date, name, type, distance, duration, TSS, intensity, avg HR, etc.)
- The phase context (name, focus, ctl_target_end, week)
- The planned session for that day (sport, slot, title, summary)
- Athlete fitness state (FTP, LTHR, weight, CTL, ATL, TSB, ACWR)
- Athlete notes
- Any past session feedback
- RECENT CHAT with the main coach (load-bearing — see below)

The recent main-coach chat is shared context: if the athlete TOLD the main coach they were going to do this exact session (e.g. "doing a 100km ride today"), do NOT act surprised that they did it. Frame it as "athlete executed what they flagged" and reflect on quality vs intent, not on the existence of the session. Only call something "off-plan" if it diverges from BOTH the planned template AND any explicit intent the athlete shared with the main coach.

Output EXACTLY this format:

---HEADLINE---
<one short sentence — was this on plan / above plan / below plan / off-plan-but-flagged / off-plan-and-unflagged? + key signal>
---PERFORMANCE---
<2-3 sentences comparing actual vs expected. Reference specific numbers (TSS, HR, intensity factor). State whether the athlete hit, exceeded, or undershot the prescription (or the intent they flagged with the main coach, if they did). If off-plan and unflagged, call that out neutrally.>
---SIGNALS---
<2-3 bullets prefixed with "•" — concrete data signals. Examples:
• Avg HR 148bpm sat at LTHR ceiling — durable Z3 effort.
• Intensity Factor 0.78 confirms tempo zone — within prescription.
• Duration 5min short of plan — likely time-constrained, not load-shy.
>
---TAKEAWAY---
<1-2 sentences: what this means for the next 2-3 sessions. Concrete adjustment if any.>
---END---

Style:
- Direct, evidence-based, second-person.
- British spelling. No filler.
- Reference REAL numbers from the input. Never fabricate.
- Stay neutral on off-plan deviations — don't moralise. Just describe.
- The athlete is the source of truth on intent. The plan is one signal; recent chat is another.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      "data: " + JSON.stringify({ error: "Missing ANTHROPIC_API_KEY" }) + "\n\ndata: [DONE]\n\n",
      { headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const {
    activity,
    plannedSession,
    phase,
    synced,
    athleteNotes,
    recentFeedback,
    recentChat,
  } = body as {
    activity?: unknown;
    plannedSession?: unknown;
    phase?: unknown;
    synced?: { athlete?: unknown; fitness?: unknown; derived?: unknown };
    athleteNotes?: unknown;
    recentFeedback?: { activityName: string; activityDate: string; feedback: string }[];
    recentChat?: { role: "user" | "assistant"; content: string }[];
  };

  if (!activity) {
    return new Response(JSON.stringify({ error: "No activity provided" }), { status: 400 });
  }

  const userPrompt = `Analyse this completed session.

ACTIVITY:
${JSON.stringify(activity, null, 2)}

PLANNED SESSION FOR THAT DAY:
${plannedSession ? JSON.stringify(plannedSession, null, 2) : "(no scheduled session — off-plan)"}

PHASE:
${phase ? JSON.stringify(phase, null, 2) : "(no phase context)"}

ATHLETE FITNESS:
${synced ? JSON.stringify({ athlete: synced.athlete, fitness: synced.fitness, derived: synced.derived }, null, 2) : "(not synced)"}

ATHLETE NOTES:
${athleteNotes ? JSON.stringify(athleteNotes, null, 2) : "(none)"}

RECENT SESSION FEEDBACK FROM ATHLETE:
${recentFeedback?.length ? recentFeedback.map((f) => `[${f.activityDate} ${f.activityName}] ${f.feedback}`).join("\n") : "(none)"}

RECENT CHAT WITH THE MAIN COACH (look here for intent the athlete signalled — if they said "doing X today" and this activity matches, the session is intentional, not off-plan):
${
  Array.isArray(recentChat) && recentChat.length > 0
    ? recentChat
        .map((m) => `${m.role === "user" ? "Athlete" : "Coach"}: ${m.content}`)
        .join("\n---\n")
    : "(no recent chat — treat the plan template as the sole signal of intent)"
}

Stream the analysis now using the section markers.`;

  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const anthStream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 1200,
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
