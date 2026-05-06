import { NextRequest, NextResponse } from "next/server";
import {
  deauthorizeStrava,
  getServiceRoleAdmin,
  verifyBearer,
} from "@/lib/stravaServer";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const auth = await verifyBearer(req.headers.get("authorization"));
  if (!auth) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = getServiceRoleAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Server missing SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    );
  }

  // Best-effort: revoke at Strava, then delete the row regardless.
  const { data: row } = await admin
    .from("strava_tokens")
    .select("access_token")
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (row?.access_token) {
    await deauthorizeStrava(row.access_token);
  }

  await admin.from("strava_tokens").delete().eq("user_id", auth.userId);

  return NextResponse.json({ ok: true });
}
