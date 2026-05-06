"use client";

import { useState } from "react";
import type { SessionReconciliation, Plan, PlanPhase } from "@/lib/storage";
import { patchReconciliation } from "@/lib/reconcile";

const STATUS_STYLES: Record<
  SessionReconciliation["status"],
  { bg: string; border: string; ring: string; label: string; labelClass: string }
> = {
  aligned: {
    bg: "bg-go-soft",
    border: "border-go/30",
    ring: "ring-go/10",
    label: "Aligned",
    labelClass: "text-go",
  },
  swapped: {
    bg: "bg-modify-soft",
    border: "border-modify/30",
    ring: "ring-modify/10",
    label: "Swap",
    labelClass: "text-modify",
  },
  deviation: {
    bg: "bg-accent-soft",
    border: "border-accent-mid",
    ring: "ring-accent/10",
    label: "Deviation",
    labelClass: "text-accent",
  },
  extra: {
    bg: "bg-surface",
    border: "border-border",
    ring: "ring-border/10",
    label: "Bonus",
    labelClass: "text-text-mid",
  },
  missed: {
    bg: "bg-surface",
    border: "border-border",
    ring: "ring-border/10",
    label: "Missed",
    labelClass: "text-text-muted",
  },
};

type Props = {
  reconciliations: SessionReconciliation[];
  plan?: Plan;
  onAdaptStart?: () => void;
  onAdaptEnd?: () => void;
};

/**
 * Banner that surfaces undismissed reconciliations from the most recent sync.
 * Shows up to 3 at a time. Each item can be dismissed; deviations/swaps offer
 * an "Adapt the week" action that fires a structural amendment.
 */
export default function SessionReconcileBanner({
  reconciliations,
  plan,
  onAdaptStart,
  onAdaptEnd,
}: Props) {
  const [adapting, setAdapting] = useState<string | null>(null);
  const [adaptError, setAdaptError] = useState<string | null>(null);

  const visible = reconciliations.filter((r) => !r.dismissed && !r.adapted).slice(0, 3);
  if (visible.length === 0) return null;

  function dismiss(activityId: string) {
    patchReconciliation(activityId, { dismissed: true });
    window.dispatchEvent(new Event("phantomcoach:reconciliation-changed"));
  }

  async function adaptWeek(rec: SessionReconciliation) {
    if (!plan) return;
    setAdapting(rec.activityId);
    setAdaptError(null);

    const phase = phaseForDate(plan, rec.activityDate);
    const dateLabel = new Date(rec.activityDate).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });

    const description = buildAmendmentDescription(rec, dateLabel);
    onAdaptStart?.();

    try {
      const res = await fetch("/api/plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          synced: undefined, // server reads from request payload only — pass via patch flow below
        }),
      });
      // The simpler path: just record the amendment locally and let the next plan-gen pick it up.
      // We don't regenerate the plan immediately — that's a heavy operation. The amendment will
      // be reflected next time the user explicitly clicks "Regenerate".
      // For now, store the amendment and mark the reconciliation as adapted.
      void res; // silence unused

      const { setUserState, getUserState } = await import("@/lib/storage");
      const state = getUserState();
      const amendment = {
        id: `recon-${rec.activityId}`,
        appliedAt: new Date().toISOString(),
        weekContext: dateLabel,
        description,
      };
      setUserState({
        amendments: [...(state.amendments ?? []), amendment],
      });
      patchReconciliation(rec.activityId, { adapted: true });
      window.dispatchEvent(new Event("phantomcoach:reconciliation-changed"));
    } catch (e) {
      setAdaptError(e instanceof Error ? e.message : "Failed to record adaptation");
    } finally {
      setAdapting(null);
      onAdaptEnd?.();
    }
  }

  return (
    <div className="mb-5 space-y-2">
      {visible.map((rec) => {
        const style = STATUS_STYLES[rec.status];
        const dateLabel = new Date(rec.activityDate).toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "short",
        });
        const canAdapt =
          (rec.status === "swapped" || rec.status === "deviation") && plan && !rec.adapted;
        return (
          <div
            key={rec.activityId}
            className={`rounded-lg border ${style.border} ${style.bg} px-5 py-4 flex items-start gap-4`}
          >
            <div
              className={`flex-shrink-0 size-9 rounded-full bg-bg border ${style.border} flex items-center justify-center`}
            >
              <SportGlyph sport={rec.activitySport} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap mb-1">
                <span
                  className={`text-[10px] uppercase tracking-[0.12em] font-bold ${style.labelClass}`}
                >
                  {style.label}
                </span>
                <span className="text-[11px] text-text-muted">· {dateLabel}</span>
              </div>
              <div className="text-[13.5px] font-semibold text-text mb-0.5">
                {rec.activityName}
                {rec.durationMin ? (
                  <span className="text-text-muted font-normal">
                    {" "}
                    · {Math.round(rec.durationMin)}min
                  </span>
                ) : null}
                {rec.tss ? (
                  <span className="text-text-muted font-normal"> · {rec.tss} TSS</span>
                ) : null}
              </div>
              <p className="text-[12.5px] text-text-mid leading-relaxed">{rec.message}</p>
              {rec.plannedTitle && (
                <p className="text-[11px] text-text-muted mt-1">
                  Plan said:{" "}
                  <span className="line-through">{rec.plannedTitle}</span>
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5 flex-shrink-0">
              {canAdapt && (
                <button
                  onClick={() => adaptWeek(rec)}
                  disabled={adapting === rec.activityId}
                  className="text-[11.5px] font-semibold px-3 py-1.5 bg-accent hover:bg-accent-h disabled:opacity-50 text-white rounded-md transition"
                >
                  {adapting === rec.activityId ? "Adapting…" : "Adapt the week"}
                </button>
              )}
              <button
                onClick={() => dismiss(rec.activityId)}
                className="text-[11px] font-semibold px-3 py-1.5 text-text-muted hover:text-text transition"
              >
                Dismiss
              </button>
            </div>
          </div>
        );
      })}
      {adaptError && (
        <div className="text-[12px] text-modify px-2">⚠️ {adaptError}</div>
      )}
    </div>
  );
}

function phaseForDate(plan: Plan, dateIso: string): PlanPhase | null {
  const d = new Date(dateIso);
  for (const p of plan.phases || []) {
    const start = new Date(p.start_date);
    const end = new Date(p.end_date);
    if (d >= start && d <= end) return p;
  }
  return null;
}

function buildAmendmentDescription(rec: SessionReconciliation, dateLabel: string): string {
  const did = `${rec.activityName}${rec.durationMin ? ` (${Math.round(rec.durationMin)}min)` : ""}`;
  const planned = rec.plannedTitle ? ` instead of the planned ${rec.plannedTitle}` : "";
  return `On ${dateLabel} the athlete did ${did}${planned}. Treat this as a one-off displacement: keep the rest of the week intact, but if the displaced quality session can be recovered later in the week without compounding load, shift it; otherwise drop it cleanly. Do not re-introduce a removed session category.`;
}

function SportGlyph({ sport }: { sport?: string }) {
  const props = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "text-text-mid",
  };
  if (sport === "bike")
    return (
      <svg {...props}>
        <circle cx="5.5" cy="17.5" r="3.5" />
        <circle cx="18.5" cy="17.5" r="3.5" />
        <path d="M12 17.5 L8 9 L13 9 M14.5 6 L17 6 L18.5 17.5" />
      </svg>
    );
  if (sport === "run")
    return (
      <svg {...props}>
        <circle cx="14" cy="4.5" r="1.6" />
        <path d="M9 21 L11 15 L8 12 L10 8 L13 10 L17 11 M11 15 L14.5 17.5 L13 21" />
      </svg>
    );
  if (sport === "swim")
    return (
      <svg {...props}>
        <path d="M2 16 Q 5 14, 8 16 T 14 16 T 20 16 T 22 16" />
        <path d="M2 20 Q 5 18, 8 20 T 14 20 T 20 20 T 22 20" />
      </svg>
    );
  return (
    <svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 12 L11 14 L15 10" />
    </svg>
  );
}
