import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

const ADMIN_EMAIL = "djvcarter@gmail.com";

type StateBlob = {
  raceGoal?: unknown;
  races?: unknown[];
  trainingPrefs?: unknown;
  athleteNotes?: unknown;
  plan?: unknown;
  synced?: unknown;
  sessionFeedbacks?: unknown[];
  reconciliations?: unknown[];
};

type UserRow = {
  id: string;
  email: string | null;
  provider: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  hasRace: boolean;
  hasTrainingPrefs: boolean;
  hasAthleteNotes: boolean;
  hasPlan: boolean;
  hasSync: boolean;
  feedbackCount: number;
  reconciliationCount: number;
  furthestStep: string;
  stateUpdatedAt: string | null;
};

function deriveStep(s: StateBlob | null): string {
  if (!s) return "1. Signed up";
  if ((s.sessionFeedbacks?.length ?? 0) > 0 || (s.reconciliations?.length ?? 0) > 0)
    return "7. Logged real session";
  if (s.synced) return "6. Connected Intervals.icu";
  if (s.plan) return "5. Generated plan";
  if (s.athleteNotes) return "4. Completed onboarding chat";
  if (s.trainingPrefs) return "3. Set training prefs";
  if (s.raceGoal || (s.races && s.races.length > 0)) return "2. Set race goal";
  return "1. Signed up";
}

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !serviceKey || !anonKey) {
    return NextResponse.json(
      { error: "Server missing Supabase env vars (URL / SERVICE_ROLE / ANON)" },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });

  // Verify the caller using anon client + their bearer token.
  const verifier = createClient(url, anonKey);
  const { data: userData, error: verifyErr } = await verifier.auth.getUser(token);
  if (verifyErr || !userData?.user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
  if (userData.user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  // Service-role client — bypasses RLS, can list auth users.
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: usersResp, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) {
    return NextResponse.json({ error: `listUsers failed: ${listErr.message}` }, { status: 500 });
  }

  const { data: states, error: stateErr } = await admin
    .from("user_state")
    .select("user_id, state, updated_at");
  if (stateErr) {
    return NextResponse.json(
      { error: `user_state read failed: ${stateErr.message}` },
      { status: 500 }
    );
  }

  const stateMap = new Map<string, { state: StateBlob | null; updated_at: string | null }>();
  for (const row of states ?? []) {
    stateMap.set(row.user_id, {
      state: (row.state as StateBlob) ?? null,
      updated_at: row.updated_at ?? null,
    });
  }

  const rows: UserRow[] = (usersResp.users ?? []).map((u) => {
    const entry = stateMap.get(u.id);
    const s = entry?.state ?? null;
    return {
      id: u.id,
      email: u.email ?? null,
      provider: u.app_metadata?.provider ?? null,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      hasRace: Boolean(s?.raceGoal || (s?.races && s.races.length > 0)),
      hasTrainingPrefs: Boolean(s?.trainingPrefs),
      hasAthleteNotes: Boolean(s?.athleteNotes),
      hasPlan: Boolean(s?.plan),
      hasSync: Boolean(s?.synced),
      feedbackCount: s?.sessionFeedbacks?.length ?? 0,
      reconciliationCount: s?.reconciliations?.length ?? 0,
      furthestStep: deriveStep(s),
      stateUpdatedAt: entry?.updated_at ?? null,
    };
  });

  // Newest first.
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const total = rows.length;
  const funnel = {
    signedUp: total,
    setRace: rows.filter((r) => r.hasRace).length,
    setTrainingPrefs: rows.filter((r) => r.hasTrainingPrefs).length,
    completedNotes: rows.filter((r) => r.hasAthleteNotes).length,
    generatedPlan: rows.filter((r) => r.hasPlan).length,
    connectedSync: rows.filter((r) => r.hasSync).length,
    loggedSession: rows.filter((r) => r.feedbackCount > 0 || r.reconciliationCount > 0).length,
  };

  return NextResponse.json({ ok: true, total, funnel, users: rows });
}
