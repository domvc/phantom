/**
 * Helpers for the calendar's "Save & rebalance" flow.
 *
 * When a user drags or deletes a session on the calendar we write to
 * `plan.weekOverrides[mondayIso]`. The user then has the option to either:
 *
 *   - Save & rebalance — regenerate the plan with a structural amendment so
 *     the next 1-2 weeks absorb whatever load the edit cost (this module
 *     composes that amendment text from the override diff).
 *   - Revert — drop the override and snap back to the phase template.
 *
 * Output of `composeWeekEditAmendment` is the human-readable description
 * that gets appended to `userState.amendments[]` and surfaced to the
 * plan-gen model as a structural amendment.
 */
import {
  normalizeDay,
  type Plan,
  type PlanPhase,
  type PlannedSession,
} from "./storage";
import { estimateSessionTss } from "./projection";
import type { DayKey } from "./exports";

const DAY_KEYS: DayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const DAY_LABELS: Record<DayKey, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

type SessionSignature = {
  title: string;
  sport?: string;
  type: string;
  slot: string;
  tss: number;
};

function signature(s: PlannedSession): SessionSignature {
  return {
    title: s.title || "",
    sport: s.sport,
    type: s.type,
    slot: s.slot || "",
    tss: estimateSessionTss(s),
  };
}

function sigKey(s: SessionSignature): string {
  return `${s.sport ?? "?"}|${s.type}|${s.title}|${s.slot}`;
}

/**
 * Diff a day between the phase template and the override. Returns lists of
 * removed and added sessions (matched by sport+type+title+slot). Modifications
 * that change only duration are caught as "removed + added".
 */
function diffDay(
  template: PlannedSession[],
  override: PlannedSession[]
): { removed: SessionSignature[]; added: SessionSignature[] } {
  const t = template.filter((s) => s.type !== "rest").map(signature);
  const o = override.filter((s) => s.type !== "rest").map(signature);

  const counts: Map<string, { sig: SessionSignature; delta: number }> = new Map();
  for (const sig of t) {
    const k = sigKey(sig);
    const cur = counts.get(k);
    counts.set(k, { sig, delta: (cur?.delta ?? 0) - 1 });
  }
  for (const sig of o) {
    const k = sigKey(sig);
    const cur = counts.get(k);
    counts.set(k, { sig, delta: (cur?.delta ?? 0) + 1 });
  }

  const removed: SessionSignature[] = [];
  const added: SessionSignature[] = [];
  for (const { sig, delta } of counts.values()) {
    if (delta < 0) for (let i = 0; i < -delta; i++) removed.push(sig);
    if (delta > 0) for (let i = 0; i < delta; i++) added.push(sig);
  }
  return { removed, added };
}

function phaseForDate(phases: PlanPhase[], date: Date): PlanPhase | null {
  for (const p of phases) {
    const start = new Date(p.start_date);
    const end = new Date(p.end_date);
    end.setHours(23, 59, 59, 999);
    if (date >= start && date <= end) return p;
  }
  return null;
}

export type WeekEditSummary = {
  weekStartIso: string;
  netLostTss: number; // negative when load was added, positive when load was cut
  dayChanges: Array<{
    day: DayKey;
    removed: SessionSignature[];
    added: SessionSignature[];
  }>;
  amendmentDescription: string;
  /** Short human-readable summary for the UI banner. */
  uiSummary: string;
};

/**
 * Build a structured amendment from a single week's overrides. Used when the
 * user clicks "Save & rebalance" — the description goes into
 * `userState.amendments[]` and is surfaced to the plan-gen model so the next
 * regenerate absorbs the lost load (or trims the gained load) across the
 * following 1-2 weeks.
 */
export function composeWeekEditAmendment(
  plan: Plan,
  mondayIso: string
): WeekEditSummary | null {
  const override = plan.weekOverrides?.[mondayIso];
  if (!override) return null;
  const monday = new Date(mondayIso + "T00:00:00");

  let netLostTss = 0;
  const dayChanges: WeekEditSummary["dayChanges"] = [];

  for (const dayKey of DAY_KEYS) {
    const overrideDay = override[dayKey];
    if (overrideDay === undefined) continue;

    const dayDate = new Date(monday);
    dayDate.setDate(monday.getDate() + DAY_KEYS.indexOf(dayKey));
    const dayPhase = phaseForDate(plan.phases, dayDate);
    if (!dayPhase) continue;

    const template = normalizeDay(dayPhase.weekly_template[dayKey]);
    const overrideSessions = normalizeDay(overrideDay);
    const { removed, added } = diffDay(template, overrideSessions);
    if (removed.length === 0 && added.length === 0) continue;

    const removedTss = removed.reduce((sum, s) => sum + s.tss, 0);
    const addedTss = added.reduce((sum, s) => sum + s.tss, 0);
    netLostTss += removedTss - addedTss;
    dayChanges.push({ day: dayKey, removed, added });
  }

  if (dayChanges.length === 0) {
    return null;
  }

  // Compose the human-readable amendment text. Detailed enough that the model
  // can decide compensation strategy without seeing the raw override JSON.
  const lines: string[] = [];
  for (const { day, removed, added } of dayChanges) {
    const label = DAY_LABELS[day];
    for (const r of removed) {
      lines.push(
        `- ${label}: REMOVED "${r.title}" (${r.sport ?? "?"} / ${r.type}, ~${r.tss} TSS)`
      );
    }
    for (const a of added) {
      lines.push(
        `- ${label}: ADDED "${a.title}" (${a.sport ?? "?"} / ${a.type}, ~${a.tss} TSS)`
      );
    }
  }

  const description = [
    `STRUCTURAL WEEK EDIT — week of ${mondayIso}.`,
    `The athlete made the following changes to that week:`,
    ...lines,
    netLostTss > 5
      ? `Net training load CUT for that week: ~${Math.round(netLostTss)} TSS.`
      : netLostTss < -5
        ? `Net training load ADDED that week: ~${Math.round(-netLostTss)} TSS.`
        : `Net training load roughly unchanged.`,
    "",
    netLostTss > 5
      ? "COMPENSATION REQUIREMENT: in the 1-2 weeks AFTER this modified week, recover the lost load by extending easy aerobic durations (Z2 days) by enough cumulative time to absorb the deficit. Spread the recovery so weekly TSS rises ≤10% week-on-week. DO NOT add new quality sessions (no extra VO2, threshold, or race-pace work). DO NOT shorten the deload/recovery weeks. DO NOT compound onto existing key sessions."
      : netLostTss < -5
        ? "COMPENSATION REQUIREMENT: in the week AFTER this modified week, trim aerobic volume modestly to keep weekly TSS rising ≤10% week-on-week. Preserve all scheduled quality sessions — pull the trim from easy/Z2 time only."
        : "No load compensation needed — the swap roughly balanced. Keep the rest of the plan untouched.",
    "",
    "Treat this as durable: bake the user's changes into the affected week's template. Do not re-introduce the removed sessions or remove the added sessions on later regenerations.",
  ].join("\n");

  // Short banner-friendly summary
  const removedTitles = dayChanges
    .flatMap((d) => d.removed.map((r) => r.title))
    .filter(Boolean);
  const addedTitles = dayChanges
    .flatMap((d) => d.added.map((a) => a.title))
    .filter(Boolean);
  let uiSummary = "";
  if (removedTitles.length && !addedTitles.length) {
    uiSummary = `Removed ${removedTitles.length} session${removedTitles.length > 1 ? "s" : ""} (~${Math.round(netLostTss)} TSS).`;
  } else if (addedTitles.length && !removedTitles.length) {
    uiSummary = `Added ${addedTitles.length} session${addedTitles.length > 1 ? "s" : ""} (+${Math.round(-netLostTss)} TSS).`;
  } else {
    uiSummary = `Moved ${dayChanges.length} session${dayChanges.length > 1 ? "s" : ""} this week.`;
  }

  return {
    weekStartIso: mondayIso,
    netLostTss,
    dayChanges,
    amendmentDescription: description,
    uiSummary,
  };
}
