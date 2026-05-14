"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DailyRow, Plan } from "@/lib/storage";
import { projectFitness } from "@/lib/projection";

type Props = {
  daily: DailyRow[];
  raceDate?: string;
  /** Plan used to project CTL/ATL forward if provided. Optional. */
  plan?: Plan;
};

export default function PerfChart({ daily, raceDate, plan }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [dims, setDims] = useState({ w: 600, h: 220 });

  useEffect(() => {
    function resize() {
      if (!ref.current) return;
      setDims({
        w: ref.current.clientWidth || 600,
        h: ref.current.clientHeight || 220,
      });
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Forward projection — runs only when both plan and starting fitness are
  // present. Extends the chart from today through race day (or 12 weeks if
  // no race is set) so the user can see where load will land if they execute
  // the plan to 100%.
  const projected = useMemo(() => {
    if (!daily?.length || !plan) return [];
    const last = [...daily].reverse().find((r) => r.ctl != null && r.atl != null);
    if (!last) return [];
    const todayIso = new Date().toISOString().slice(0, 10);
    return projectFitness({
      startCtl: last.ctl,
      startAtl: last.atl,
      plan,
      fromDateIso: todayIso,
      untilDateIso: raceDate,
      daysAhead: 84,
    });
  }, [daily, plan, raceDate]);

  if (!daily?.length) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-[12px]">
        No data yet — hit Sync data
      </div>
    );
  }

  const W = dims.w;
  const H = dims.h;
  const PAD = { top: 14, right: 14, bottom: 26, left: 30 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const ctlVals = daily.map((r) => r.ctl ?? 0);
  const atlVals = daily.map((r) => r.atl ?? 0);
  // Include projected values in the y-axis range so the projection isn't
  // clipped when CTL is forecast to grow significantly above current levels.
  const projCtl = projected.map((p) => p.ctl);
  const projAtl = projected.map((p) => p.atl);
  const allVals = [...ctlVals, ...atlVals, ...projCtl, ...projAtl];
  const maxY = Math.ceil(Math.max(...allVals, 1) * 1.18 / 5) * 5;

  const firstDate = new Date(daily[0].date);
  const lastHistoricalDate = new Date(daily[daily.length - 1].date);
  const projectionEnd = projected.length
    ? new Date(projected[projected.length - 1].date)
    : lastHistoricalDate;
  // Anchor the right edge at whichever is later: race date or end of projection.
  const endDate = raceDate
    ? new Date(Math.max(new Date(raceDate).getTime(), projectionEnd.getTime()))
    : projectionEnd;
  const today = new Date();
  const span = Math.max((endDate.getTime() - firstDate.getTime()) / 86400000, 1);

  const xFn = (date: string | Date) => {
    const dt = typeof date === "string" ? new Date(date) : date;
    return PAD.left + ((dt.getTime() - firstDate.getTime()) / 86400000 / span) * cW;
  };
  const yFn = (v: number) => PAD.top + cH - (v / maxY) * cH;

  const toPath = (pts: [number, number][]) =>
    pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

  // Build projection paths — start from the last historical point so they
  // visually join the solid line rather than starting in mid-air.
  const lastHistorical = [...daily]
    .reverse()
    .find((r) => r.ctl != null && r.atl != null);
  const projCtlPath = projected.length && lastHistorical
    ? toPath([
        [xFn(lastHistorical.date), yFn(lastHistorical.ctl ?? 0)],
        ...projected.map((p) => [xFn(p.date), yFn(p.ctl)] as [number, number]),
      ])
    : null;
  const projAtlPath = projected.length && lastHistorical
    ? toPath([
        [xFn(lastHistorical.date), yFn(lastHistorical.atl ?? 0)],
        ...projected.map((p) => [xFn(p.date), yFn(p.atl)] as [number, number]),
      ])
    : null;

  // Grid
  const step = maxY <= 40 ? 10 : 20;
  const gridVals: number[] = [];
  for (let v = 0; v <= maxY; v += step) gridVals.push(v);

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-full"
    >
      {/* Grid */}
      {gridVals.map((v) => (
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
            {v}
          </text>
        </g>
      ))}

      {/* Today line */}
      <line
        x1={xFn(today)}
        y1={PAD.top}
        x2={xFn(today)}
        y2={H - PAD.bottom}
        stroke="#DCDCDA"
        strokeWidth="1"
        strokeDasharray="3,3"
      />
      <text
        x={xFn(today)}
        y={PAD.top - 3}
        fill="#AAAAAA"
        fontSize="8"
        textAnchor="middle"
        fontFamily="Inter"
      >
        Today
      </text>

      {/* Race marker */}
      {raceDate && (
        <>
          <line
            x1={xFn(raceDate)}
            y1={PAD.top}
            x2={xFn(raceDate)}
            y2={H - PAD.bottom}
            stroke="#C1440E"
            strokeWidth="1"
            opacity="0.35"
          />
          <text
            x={xFn(raceDate)}
            y={H - PAD.bottom + 14}
            fill="#C1440E"
            fontSize="8.5"
            textAnchor="middle"
            fontFamily="Inter"
            opacity="0.8"
          >
            Race
          </text>
        </>
      )}

      {/* Projected ATL (dashed, lighter) — drawn first so historical ATL
          sits on top where they meet at "today" */}
      {projAtlPath && (
        <path
          d={projAtlPath}
          fill="none"
          stroke="#C0884A"
          strokeWidth="1.5"
          strokeDasharray="4,4"
          opacity="0.55"
          strokeLinejoin="round"
        />
      )}
      {/* Projected CTL (dashed) */}
      {projCtlPath && (
        <path
          d={projCtlPath}
          fill="none"
          stroke="#1F6B2A"
          strokeWidth="2"
          strokeDasharray="4,4"
          opacity="0.55"
          strokeLinejoin="round"
        />
      )}

      {/* Historical ATL */}
      <path
        d={toPath(daily.map((r) => [xFn(r.date), yFn(r.atl ?? 0)]))}
        fill="none"
        stroke="#C0884A"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Historical CTL */}
      <path
        d={toPath(daily.map((r) => [xFn(r.date), yFn(r.ctl ?? 0)]))}
        fill="none"
        stroke="#1F6B2A"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* End-of-projection CTL value label — only when projection exists */}
      {projected.length > 0 && (() => {
        const last = projected[projected.length - 1];
        const x = xFn(last.date);
        const y = yFn(last.ctl);
        // Don't overlap with race-line text — bump up a touch
        return (
          <g>
            <circle cx={x} cy={y} r="2.5" fill="#1F6B2A" opacity="0.7" />
            <text
              x={x - 4}
              y={y - 5}
              fill="#1F6B2A"
              fontSize="9"
              textAnchor="end"
              fontFamily="Inter"
              fontWeight="700"
              opacity="0.85"
            >
              {Math.round(last.ctl)}
            </text>
          </g>
        );
      })()}

      {/* Month labels */}
      {(() => {
        const labels: React.ReactElement[] = [];
        let cur = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
        while (cur <= endDate) {
          const x = xFn(new Date(Math.max(cur.getTime(), firstDate.getTime())));
          if (x > PAD.left + 8 && x < W - PAD.right - 4) {
            labels.push(
              <text
                key={cur.toISOString()}
                x={x}
                y={H - PAD.bottom + 14}
                fill="#AAAAAA"
                fontSize="9"
                textAnchor="middle"
                fontFamily="Inter"
              >
                {cur.toLocaleDateString("en", { month: "short" })}
              </text>
            );
          }
          cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
        }
        return labels;
      })()}
    </svg>
  );
}
