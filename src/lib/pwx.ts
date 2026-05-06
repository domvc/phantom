/**
 * PWX (TrainingPeaks XML) workout file generator.
 *
 * PWX 1.0 schema: https://www.peaksware.com/PWX_schema_1.0.xsd
 * Reference docs are sparse — the canonical examples come from TrainingPeaks
 * exports. This generator produces the "structured workout" form (segments
 * with target ranges) that TP imports as a prescribed session.
 *
 * Validated by re-importing into TrainingPeaks → workout opens with structure
 * and target ranges intact. Garmin Connect also accepts these via TP sync.
 */
import type { IntervalBlock, IntervalStep, PlannedSession } from "./storage";

type Athlete = {
  ftp?: number | null;
  lthr?: number | null;
  weight?: number | null;
};

const xmlEscape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** Flatten repeat blocks into a linear list of steps so PWX segments map 1:1. */
function flattenBlocks(blocks: IntervalBlock[]): IntervalStep[] {
  const out: IntervalStep[] = [];
  for (const b of blocks) {
    if (b.type === "step") {
      out.push(b.step);
    } else {
      for (let i = 0; i < b.count; i++) {
        for (const s of b.steps) out.push(s);
      }
    }
  }
  return out;
}

/**
 * Convert a step's target into PWX-friendly numbers. PWX uses absolute units
 * (watts, bpm, m/s) — convert percent-based targets using the athlete's FTP / LTHR.
 */
function stepToTarget(
  step: IntervalStep,
  athlete: Athlete
): { lo?: number; hi?: number; metric: "watts" | "hr" | "speed" | "" } {
  const { target_type, target_low, target_high } = step;

  if (target_type === "power_w") {
    return { lo: target_low, hi: target_high, metric: "watts" };
  }
  if (target_type === "power_pct_ftp" && athlete.ftp) {
    return {
      lo: target_low != null ? Math.round((target_low / 100) * athlete.ftp) : undefined,
      hi: target_high != null ? Math.round((target_high / 100) * athlete.ftp) : undefined,
      metric: "watts",
    };
  }
  if (target_type === "hr_pct_lthr" && athlete.lthr) {
    return {
      lo: target_low != null ? Math.round((target_low / 100) * athlete.lthr) : undefined,
      hi: target_high != null ? Math.round((target_high / 100) * athlete.lthr) : undefined,
      metric: "hr",
    };
  }
  if (target_type === "pace" && target_low != null) {
    // pace given as min/km decimal (e.g. 5.30 = 5:30/km).
    // Convert to m/s for PWX speed.
    const paceToMps = (mins: number) => 1000 / (mins * 60);
    return {
      lo: target_high != null ? +paceToMps(target_high).toFixed(3) : undefined, // slower pace = lower mps
      hi: target_low != null ? +paceToMps(target_low).toFixed(3) : undefined,
      metric: "speed",
    };
  }
  // rpe / free / unmappable — leave segments target-less
  return { metric: "" };
}

const KIND_NAMES: Record<IntervalStep["kind"], string> = {
  warmup: "Warm-up",
  steady: "Steady",
  work: "Interval",
  recovery: "Recovery",
  cooldown: "Cool-down",
};

function segmentXml(step: IntervalStep, athlete: Athlete, idx: number): string {
  const t = stepToTarget(step, athlete);
  const name = step.label || KIND_NAMES[step.kind] || `Step ${idx + 1}`;
  const dur = Math.max(1, Math.round(step.duration_s));

  // <segment> with <name>, <duration>, optional <powerlow>/<powerhigh> etc.
  // PWX 1.0 element names per TrainingPeaks importable files.
  let targets = "";
  if (t.metric === "watts" && (t.lo != null || t.hi != null)) {
    if (t.lo != null) targets += `      <minpower>${t.lo}</minpower>\n`;
    if (t.hi != null) targets += `      <maxpower>${t.hi}</maxpower>\n`;
  } else if (t.metric === "hr" && (t.lo != null || t.hi != null)) {
    if (t.lo != null) targets += `      <minhr>${t.lo}</minhr>\n`;
    if (t.hi != null) targets += `      <maxhr>${t.hi}</maxhr>\n`;
  } else if (t.metric === "speed" && (t.lo != null || t.hi != null)) {
    if (t.lo != null) targets += `      <minspeed>${t.lo}</minspeed>\n`;
    if (t.hi != null) targets += `      <maxspeed>${t.hi}</maxspeed>\n`;
  }

  return `    <segment>
      <name>${xmlEscape(name)}</name>
      <duration>${dur}</duration>
${targets}    </segment>`;
}

const SPORT_TO_PWX: Record<string, string> = {
  bike: "Bike",
  run: "Run",
  swim: "Swim",
  strength: "Strength",
  brick: "Bike", // brick PWX export — bike portion only is the convention
  rest: "Other",
};

/**
 * Build a TrainingPeaks-compatible PWX 1.0 XML string for a prescribed workout.
 */
export function sessionToPwx(opts: {
  session: PlannedSession;
  intervals: IntervalBlock[];
  date: string; // YYYY-MM-DD
  athlete?: Athlete;
}): string {
  const { session, intervals, date, athlete = {} } = opts;
  const steps = flattenBlocks(intervals);
  const sport = SPORT_TO_PWX[session.sport || "bike"] || "Bike";

  const segments = steps
    .map((s, i) => segmentXml(s, athlete, i))
    .join("\n");

  // PWX requires a <time> element — TP uses ISO-8601 with seconds.
  const time = `${date}T06:00:00`;

  const title = xmlEscape(session.title || "Workout");
  const summary = xmlEscape(session.summary || "");
  const totalSec = steps.reduce((acc, s) => acc + Math.max(1, Math.round(s.duration_s)), 0);

  return `<?xml version="1.0" encoding="UTF-8"?>
<pwx xmlns="http://www.peaksware.com/PWX/1/0" creator="MyGOAT" version="1.0">
  <workout>
    <athlete>
      <name>MyGOAT Athlete</name>
    </athlete>
    <sportType>${sport}</sportType>
    <code>${title}</code>
    <cmt>${summary}</cmt>
    <time>${time}</time>
    <summarydata>
      <duration>${totalSec}</duration>
    </summarydata>
${segments}
  </workout>
</pwx>
`;
}

/** Trigger a download of the given content as a file in the browser. */
export function downloadFile(filename: string, content: string, mime = "application/xml") {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Sanitize a string for use as a filename. */
export function safeFilename(s: string, ext = "pwx"): string {
  const base = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "workout";
  return `${base}.${ext}`;
}
