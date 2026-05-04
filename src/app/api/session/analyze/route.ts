import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const SYSTEM = `You analyse a SINGLE training session that an athlete has just completed. Stream a markdown response — no fences except where indicated.

You receive:
- The activity (date, name, type, distance, duration, TSS, intensity, avg HR, etc.)
- The phase context (name, focus, ctl_target_end, week)
- The planned session for that day (sport, slot, title, summary)
- Athlete fitness state (FTP, LTHR, weight, CTL, ATL, TSB, ACWR)
- Athlete notes
- Any past session feedback

Output EXACTLY this format:

---HEADLINE---
<one short sentence — was this on plan / above plan / below plan / off-plan? + key signal>
---PERFORMANCE---
<2-3 sentences comparing actual vs expected. Reference specific numbers (TSS, HR, intensity factor). State whether the athlete hit, exceeded, or undershot the prescription. If off-plan (e.g. ran when plan said bike), call that out neutrally.>
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
- Stay neutral on off-plan deviations — don't moralise. Just describe.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      "data: " + JSON.stringify({ error: "Missing ANTHROPIC_API_KEY" }) + "\n\ndata: [DONE]\n\n",
      { headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { activity, plannedSession, phase, synced, athleteNotes, recentFeedback } = body;

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
${recentFeedback?.length ? recentFeedback.map((f: { activityName: string; activityDate: string; feedback: string }) => `[${f.activityDate} ${f.activityName}] ${f.feedback}`).join("\n") : "(none)"}

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
