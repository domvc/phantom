import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleAdmin, verifyBearer } from "@/lib/stravaServer";

export const runtime = "edge";

/**
 * Returns the calling user's Strava connection metadata (no tokens).
 * Used by the settings UI to render "Connected as <athlete>" without ever
 * exposing the access/refresh tokens to the client.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyBearer(req.headers.get("authorization"));
  if (!auth) return NextResponse.json({ connected: false }, { status: 401 });

  const admin = getServiceRoleAdmin();
  if (!admin) {
    return NextResponse.json(
      { connected: false, error: "Server missing SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    );
  }

  const { data, error } = await admin
    .from("strava_tokens")
    .select("athlete_id, athlete_name, scope, created_at, updated_at")
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (error) return NextResponse.json({ connected: false, error: error.message });
  if (!data) return NextResponse.json({ connected: false });

  return NextResponse.json({
    connected: true,
    athleteId: data.athlete_id,
    athleteName: data.athlete_name,
    scope: data.scope,
    connectedAt: data.created_at,
  });
}
