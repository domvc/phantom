"use client";

import { useEffect, useState } from "react";
import {
  getUserState,
  setUserState,
  type AthleteNotes,
  type BodyMeasurement,
} from "@/lib/storage";
import {
  computeBodyCompTrend,
  parseBodyCompGoal,
  todayKey,
  type BodyCompTrend,
} from "@/lib/nutrition";

type Props = {
  open: boolean;
  onClose: () => void;
  measurements: BodyMeasurement[];
  athleteNotes?: AthleteNotes;
  currentWeight: number | null;
};

export default function BodyProgressModal({
  open,
  onClose,
  measurements,
  athleteNotes,
  currentWeight,
}: Props) {
  const [weightInput, setWeightInput] = useState("");
  const [bfInput, setBfInput] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (open) {
      setWeightInput("");
      setBfInput("");
      setSavedFlash(false);
    }
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function save() {
    const w = parseFloat(weightInput);
    const bf = parseFloat(bfInput);
    if (isNaN(w) && isNaN(bf)) return;

    const tk = todayKey();
    const existing = getUserState().bodyMeasurements || [];
    const idx = existing.findIndex((m) => m.date === tk);
    const merged: BodyMeasurement = {
      date: tk,
      ...(idx >= 0 ? existing[idx] : {}),
      ...(isNaN(w) ? {} : { weightKg: w }),
      ...(isNaN(bf) ? {} : { bodyFatPct: bf }),
    };
    const next =
      idx >= 0
        ? [...existing.slice(0, idx), merged, ...existing.slice(idx + 1)]
        : [...existing, merged];
    setUserState({ bodyMeasurements: next });
    setSavedFlash(true);
    setWeightInput("");
    setBfInput("");
    window.dispatchEvent(new Event("phantomcoach:body-logged"));
    setTimeout(() => setSavedFlash(false), 1500);
  }

  if (!open) return null;

  const goal = parseBodyCompGoal(athleteNotes);
  const weightTrend = computeBodyCompTrend(measurements, "weight");
  const bfTrend = computeBodyCompTrend(measurements, "bodyFat");
  const sortedMeasurements = [...measurements].sort((a, b) =>
    b.date.localeCompare(a.date)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-bg border border-border rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-7 py-4 border-b border-border-soft flex items-start justify-between gap-4 flex-shrink-0">
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-accent font-bold mb-1">
              Body composition
            </div>
            <h2 className="text-lg font-bold tracking-tight">Progress & projection</h2>
            <p className="text-[12px] text-text-muted mt-1">
              Log every 4 days, first thing in the morning. The line through your data
              is a least-squares fit; the dashed extension is where that trend lands in
              8 weeks.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text text-2xl leading-none flex-shrink-0"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Log form */}
          <div className="bg-accent-soft border border-accent-mid rounded-md p-5">
            <div className="text-[11px] uppercase tracking-[0.1em] text-accent font-bold mb-3">
              Log today&apos;s measurement
            </div>
            <div className="grid sm:grid-cols-2 gap-3 mb-3">
              <Field
                label="Weight (kg)"
                value={weightInput}
                onChange={setWeightInput}
                placeholder={currentWeight ? `${currentWeight}` : "78.4"}
              />
              <Field
                label="Body fat (%)"
                value={bfInput}
                onChange={setBfInput}
                placeholder="14.2"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={save}
                disabled={!weightInput && !bfInput}
                className="px-4 py-2 bg-accent hover:bg-accent-h disabled:opacity-30 disabled:cursor-not-allowed text-white text-[12px] font-semibold rounded-md transition"
              >
                Save
              </button>
              {savedFlash && (
                <span className="text-[11.5px] text-go font-semibold">✓ Saved</span>
              )}
            </div>
          </div>

          {/* Charts */}
          <div className="space-y-5">
            <ChartBlock
              label="Weight"
              unit="kg"
              trend={weightTrend}
              goal={goal?.metric === "weight" ? goal : null}
              colour="#1F6B2A"
            />
            <ChartBlock
              label="Body fat"
              unit="%"
              trend={bfTrend}
              goal={goal?.metric === "bodyFat" ? goal : null}
              colour="#C1440E"
            />
          </div>

          {/* Recent log */}
          <div>
            <div className="text-[10px] uppercase tracking-[0.1em] text-text-muted font-bold mb-2">
              Recent measurements
            </div>
            {sortedMeasurements.length === 0 ? (
              <div className="text-[12px] text-text-muted py-3">
                Nothing logged yet. Use the form above to record today&apos;s reading.
              </div>
            ) : (
              <div className="bg-surface border border-border-soft rounded-md overflow-hidden">
                {sortedMeasurements.slice(0, 12).map((m, i) => (
                  <div
                    key={m.date}
                    className={`px-4 py-2.5 flex items-center justify-between text-[12px] ${
                      i > 0 ? "border-t border-border-soft" : ""
                    }`}
                  >
                    <div className="text-text-mid">
                      {new Date(m.date).toLocaleDateString("en-GB", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </div>
                    <div className="flex gap-4 text-right">
                      <div className={m.weightKg == null ? "text-text-muted" : "text-text"}>
                        {m.weightKg != null ? `${m.weightKg.toFixed(1)} kg` : "—"}
                      </div>
                      <div
                        className={`w-16 ${
                          m.bodyFatPct == null ? "text-text-muted" : "text-text"
                        }`}
                      >
                        {m.bodyFatPct != null ? `${m.bodyFatPct.toFixed(1)}%` : "—"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChartBlock({
  label,
  unit,
  trend,
  goal,
  colour,
}: {
  label: string;
  unit: string;
  trend: BodyCompTrend;
  goal: { target: number; targetDate: string | null } | null;
  colour: string;
}) {
  if (trend.series.length === 0) {
    return (
      <div className="bg-surface border border-dashed border-border-soft rounded-md p-6 text-center">
        <div className="text-[10px] uppercase tracking-[0.1em] text-text-muted font-bold mb-1">
          {label}
        </div>
        <div className="text-[12px] text-text-muted">
          No data yet — log a reading to start tracking.
        </div>
      </div>
    );
  }

  const slopeLabel =
    trend.slopePerWeek == null
      ? null
      : `${trend.slopePerWeek > 0 ? "+" : ""}${trend.slopePerWeek.toFixed(2)} ${unit}/week`;
  const projectedLabel =
    trend.projectedIn8Weeks == null
      ? null
      : `${trend.projectedIn8Weeks.toFixed(1)}${unit} in 8w`;

  return (
    <div className="bg-surface border border-border-soft rounded-md p-5">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <div className="text-[10px] uppercase tracking-[0.1em] text-text-muted font-bold">
          {label}
        </div>
        <div className="flex items-center gap-3 text-[10.5px]">
          {slopeLabel && (
            <span
              className={
                trend.slopePerWeek == null
                  ? "text-text-muted"
                  : trend.slopePerWeek < 0
                  ? "text-go"
                  : trend.slopePerWeek > 0
                  ? "text-modify"
                  : "text-text-muted"
              }
            >
              {slopeLabel}
            </span>
          )}
          {projectedLabel && (
            <span className="text-text-muted">→ {projectedLabel}</span>
          )}
          {goal && (
            <span className="text-accent font-semibold">
              Goal {goal.target}
              {unit}
              {goal.targetDate
                ? ` · ${new Date(goal.targetDate).toLocaleDateString("en-GB", {
                    month: "short",
                    year: "2-digit",
                  })}`
                : ""}
            </span>
          )}
        </div>
      </div>
      <ProgressChart trend={trend} colour={colour} unit={unit} goal={goal} />
    </div>
  );
}

function ProgressChart({
  trend,
  colour,
  unit,
  goal,
}: {
  trend: BodyCompTrend;
  colour: string;
  unit: string;
  goal: { target: number; targetDate: string | null } | null;
}) {
  const W = 600;
  const H = 180;
  const PAD = { top: 14, right: 50, bottom: 26, left: 36 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  if (trend.series.length === 0) return null;

  const firstDate = new Date(trend.series[0].date);
  const lastDate = new Date(trend.series[trend.series.length - 1].date);
  const projectionEnd = new Date(lastDate);
  projectionEnd.setDate(projectionEnd.getDate() + 56);
  const span = Math.max(
    (projectionEnd.getTime() - firstDate.getTime()) / 86400000,
    1
  );

  const allValues = [
    ...trend.series.map((p) => p.value),
    trend.projectedIn8Weeks ?? trend.series[0].value,
    goal?.target ?? trend.series[0].value,
  ];
  const minV = Math.min(...allValues);
  const maxV = Math.max(...allValues);
  const padV = (maxV - minV) * 0.15 || maxV * 0.05 || 1;
  const yMin = minV - padV;
  const yMax = maxV + padV;

  const xFn = (date: Date) =>
    PAD.left + ((date.getTime() - firstDate.getTime()) / 86400000 / span) * cW;
  const yFn = (v: number) => PAD.top + cH - ((v - yMin) / (yMax - yMin)) * cH;

  const dataPath = trend.series
    .map(
      (p, i) =>
        `${i ? "L" : "M"}${xFn(new Date(p.date)).toFixed(1)},${yFn(p.value).toFixed(1)}`
    )
    .join(" ");

  const lastVal = trend.series[trend.series.length - 1].value;
  const projection =
    trend.projectedIn8Weeks != null
      ? `M${xFn(lastDate).toFixed(1)},${yFn(lastVal).toFixed(1)} L${xFn(
          projectionEnd
        ).toFixed(1)},${yFn(trend.projectedIn8Weeks).toFixed(1)}`
      : null;

  // 4 horizontal grid ticks
  const tickValues: number[] = [];
  for (let i = 0; i <= 4; i++) {
    tickValues.push(yMin + ((yMax - yMin) * i) / 4);
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-44">
      {/* grid */}
      {tickValues.map((v) => (
        <g key={v}>
          <line
            x1={PAD.left}
            y1={yFn(v)}
            x2={W - PAD.right}
            y2={yFn(v)}
            stroke="#EAEAE8"
            strokeWidth="0.6"
          />
          <text
            x={PAD.left - 4}
            y={yFn(v) + 3.5}
            fill="#AAAAAA"
            fontSize="9"
            textAnchor="end"
            fontFamily="Inter"
          >
            {v.toFixed(unit === "%" ? 1 : 1)}
          </text>
        </g>
      ))}

      {/* Today divider — only meaningful if projection extends */}
      {projection && (
        <line
          x1={xFn(lastDate)}
          y1={PAD.top}
          x2={xFn(lastDate)}
          y2={H - PAD.bottom}
          stroke="#DCDCDA"
          strokeWidth="1"
          strokeDasharray="3,3"
        />
      )}

      {/* Goal line */}
      {goal && goal.target >= yMin && goal.target <= yMax && (
        <>
          <line
            x1={PAD.left}
            y1={yFn(goal.target)}
            x2={W - PAD.right}
            y2={yFn(goal.target)}
            stroke="#C1440E"
            strokeWidth="1"
            strokeDasharray="4,4"
            opacity="0.55"
          />
          <text
            x={W - PAD.right + 4}
            y={yFn(goal.target) + 3}
            fill="#C1440E"
            fontSize="9"
            fontFamily="Inter"
          >
            Goal
          </text>
        </>
      )}

      {/* Projection line (dashed) */}
      {projection && (
        <path
          d={projection}
          fill="none"
          stroke={colour}
          strokeWidth="1.5"
          strokeDasharray="4,4"
          opacity="0.6"
        />
      )}

      {/* Actual data line */}
      <path
        d={dataPath}
        fill="none"
        stroke={colour}
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Data points */}
      {trend.series.map((p) => (
        <circle
          key={p.date}
          cx={xFn(new Date(p.date))}
          cy={yFn(p.value)}
          r="2.5"
          fill={colour}
        />
      ))}

      {/* Projected end-point */}
      {projection && trend.projectedIn8Weeks != null && (
        <circle
          cx={xFn(projectionEnd)}
          cy={yFn(trend.projectedIn8Weeks)}
          r="2.5"
          fill={colour}
          opacity="0.5"
        />
      )}

      {/* Labels at start, last, projected end */}
      <text
        x={xFn(firstDate)}
        y={H - PAD.bottom + 14}
        fill="#AAAAAA"
        fontSize="9"
        textAnchor="start"
        fontFamily="Inter"
      >
        {firstDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
      </text>
      {projection && (
        <text
          x={xFn(projectionEnd)}
          y={H - PAD.bottom + 14}
          fill="#AAAAAA"
          fontSize="9"
          textAnchor="end"
          fontFamily="Inter"
        >
          +8w
        </text>
      )}
    </svg>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="text-[11px] font-semibold text-text mb-1.5">{label}</div>
      <input
        type="number"
        step="0.1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-bg border border-border rounded-md text-[13px] focus:outline-none focus:border-accent transition"
      />
    </label>
  );
}
