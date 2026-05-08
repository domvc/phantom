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
  syncedAt?: string;
};

export default function TrainingVolumeCard({ activities, syncedAt }: Props) {
  const [sport, setSport] = useState<VolumeSport>("all");
  const [range, setRange] = useState<VolumeRange>("last_30");

  const stats = useMemo(() => {
    if (!activities) return null;
    return computeVolume(activities, sport, range);
  }, [activities, sport, range]);

  // Find the date span the synced activities actually cover — useful when the
  // user's expecting a recent run that hasn't been synced yet.
  const dataWindow = useMemo(() => {
    if (!activities || activities.length === 0) return null;
    const sorted = [...activities].sort((a, b) => a.date.localeCompare(b.date));
    return {
      oldest: sorted[0].date.slice(0, 10),
      newest: sorted[sorted.length - 1].date.slice(0, 10),
      count: activities.length,
    };
  }, [activities]);

  if (!activities || activities.length === 0) {
    return (
      <div className="bg-surface border border-border-soft rounded-md p-4 sm:p-6 mb-5">
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

      {dataWindow && (
        <div className="mt-4 pt-3 border-t border-border-soft text-[10.5px] text-text-muted flex items-center justify-between gap-3 flex-wrap">
          <span>
            Reading <strong className="text-text-mid">{dataWindow.count}</strong> activities
            from <strong className="text-text-mid">{formatShort(dataWindow.oldest)}</strong> →{" "}
            <strong className="text-text-mid">{formatShort(dataWindow.newest)}</strong>
          </span>
          {syncedAt && (
            <span>Last sync: {new Date(syncedAt).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}</span>
          )}
        </div>
      )}
    </div>
  );
}

function formatShort(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
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

/**
 * Strava-style daily volume chart. Each day = one circle marker. Filled marker
 * for days with activity, hollow for zeros. Hover any day → tooltip shows
 * exact value + date with a vertical crosshair.
 */
function VolumeChart({ stats, sport }: { stats: VolumeStats; sport: VolumeSport }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const buckets = stats.buckets;
  // Round max up to a nice axis number (5/10/20/50/100…)
  const rawMax = Math.max(...buckets.map((b) => b.value), 1);
  const max = niceCeil(rawMax);
  const granularity = stats.bucketGranularity;

  // SVG sizing — taller, leaves room on the right for axis labels
  const width = 720;
  const height = 200;
  const padLeft = 12;
  const padRight = 44; // axis labels live here
  const padTop = 14;
  const padBottom = 28;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  // Build polyline points + area path (one per bucket)
  const points = buckets.map((b, i) => {
    const x =
      buckets.length === 1
        ? padLeft + innerW / 2
        : padLeft + (i / (buckets.length - 1)) * innerW;
    const y = padTop + innerH - (b.value / max) * innerH;
    return { x, y, b };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
  const areaPath =
    `M ${padLeft.toFixed(2)} ${(padTop + innerH).toFixed(2)} ` +
    points.map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ") +
    ` L ${(padLeft + innerW).toFixed(2)} ${(padTop + innerH).toFixed(2)} Z`;

  // Y-axis ticks: 0, max*1/3, max*2/3, max (4 ticks total)
  const yTicks = [0, max / 3, (max * 2) / 3, max];

  // X-axis labels: 4 evenly spaced (or all if fewer than 4)
  const labelIndices =
    buckets.length <= 4
      ? buckets.map((_, i) => i)
      : [
          0,
          Math.floor((buckets.length - 1) / 3),
          Math.floor(((buckets.length - 1) * 2) / 3),
          buckets.length - 1,
        ];

  const axisUnit =
    sport === "strength" ? "" : sport === "all" ? "min" : "km";

  // SVG mouse handlers — find the nearest bucket
  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const xPx = ((e.clientX - rect.left) / rect.width) * width;
    if (xPx < padLeft || xPx > padLeft + innerW) {
      setHoverIdx(null);
      return;
    }
    // Map to bucket index
    const ratio = (xPx - padLeft) / innerW;
    const idx = Math.round(ratio * (buckets.length - 1));
    setHoverIdx(Math.max(0, Math.min(buckets.length - 1, idx)));
  }
  function onMouseLeave() {
    setHoverIdx(null);
  }

  const hoverPoint = hoverIdx != null ? points[hoverIdx] : null;
  const hoverBucket = hoverIdx != null ? buckets[hoverIdx] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full select-none"
        preserveAspectRatio="none"
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        <defs>
          <linearGradient id="volume-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {/* Y-axis gridlines + labels */}
        {yTicks.map((tick, i) => {
          const y = padTop + innerH - (tick / max) * innerH;
          const isBaseline = i === 0;
          return (
            <g key={i}>
              <line
                x1={padLeft}
                y1={y}
                x2={padLeft + innerW}
                y2={y}
                stroke={isBaseline ? "var(--color-border)" : "var(--color-border-soft)"}
                strokeDasharray={isBaseline ? "" : "2 3"}
                strokeWidth={1}
              />
              <text
                x={padLeft + innerW + 6}
                y={y + 3}
                className="fill-text-muted"
                style={{ fontSize: 11 }}
              >
                {formatAxisValue(tick, axisUnit)}
              </text>
            </g>
          );
        })}

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

        {/* Day circles — filled when activity, hollow when zero */}
        {buckets.length <= 95 &&
          points.map((p, i) => {
            const hasValue = p.b.value > 0;
            const isHovered = hoverIdx === i;
            return (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={isHovered ? 4 : hasValue ? 3 : 1.6}
                fill={hasValue ? "var(--color-accent)" : "var(--color-bg)"}
                stroke="var(--color-accent)"
                strokeWidth={hasValue ? 0 : 1.4}
              />
            );
          })}

        {/* Crosshair + emphasized point on hover */}
        {hoverPoint && hoverBucket && (
          <g pointerEvents="none">
            <line
              x1={hoverPoint.x}
              y1={padTop}
              x2={hoverPoint.x}
              y2={padTop + innerH}
              stroke="var(--color-accent)"
              strokeWidth={1}
              strokeDasharray="2 2"
              opacity={0.55}
            />
            <circle
              cx={hoverPoint.x}
              cy={hoverPoint.y}
              r={5}
              fill="var(--color-accent)"
              stroke="var(--color-bg)"
              strokeWidth={2}
            />
          </g>
        )}

        {/* X-axis labels */}
        {labelIndices.map((idx) => {
          const p = points[idx];
          if (!p) return null;
          return (
            <text
              key={idx}
              x={p.x}
              y={height - 8}
              textAnchor="middle"
              className="fill-text-muted"
              style={{ fontSize: 11, letterSpacing: "0.04em" }}
            >
              {formatTickLabel(p.b.startDate)}
            </text>
          );
        })}
      </svg>

      {/* Floating tooltip (HTML, follows hovered point) */}
      {hoverPoint && hoverBucket && (
        <div
          className="absolute pointer-events-none -translate-x-1/2 -translate-y-full bg-text text-bg rounded-md px-2.5 py-1.5 text-[11.5px] shadow-lg whitespace-nowrap z-10"
          style={{
            left: `${(hoverPoint.x / width) * 100}%`,
            top: `${(hoverPoint.y / height) * 100}%`,
            marginTop: "-10px",
          }}
        >
          <div className="font-bold">
            {formatTooltipValue(hoverBucket.value, axisUnit)}
          </div>
          <div className="opacity-65">
            {formatTooltipDate(hoverBucket.startDate, granularity)}
            {hoverBucket.sessions > 0 && ` · ${hoverBucket.sessions} session${hoverBucket.sessions === 1 ? "" : "s"}`}
          </div>
        </div>
      )}
    </div>
  );
}

/** Round up to a tidy axis maximum: 5, 10, 20, 50, 100, 200, 500… */
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const m = v / base;
  let n: number;
  if (m <= 1) n = 1;
  else if (m <= 2) n = 2;
  else if (m <= 5) n = 5;
  else n = 10;
  return n * base;
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
    if (v >= 100) return `${Math.round(v)} km`;
    return `${v.toFixed(v < 10 ? 1 : 0)} km`;
  }
  return Math.round(v).toString();
}

function formatTickLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase();
}

function formatTooltipValue(v: number, unit: string): string {
  if (unit === "min") {
    if (v >= 60) {
      const h = Math.floor(v / 60);
      const m = Math.round(v % 60);
      return m === 0 ? `${h}h` : `${h}h ${m}m`;
    }
    return v === 0 ? "Rest" : `${Math.round(v)} min`;
  }
  if (unit === "km") {
    return v === 0 ? "Rest" : `${v.toFixed(v < 10 ? 2 : 1)} km`;
  }
  return v === 0 ? "0" : `${v} session${v === 1 ? "" : "s"}`;
}

function formatTooltipDate(iso: string, granularity: "day" | "week"): string {
  const d = new Date(iso + "T00:00:00");
  const label = d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return granularity === "week" ? `Week of ${label}` : label;
}
