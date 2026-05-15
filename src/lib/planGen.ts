/**
 * Shared plan-generation helper.
 *
 * The /api/plan/generate endpoint streams raw model JSON text (not a JSON
 * envelope) to dodge Netlify's edge response buffering — see route comments.
 * This helper does the streaming read + client-side parse so callers don't
 * have to duplicate it.
 */
import { getUserState, nextPrimaryRace, type Plan, type UserState } from "./storage";

export type GeneratePlanResult =
  | { ok: true; plan: Plan }
  | { ok: false; error: string };

export async function generatePlanFromState(): Promise<GeneratePlanResult> {
  const s = getUserState();
  if (!s.raceGoal?.date) {
    return { ok: false, error: "Set your race goal first." };
  }

  let res: Response;
  try {
    res = await fetch("/api/plan/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        synced: s.synced,
        raceGoal: s.raceGoal,
        races: s.races,
        trainingPrefs: s.trainingPrefs,
        athleteNotes: s.athleteNotes,
        amendments: s.amendments,
        sessionFeedbacks: s.sessionFeedbacks,
      }),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }

  if (!res.ok || !res.body) {
    return { ok: false, error: `Plan generation failed (HTTP ${res.status})` };
  }

  // Read the streamed body as text
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let raw = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Stream read failed" };
  }

  // Server signals errors with a sentinel marker
  const errMarker = raw.indexOf("__STREAM_ERROR__:");
  if (errMarker !== -1) {
    return {
      ok: false,
      error: raw.slice(errMarker + "__STREAM_ERROR__:".length).trim() || "Stream error",
    };
  }

  // Strip code fences if the model added any despite instructions
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");

  let parsed: {
    total_weeks?: number;
    phases?: Plan["phases"];
    milestones?: Plan["milestones"];
    rationale?: string;
  };
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    return {
      ok: false,
      error: `Plan JSON parse failed: ${e instanceof Error ? e.message : "unknown"}`,
    };
  }

  // Resolve the actual primary race the same way the server did. If the
  // stored raceGoal has rolled past (state stuck), pick the next upcoming
  // A-race from races[] so the plan envelope reflects what the model
  // actually built for — not the stale August date.
  const todayIso = new Date().toISOString().slice(0, 10);
  const upcoming =
    s.raceGoal.date < todayIso ? nextPrimaryRace(s.races ?? []) : null;
  const effectiveRace = upcoming ?? s.raceGoal;

  const today = new Date();
  const race = new Date(effectiveRace.date);
  const totalWeeks = Math.max(
    1,
    Math.ceil((race.getTime() - today.getTime()) / (7 * 86_400_000))
  );

  const plan: Plan = {
    generated_at: new Date().toISOString(),
    race: {
      name: effectiveRace.name,
      date: effectiveRace.date,
      type: effectiveRace.type,
    },
    total_weeks: parsed.total_weeks ?? totalWeeks,
    phases: parsed.phases ?? [],
    milestones: parsed.milestones ?? [],
    rationale: parsed.rationale,
  };

  return { ok: true, plan };
}

/** Required pre-conditions for generation. UI helpers can call this before showing a button as enabled. */
export function canGeneratePlan(state: UserState): { ok: true } | { ok: false; reason: string } {
  if (!state.raceGoal?.date) return { ok: false, reason: "Race goal not set" };
  return { ok: true };
}
