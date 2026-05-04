"use client";

import { useEffect, useState } from "react";
import { getUserState, type UserState } from "@/lib/storage";

export default function ProgressPage() {
  const [user, setUser] = useState<UserState>({});

  useEffect(() => {
    setUser(getUserState());
    function onChange() {
      setUser(getUserState());
    }
    window.addEventListener("phantomcoach:plan-generated", onChange);
    return () =>
      window.removeEventListener("phantomcoach:plan-generated", onChange);
  }, []);

  const plan = user.plan;
  const today = new Date();

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-3xl">
      <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-semibold mb-2">
        Race milestones
      </div>
      <h1 className="text-3xl font-bold tracking-tight mb-8">Progress</h1>

      {!plan?.milestones?.length ? (
        <div className="bg-accent-soft border border-accent-mid rounded-md p-8 text-center">
          <div className="text-3xl mb-3">🏁</div>
          <div className="text-[14px] font-bold text-accent mb-1">
            No milestones yet
          </div>
          <p className="text-[12.5px] text-text-mid">
            Head back to{" "}
            <a href="/dashboard" className="text-accent font-semibold hover:underline">
              Dashboard
            </a>{" "}
            and click <strong>Generate Plan</strong> to populate your race milestones.
          </p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[24px] top-2 bottom-4 w-px bg-border-soft" />
          <div className="space-y-3">
            {plan.milestones.map((m, i) => {
              const date = new Date(m.date);
              const isPast = date < today;
              const isToday = date.toDateString() === today.toDateString();
              const isRace = m.type === "race";
              return (
                <div key={`${m.date}-${i}`} className="flex gap-4 items-start relative">
                  <div
                    className={`size-12 rounded-full flex items-center justify-center text-[18px] flex-shrink-0 z-10 ${
                      isRace
                        ? "bg-accent text-white"
                        : isPast
                        ? "bg-go-soft text-go border border-go/30"
                        : isToday
                        ? "bg-accent-soft border-2 border-accent text-accent"
                        : "bg-surface border border-border-soft text-text-muted"
                    }`}
                  >
                    {iconFor(m.type)}
                  </div>
                  <div className="flex-1 min-w-0 bg-surface border border-border-soft rounded-md p-4">
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <div className="text-[11px] text-text-muted font-medium">
                        {date.toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "long",
                          year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
                        })}
                      </div>
                      <div
                        className={`text-[9.5px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${
                          isPast
                            ? "bg-go-soft text-go"
                            : isToday
                            ? "bg-accent text-white"
                            : "bg-surface-2 text-text-muted"
                        }`}
                      >
                        {isPast ? "Done" : isToday ? "Today" : labelFor(m.type)}
                      </div>
                    </div>
                    <div className="text-[14px] font-bold text-text">{m.title}</div>
                    <div className="text-[12px] text-text-mid mt-1 leading-relaxed">
                      {m.desc}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function iconFor(type: string) {
  switch (type) {
    case "race": return "🏁";
    case "test": return "📊";
    case "ramp_up": return "📈";
    case "phase_end": return "✓";
    case "checkpoint": return "📍";
    default: return "•";
  }
}

function labelFor(type: string) {
  switch (type) {
    case "race": return "Race day";
    case "test": return "Test";
    case "ramp_up": return "Ramp";
    case "phase_end": return "Phase end";
    case "checkpoint": return "Check";
    default: return "Ahead";
  }
}
