"use client";

import { useState } from "react";
import type { DailyRow } from "@/lib/storage";

type Tone = "ok" | "warn" | "muted" | "default";

type Props = {
  label: string;
  value: string;
  tone?: Tone;
  definition: string;
  /** Optional time-series for the trend visual + delta. Provide last ~21 days. */
  series?: { date: string; v: number | null }[];
  /** How to format the +/- delta. Default: signed integer */
  formatDelta?: (delta: number) => string;
};

export default function MetricChip({
  label,
  value,
  tone = "default",
  definition,
  series,
  formatDelta = (d) => `${d > 0 ? "+" : ""}${d.toFixed(1)}`,
}: Props) {
  const [hover, setHover] = useState(false);

  const valueClass =
    tone === "ok"
      ? "text-go"
      : tone === "warn"
      ? "text-modify"
      : tone === "muted"
      ? "text-text-muted font-medium"
      : "text-text";

  // Compute 3-week trend from series
  const validSeries = (series ?? []).filter((d) => d.v != null) as {
    date: string;
    v: number;
  }[];
  const has21 = validSeries.length >= 7;
  const lastVal = has21 ? validSeries[validSeries.length - 1].v : null;
  const startVal = has21
    ? validSeries[Math.max(0, validSeries.length - 21)].v
    : null;
  const delta = has21 && lastVal != null && startVal != null ? lastVal - startVal : null;

  return (
    <div
      className="flex-1 px-4 py-3 text-center border-r border-border-soft last:border-r-0 relative cursor-help"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      tabIndex={0}
    >
      <div className="text-[9.5px] font-bold tracking-[0.08em] uppercase text-text-muted">
        {label}
      </div>
      <div className={`text-[16px] font-bold tracking-tight mt-0.5 ${valueClass}`}>
        {value}
      </div>

      {/* Hover popover */}
      {hover && (
        <div className="absolute z-30 left-1/2 -translate-x-1/2 top-full mt-2 w-72 bg-bg border border-border rounded-md shadow-xl p-4 text-left pointer-events-none">
          {/* Arrow */}
          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 size-3 rotate-45 bg-bg border-l border-t border-border" />

          <div className="flex items-baseline justify-between mb-2">
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-text">
              {label}
            </div>
            {delta !== null && (
              <div
                className={`text-[11px] font-bold ${
                  delta > 0.5 ? "text-go" : delta < -0.5 ? "text-modify" : "text-text-muted"
                }`}
              >
                {formatDelta(delta)}{" "}
                <span className="text-[9.5px] uppercase tracking-wide font-semibold opacity-70">
                  3wk
                </span>
              </div>
            )}
          </div>

          <p className="text-[11.5px] text-text-mid leading-relaxed mb-3">
            {definition}
          </p>

          {has21 && validSeries.length >= 2 && (
            <div className="bg-surface border border-border-soft rounded-md p-2.5">
              <Sparkline series={validSeries.slice(-21)} delta={delta} />
              <div className="text-[9.5px] text-text-muted mt-1 flex justify-between">
                <span>{validSeries[Math.max(0, validSeries.length - 21)].date.slice(5)}</span>
                <span>{validSeries[validSeries.length - 1].date.slice(5)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Sparkline({
  series,
  delta,
}: {
  series: { date: string; v: number }[];
  delta: number | null;
}) {
  const W = 240;
  const H = 40;
  const PAD = 2;
  const vs = series.map((s) => s.v);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const range = Math.max(0.001, max - min);

  const xFn = (i: number) =>
    PAD + (i / (series.length - 1)) * (W - PAD * 2);
  const yFn = (v: number) =>
    PAD + (1 - (v - min) / range) * (H - PAD * 2);

  const path = series
    .map((s, i) => `${i === 0 ? "M" : "L"}${xFn(i).toFixed(1)},${yFn(s.v).toFixed(1)}`)
    .join(" ");

  const areaPath =
    `M${xFn(0).toFixed(1)},${(H - PAD).toFixed(1)} ` +
    series.map((s, i) => `L${xFn(i).toFixed(1)},${yFn(s.v).toFixed(1)}`).join(" ") +
    ` L${xFn(series.length - 1).toFixed(1)},${(H - PAD).toFixed(1)} Z`;

  const colour =
    delta == null
      ? "#8A8A88"
      : delta > 0.5
      ? "#1F6B2A"
      : delta < -0.5
      ? "#C1440E"
      : "#8A8A88";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full h-7"
    >
      <path d={areaPath} fill={colour} fillOpacity="0.12" />
      <path
        d={path}
        fill="none"
        stroke={colour}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle
        cx={xFn(series.length - 1).toFixed(1)}
        cy={yFn(series[series.length - 1].v).toFixed(1)}
        r="2"
        fill={colour}
      />
    </svg>
  );
}
