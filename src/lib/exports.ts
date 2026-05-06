/**
 * Week-level export helpers — plain-text copy and CSV download.
 *
 * The .pwx export is per-session and lives in lib/pwx.ts; this module covers
 * the "share my week" use case where the athlete wants the full week's plan
 * as text or as a spreadsheet row-per-session for upload to TrainingPeaks.
 */
import type { PlannedSession } from "./storage";

/**
 * Format a Date as YYYY-MM-DD using LOCAL calendar fields. Use this anywhere
 * you'd otherwise reach for `d.toISOString().slice(0,10)` on a Date that
 * represents a local moment (e.g. midnight of a calendar day) — toISOString
 * converts to UTC and silently shifts the date in non-UTC timezones.
 */
export function toLocalIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const DAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type DayKey = (typeof DAY_KEYS)[number];

const DAY_LABELS: Record<DayKey, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

/**
 * Format a single week as plain text for clipboard / messages.
 * Output is human-readable, dates included, sessions grouped by day.
 */
export function weekToText(opts: {
  monday: Date;
  weekly_template: Record<DayKey, PlannedSession[]>;
  phaseName?: string;
  raceName?: string;
}): string {
  const { monday, weekly_template, phaseName, raceName } = opts;

  const header = [
    `MyGOAT — Week of ${monday.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })}`,
    phaseName ? `Phase: ${phaseName}` : "",
    raceName ? `Race: ${raceName}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const days = DAY_KEYS.map((key, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const dateStr = date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const sessions = weekly_template[key] ?? [];

    if (sessions.length === 0 || sessions.every((s) => s.type === "rest")) {
      return `${DAY_LABELS[key]} ${dateStr} — Rest`;
    }

    const lines = sessions.map((s) => {
      const slot = s.slot && s.slot !== "REST" ? `${s.slot} · ` : "";
      const dur = s.duration ? ` (${s.duration})` : "";
      const sport = s.sport && s.sport !== "rest" ? ` [${s.sport}]` : "";
      return `  ${slot}${s.title}${sport}${dur}\n    ${s.summary}`;
    });

    return `${DAY_LABELS[key]} ${dateStr}\n${lines.join("\n")}`;
  });

  return [header, "", ...days].join("\n\n");
}

/** Escape a CSV field (quote-wrap if it contains comma, newline, or quote). */
function csvField(v: string | number | undefined | null): string {
  if (v === undefined || v === null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Format a single week as CSV for upload to TrainingPeaks (which accepts CSV)
 * or any spreadsheet tool. One row per session.
 */
export function weekToCsv(opts: {
  monday: Date;
  weekly_template: Record<DayKey, PlannedSession[]>;
}): string {
  const { monday, weekly_template } = opts;
  const headers = ["date", "day", "slot", "sport", "type", "title", "duration", "summary"];

  const rows: string[][] = [];
  DAY_KEYS.forEach((key, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const dateIso = toLocalIso(date);
    const dayLabel = DAY_LABELS[key];
    const sessions = weekly_template[key] ?? [];
    if (sessions.length === 0) {
      rows.push([dateIso, dayLabel, "REST", "rest", "rest", "Rest", "—", "Rest day"]);
      return;
    }
    for (const s of sessions) {
      rows.push([
        dateIso,
        dayLabel,
        s.slot || "",
        s.sport || "",
        s.type || "",
        s.title || "",
        s.duration || "",
        s.summary || "",
      ]);
    }
  });

  return [headers.map(csvField).join(","), ...rows.map((r) => r.map(csvField).join(","))].join(
    "\n"
  );
}

/** Tiny clipboard helper that works on http localhost too. */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through */
    }
  }
  if (typeof document === "undefined") return false;
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    return true;
  } catch {
    return false;
  } finally {
    document.body.removeChild(ta);
  }
}
