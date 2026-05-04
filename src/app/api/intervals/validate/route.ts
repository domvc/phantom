import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { apiKey, athleteId } = await req.json().catch(() => ({}));

  if (!apiKey || !athleteId) {
    return NextResponse.json(
      { ok: false, error: "Missing apiKey or athleteId" },
      { status: 400 }
    );
  }

  const cleanId = String(athleteId).trim().replace(/^i/i, "");
  const auth = Buffer.from(`API_KEY:${apiKey}`).toString("base64");
  const url = `https://intervals.icu/api/v1/athlete/i${cleanId}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
      cache: "no-store",
    });

    if (res.status === 401 || res.status === 403) {
      return NextResponse.json(
        { ok: false, error: "Invalid API key for this athlete." },
        { status: 200 }
      );
    }
    if (res.status === 404) {
      return NextResponse.json(
        { ok: false, error: "Athlete not found. Check your athlete ID." },
        { status: 200 }
      );
    }
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Intervals.icu returned ${res.status}` },
        { status: 200 }
      );
    }

    const data = await res.json();
    return NextResponse.json({
      ok: true,
      athleteId: `i${cleanId}`,
      athleteName: data.name || data.firstname || "Athlete",
      icu_ftp: data.icu_ftp ?? null,
      icu_weight: data.icu_weight ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Network error" },
      { status: 200 }
    );
  }
}
