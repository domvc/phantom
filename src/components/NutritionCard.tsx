"use client";

import { useState } from "react";
import { effectiveWeight, type UserState } from "@/lib/storage";
import { computeReminders } from "@/lib/nutrition";
import BodyProgressModal from "@/components/BodyProgressModal";

export default function NutritionCard({ user }: { user: UserState }) {
  const [open, setOpen] = useState(false);
  const measurements = user.bodyMeasurements ?? [];
  const reminders = computeReminders(measurements);

  const lastWeight = [...measurements]
    .filter((m) => m.weightKg != null)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const lastBf = [...measurements]
    .filter((m) => m.bodyFatPct != null)
    .sort((a, b) => b.date.localeCompare(a.date))[0];

  const anyDue = reminders.weightDue || reminders.bodyFatDue;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`text-left bg-surface border rounded-md p-6 transition group ${
          anyDue
            ? "border-modify hover:border-modify"
            : "border-border-soft hover:border-accent"
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted font-semibold">
            Body composition
          </div>
          {anyDue && (
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-modify-soft text-modify font-bold">
              Due
            </span>
          )}
        </div>

        <Row
          label="Weight"
          value={lastWeight?.weightKg != null ? `${lastWeight.weightKg.toFixed(1)} kg` : "—"}
          due={reminders.weightDue}
          daysAgo={reminders.daysSinceLastWeight}
        />
        <Row
          label="Body fat"
          value={lastBf?.bodyFatPct != null ? `${lastBf.bodyFatPct.toFixed(1)}%` : "—"}
          due={reminders.bodyFatDue}
          daysAgo={reminders.daysSinceLastBodyFat}
        />

        <div className="pt-3 mt-3 border-t border-border-soft">
          <p className="text-[11px] text-text-mid leading-relaxed mb-2">
            Log every 4 days, first thing in the morning. Trends matter — single
            readings don&apos;t.
          </p>
          <div className="text-[11.5px] text-accent font-semibold group-hover:underline">
            {anyDue ? "Log now & see progress →" : "View progress →"}
          </div>
        </div>
      </button>

      <BodyProgressModal
        open={open}
        onClose={() => setOpen(false)}
        measurements={measurements}
        athleteNotes={user.athleteNotes}
        currentWeight={effectiveWeight(user)}
      />
    </>
  );
}

function Row({
  label,
  value,
  due,
  daysAgo,
}: {
  label: string;
  value: string;
  due: boolean;
  daysAgo: number | null;
}) {
  return (
    <div className="flex items-baseline justify-between mb-2">
      <div>
        <div className="text-[9.5px] uppercase tracking-wider text-text-muted font-bold">
          {label}
        </div>
        <div className="text-[18px] font-bold tracking-tight leading-tight">
          {value}
        </div>
      </div>
      <div className="text-right">
        <div className={`text-[10px] font-semibold ${due ? "text-modify" : "text-go"}`}>
          {due ? "● Due" : "✓ On track"}
        </div>
        <div className="text-[10px] text-text-muted">
          {daysAgo == null ? "Not logged" : `${daysAgo}d ago`}
        </div>
      </div>
    </div>
  );
}
