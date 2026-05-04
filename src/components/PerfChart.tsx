"use client";

import { useEffect, useRef, useState } from "react";
import type { DailyRow } from "@/lib/storage";

type Props = {
  daily: DailyRow[];
  raceDate?: string;
};

export default function PerfChart({ daily, raceDate }: Props) {
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
  const allVals = [...ctlVals, ...atlVals];
  const maxY = Math.ceil(Math.max(...allVals, 1) * 1.18 / 5) * 5;

  const firstDate = new Date(daily[0].date);
  const lastDate = new Date(daily[daily.length - 1].date);
  const endDate = raceDate ? new Date(raceDate) : lastDate;
  const today = new Date();
  const span = Math.max((endDate.getTime() - firstDate.getTime()) / 86400000, 1);

  const xFn = (date: string | Date) => {
    const dt = typeof date === "string" ? new Date(date) : date;
    return PAD.left + ((dt.getTime() - firstDate.getTime()) / 86400000 / span) * cW;
  };
  const yFn = (v: number) => PAD.top + cH - (v / maxY) * cH;

  const toPath = (pts: [number, number][]) =>
    pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

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

      {/* ATL */}
      <path
        d={toPath(daily.map((r) => [xFn(r.date), yFn(r.atl ?? 0)]))}
        fill="none"
        stroke="#C0884A"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* CTL */}
      <path
        d={toPath(daily.map((r) => [xFn(r.date), yFn(r.ctl ?? 0)]))}
        fill="none"
        stroke="#1F6B2A"
        strokeWidth="2"
        strokeLinejoin="round"
      />

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
