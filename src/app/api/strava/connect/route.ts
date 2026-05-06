import { NextRequest, NextResponse } from "next/server";
import {
  buildAuthorizeUrl,
  readStravaEnv,
  signState,
  verifyBearer,
} from "@/lib/stravaServer";

export const runtime = "edge";

/**
 * Returns a Strava authorize URL for the calling user. The browser then
 * navigates to this URL — we never redirect with the bearer token in the URL.
 */
export async function POST(req: NextRequest) {
  const env = readStravaEnv();
  if (!env) {
    return NextResponse.json(
      {
        error:
          "Strava is not configured on this deploy (missing STRAVA_CLIENT_ID / SECRET / REDIRECT_URI / STATE_SECRET).",
      },
      { status: 500 }
    );
  }

  const auth = await verifyBearer(req.headers.get("authorization"));
  if (!auth) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const state = await signState(auth.userId, env.stateSecret);
  const url = buildAuthorizeUrl(env, state);
  return NextResponse.json({ url });
}
