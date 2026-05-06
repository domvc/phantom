"use client";

import { useMemo, useState } from "react";
import {
  computeVolume,
  RANGE_OPTIONS,
  SPORT_OPTIONS,
  type VolumeBucket,
  type VolumeRange,
  type VolumeSport,
  type VolumeStats,
} from "@/lib/volume";
import type { RecentActivity } from "@/lib/storage";
import {
  BikeIcon,
  RunIcon,
  SwimIcon,
  StrengthIcon,
  PulseIcon,
} from "@/components/icons";

const SPORT_GLYPHS: Record<VolumeSport, React.ReactNode> = {
  all: <PulseIcon size={14} />,
  run: <RunIcon size={14} />,
  bike: <BikeIcon size={14} />,
  swim: <SwimIcon size={14} />,
  strength: <StrengthIcon size={14} />,
};

type Props = {
  activities?: RecentActivity[];
};

export default function TrainingVolumeCard({ activities }: Props) {
  const [sport, setSport] = useState<VolumeSport>("all");
  const [range, setRange] = useState<VolumeRange>("last_30");

  const stats = useMemo(() => {
    if (!activities) return null;
    return computeVolume(activities, sport, range);
  }, [activities, sport, range]);

  if (!activities || activities.length === 0) {
    return (
      <div className="bg-surface border border-border-soft rounded-md p-6 mb-5">
        <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-semibold mb-2">
          Training volume
        </div>
        <p className="text-[12.5px] text-text-muted">
          Sync your data to see volume trends.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border-soft rounded-md p-6 mb-5">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-semibold mb-1">
            Training volume
          </div>
          <div className="text-[12.5px] text-text-mid">
            {RANGE_OPTIONS.find((r) => r.id === range)?.label}
          </div>
        </div>
        <RangeSelector range={range} onChange={setRange} />
      </div>

      {/* Sport pills */}
      <div className="flex items-center gap-1.5 mb-5 overflow-x-auto -mx-1 px-1 pb-1">
        {SPORT_OPTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSport(s.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition border whitespace-nowrap ${
              sport === s.id
                ? "bg-accent text-white border-accent"
                : "bg-bg text-text-mid border-border hover:border-accent hover:text-accent"
            }`}
          >
            <span>{SPORT_GLYPHS[s.id]}</span>
            {s.label}
          </button>
        ))}
      </div>

      {stats && <VolumeStatsBlock stats={stats} sport={sport} />}
    </div>
  );
}

function RangeSelector({
  range,
  onChange,
}: {
  range: VolumeRange;
  onChange: (r: VolumeRange) => void;
}) {
  return (
    <div className="flex gap-1 bg-bg border border-border-soft rounded-md p-0.5">
      {RANGE_OPTIONS.map((r) => (
        <button
          key={r.id}
          onClick={() => onChange(r.id)}
          className={`px-2.5 py-1 text-[11px] font-semibold rounded transition ${
            range === r.id
              ? "bg-accent text-white"
              : "text-text-muted hover:text-text"
          }`}
        >
          {r.short}
        </button>
      ))}
    </div>
  );
}

function VolumeStatsBlock({
  stats,
  sport,
}: {
  stats: VolumeStats;
  sport: VolumeSport;
}) {
  const hasData = stats.currentTotal > 0;
  return (
    <>
      {/* Primary + secondary metrics row */}
      <div className="flex items-end gap-7 flex-wrap mb-5">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.1em] text-text-muted font-semibold mb-0.5">
            {stats.primary.label}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tight text-text">
              {formatPrimary(stats.primary.value, stats.primary.unit)}
            </span>
            <span className="text-[12px] text-text-muted">{stats.primary.unit}</span>
            {stats.delta !== null && (
              <DeltaPill delta={stats.delta} />
            )}
          </div>
        </div>
        {stats.secondary.map((s) => (
          <div key={s.label}>
            <div className="text-[10.5px] uppercase tracking-[0.1em] text-text-muted font-semibold mb-0.5">
              {s.label}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold tracking-tight text-text-mid">
                {s.unit === "kg" ? "—" : formatPrimary(s.value, s.unit)}
              </span>
              {s.unit !== "kg" && (
                <span className="text-[11px] text-text-muted">{s.unit}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Chart */}
      {hasData ? (
        <VolumeChart stats={stats} sport={sport} />
      ) : (
        <div className="bg-bg border border-dashed border-border rounded-md py-10 text-center text-[12px] text-text-muted">
          No {sport === "all" ? "activity" : sport} sessions in this period.
        </div>
      )}
    </>
  );
}

function DeltaPill({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="text-[11px] text-text-muted font-semibold">flat</span>
    );
  }
  const positive = delta > 0;
  return (
    <span
      className={`text-[11px] font-bold tracking-tight px-1.5 py-0.5 rounded ${
        positive
          ? "bg-go-soft text-go border border-go/20"
          : "bg-modify-soft text-modify border border-modify/20"
      }`}
      title="Vs equivalent prior period"
    >
      {positive ? "↑" : "↓"} {Math.abs(delta)}%
    </span>
  );
}

function formatPrimary(value: number, unit: string): string {
  if (unit === "min" && value >= 60) {
    const h = Math.floor(value / 60);
    const m = Math.round(value % 60);
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
  if (unit === "min") return Math.round(value).toString();
  if (unit === "km") {
    return value >= 100 ? Math.round(value).toString() : value.toFixed(1);
  }
  return value.toString();
}

function VolumeChart({ stats, sport }: { stats: VolumeStats; sport: VolumeSport }) {
  const buckets = stats.buckets;
  const max = Math.max(...buckets.map((b) => b.value), 1);
  const granularity = stats.bucketGranularity;

  // SVG chart sizing
  const width = 720;
  const height = 140;
  const padX = 8;
  const padTop = 12;
  const padBottom = 24;
  const innerW = width - padX * 2;
  const innerH = height - padTop - padBottom;

  // Build polyline points + area path
  const points = buckets.map((b, i) => {
    const x =
      buckets.length === 1
        ? padX + innerW / 2
        : padX + (i / (buckets.length - 1)) * innerW;
    const y = padTop + innerH - (b.value / max) * innerH;
    return { x, y, b };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath =
    `M ${padX} ${padTop + innerH} ` +
    points.map((p) => `L ${p.x} ${p.y}`).join(" ") +
    ` L ${padX + innerW} ${padTop + innerH} Z`;

  // X-axis labels — first, middle, last (avoid clutter)
  const labelIndices =
    buckets.length <= 3
      ? buckets.map((_, i) => i)
      : [0, Math.floor(buckets.length / 2), buckets.length - 1];

  const axisUnit =
    sport === "strength" ? "" : sport === "all" ? "min" : "km";

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="volume-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {/* Y-axis grid lines */}
        <line
          x1={padX}
          y1={padTop}
          x2={padX + innerW}
          y2={padTop}
          stroke="var(--color-border-soft)"
          strokeDasharray="2 3"
          strokeWidth={1}
        />
        <line
          x1={padX}
          y1={padTop + innerH / 2}
          x2={padX + innerW}
          y2={padTop + innerH / 2}
          stroke="var(--color-border-soft)"
          strokeDasharray="2 3"
          strokeWidth={1}
        />
        <line
          x1={padX}
          y1={padTop + innerH}
          x2={padX + innerW}
          y2={padTop + innerH}
          stroke="var(--color-border)"
          strokeWidth={1}
        />

        {/* Area + line */}
        <path d={areaPath} fill="url(#volume-fill)" />
        <path
          d={linePath}
          stroke="var(--color-accent)"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Dots — only for sparse data */}
        {buckets.length <= 14 &&
          points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={p.b.value > 0 ? 3 : 2}
              fill={p.b.value > 0 ? "var(--color-accent)" : "var(--color-border)"}
            />
          ))}

        {/* Y-axis labels */}
        <text
          x={padX + innerW - 2}
          y={padTop + 4}
          textAnchor="end"
          className="text-[9px] fill-text-muted"
          style={{ fontSize: 10 }}
        >
          {formatAxisValue(max, axisUnit)}
        </text>
        <text
          x={padX + innerW - 2}
          y={padTop + innerH + 4}
          textAnchor="end"
          className="fill-text-muted"
          style={{ fontSize: 10 }}
        >
          0
        </text>

        {/* X-axis labels */}
        {labelIndices.map((idx) => {
          const p = points[idx];
          if (!p) return null;
          return (
            <text
              key={idx}
              x={p.x}
              y={height - 6}
              textAnchor="middle"
              className="fill-text-muted"
              style={{ fontSize: 10, letterSpacing: "0.05em" }}
            >
              {p.b.label}
            </text>
          );
        })}
      </svg>

      {/* Hover tooltips — invisible touch zones with native title attribute */}
      <div className="absolute inset-0 flex pointer-events-none" style={{ paddingLeft: padX, paddingRight: padX }}>
        {buckets.map((b, i) => {
          const flexW = 1;
          return (
            <div
              key={i}
              className="pointer-events-auto"
              style={{ flex: flexW }}
              title={`${b.label}${granularity === "week" ? " (week of)" : ""}\n${b.value} ${axisUnit || "sessions"}\n${b.sessions} session${b.sessions === 1 ? "" : "s"}\n${Math.round(b.minutes)} min`}
            />
          );
        })}
      </div>
    </div>
  );
}

function formatAxisValue(v: number, unit: string): string {
  if (unit === "min") {
    if (v >= 60) {
      const h = v / 60;
      return h >= 10 ? `${Math.round(h)}h` : `${h.toFixed(1)}h`;
    }
    return `${Math.round(v)}m`;
  }
  if (unit === "km") {
    return v >= 100 ? `${Math.round(v)}` : v.toFixed(1);
  }
  return Math.round(v).toString();
}
