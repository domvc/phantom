import { NextRequest, NextResponse } from "next/server";

type WellnessRow = {
  id: string;
  ctl?: number | null;
  atl?: number | null;
  weight?: number | null;
  sleepSecs?: number | null;
  hrv?: number | null;
  restingHR?: number | null;
};

type Activity = {
  id: string;
  start_date_local: string;
  name?: string;
  type?: string;
  distance?: number;
  moving_time?: number;
  icu_training_load?: number;
  icu_intensity?: number;
  icu_hrss?: number;
  icu_pm_ftp?: number;
  average_heartrate?: number;
};

function basicAuth(apiKey: string) {
  return "Basic " + Buffer.from(`API_KEY:${apiKey}`).toString("base64");
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function safeNum(n: number | null | undefined, dp = 1): number | null {
  if (n == null || isNaN(n)) return null;
  return Number(n.toFixed(dp));
}

export async function POST(req: NextRequest) {
  const { apiKey, athleteId } = await req.json().catch(() => ({}));
  if (!apiKey || !athleteId) {
    return NextResponse.json({ ok: false, error: "Missing credentials" }, { status: 400 });
  }
  const cleanId = String(athleteId).trim().replace(/^i/i, "");
  const base = `https://intervals.icu/api/v1/athlete/i${cleanId}`;
  const auth = basicAuth(apiKey);
  const headers = { Authorization: auth };

  const today = new Date();
  const ninetyDaysAgo = new Date(today);
  ninetyDaysAgo.setDate(today.getDate() - 90);

  try {
    const [athleteRes, wellnessRes, activitiesRes] = await Promise.all([
      fetch(base, { headers, cache: "no-store" }),
      fetch(`${base}/wellness?oldest=${isoDate(ninetyDaysAgo)}&newest=${isoDate(today)}`, {
        headers,
        cache: "no-store",
      }),
      // Fetch the same 90-day window for activities so the volume chart can
      // show "Last 90 days". Earlier this was 30 days / 10 results — too narrow.
      fetch(`${base}/activities?oldest=${isoDate(ninetyDaysAgo)}&newest=${isoDate(today)}`, {
        headers,
        cache: "no-store",
      }),
    ]);

    if (!athleteRes.ok) {
      return NextResponse.json(
        { ok: false, error: `Athlete fetch failed: ${athleteRes.status}` },
        { status: 200 }
      );
    }
    if (!wellnessRes.ok) {
      return NextResponse.json(
        { ok: false, error: `Wellness fetch failed: ${wellnessRes.status}` },
        { status: 200 }
      );
    }

    const athlete = await athleteRes.json();
    const wellness: WellnessRow[] = await wellnessRes.json();
    const activities: Activity[] = activitiesRes.ok ? await activitiesRes.json() : [];

    // Sort wellness oldest → newest
    wellness.sort((a, b) => a.id.localeCompare(b.id));

    // Build daily_90d
    const daily_90d = wellness
      .filter((w) => w.ctl != null || w.atl != null)
      .map((w) => ({
        date: w.id,
        ctl: safeNum(w.ctl),
        atl: safeNum(w.atl),
        tsb: w.ctl != null && w.atl != null ? safeNum(w.ctl - w.atl) : null,
      }));

    // Latest fitness from most recent row that has values
    const latest = [...daily_90d].reverse().find((d) => d.ctl != null && d.atl != null);
    const fitness = latest
      ? { ctl: latest.ctl, atl: latest.atl, tsb: latest.tsb, date: latest.date }
      : null;

    // ACWR — 7d ATL avg / 28d CTL avg approximation, or simple ATL/CTL
    const recentRows = daily_90d.slice(-28);
    const acwr =
      fitness?.ctl && fitness?.atl && fitness.ctl > 0
        ? safeNum(fitness.atl / fitness.ctl, 2)
        : null;

    // Ramp rate: CTL change per week over last 7 days
    const len = daily_90d.length;
    const rampRate =
      len > 7 && daily_90d[len - 1].ctl != null && daily_90d[len - 8].ctl != null
        ? safeNum((daily_90d[len - 1].ctl! - daily_90d[len - 8].ctl!) * 1.0, 1)
        : null;

    // Phase detection (rough)
    let phase = "Unknown";
    if (fitness && acwr != null) {
      if (acwr < 0.6) phase = "Transition / Recovery";
      else if (acwr < 0.85) phase = "Base";
      else if (acwr < 1.15) phase = "Build";
      else if (acwr < 1.4) phase = "Peak";
      else phase = "Overload Risk";
    }

    // Weight (latest non-null)
    const latestWeightRow = [...wellness].reverse().find((w) => w.weight != null);
    const weight = latestWeightRow?.weight ? safeNum(latestWeightRow.weight, 1) : null;
    const ftp = athlete.icu_ftp ?? athlete.sportSettings?.[0]?.ftp ?? null;
    const wkg = ftp && weight ? safeNum(ftp / weight, 2) : null;

    // Readiness — simplified P0–P3 ladder
    let readiness: { recommendation: string; reason: string; priority: number } = {
      recommendation: "go",
      reason: "All signals within range.",
      priority: 3,
    };
    if (fitness?.tsb != null && fitness.tsb < -25) {
      readiness = {
        recommendation: "modify",
        reason: `High accumulated fatigue — TSB ${fitness.tsb.toFixed(0)}. Reduce intensity today.`,
        priority: 2,
      };
    } else if (acwr != null && acwr > 1.5) {
      readiness = {
        recommendation: "modify",
        reason: `ACWR ${acwr.toFixed(2)} — load is climbing fast. Replace quality with easy Z2.`,
        priority: 1,
      };
    } else if (acwr != null && acwr < 0.5) {
      readiness = {
        recommendation: "go",
        reason: `Undertrained — ACWR ${acwr.toFixed(2)}. Build consistent volume.`,
        priority: 3,
      };
    }

    // Recent activities — keep up to 200 entries from the 90-day window so
    // the volume widget can chart "Last 90 days" without re-fetching.
    const recent = activities
      .sort((a, b) => b.start_date_local.localeCompare(a.start_date_local))
      .slice(0, 200)
      .map((a) => ({
        id: a.id,
        date: a.start_date_local.slice(0, 10),
        name: a.name || "Activity",
        type: a.type || "Workout",
        distance_km: a.distance ? safeNum(a.distance / 1000, 2) : null,
        duration_min: a.moving_time ? safeNum(a.moving_time / 60, 0) : null,
        tss: a.icu_training_load ?? null,
        intensity: a.icu_intensity ?? null,
        avg_hr: a.average_heartrate ?? null,
      }));

    return NextResponse.json({
      ok: true,
      synced_at: new Date().toISOString(),
      athlete: {
        id: `i${cleanId}`,
        name: athlete.name || athlete.firstname || "Athlete",
        ftp,
        lthr: athlete.icu_lthr ?? athlete.sportSettings?.[0]?.lthr ?? null,
        weight,
      },
      fitness,
      derived: { acwr, ramp_rate: rampRate, phase },
      wkg,
      readiness,
      daily_90d,
      recent_activities: recent,
      // Stub signals for the demo — Section 11 readiness ladder lives here later
      signals: {
        wellness_count: wellness.length,
        activity_count: activities.length,
        recent_28d: recentRows.length,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Network error" },
      { status: 200 }
    );
  }
}
