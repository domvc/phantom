import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  getServiceRoleAdmin,
  readStravaEnv,
  verifyState,
} from "@/lib/stravaServer";

export const runtime = "edge";

function errorRedirect(origin: string, code: string) {
  const url = new URL("/dashboard/settings", origin);
  url.searchParams.set("strava", "error");
  url.searchParams.set("reason", code);
  return NextResponse.redirect(url);
}

function successRedirect(origin: string) {
  const url = new URL("/dashboard/settings", origin);
  url.searchParams.set("strava", "connected");
  return NextResponse.redirect(url);
}

/**
 * Strava redirects the browser here after the user authorises. We swap the
 * code for tokens, identify the user via the signed `state`, upsert tokens
 * in the `strava_tokens` table, then bounce back to settings.
 */
export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;
  const env = readStravaEnv();
  if (!env) return errorRedirect(origin, "not_configured");

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const stravaError = url.searchParams.get("error");
  if (stravaError) return errorRedirect(origin, `strava_${stravaError}`);
  if (!code || !state) return errorRedirect(origin, "missing_code_or_state");

  const verified = await verifyState(state, env.stateSecret);
  if (!verified) return errorRedirect(origin, "bad_state");

  const admin = getServiceRoleAdmin();
  if (!admin) return errorRedirect(origin, "no_supabase");

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(env, code);
  } catch {
    return errorRedirect(origin, "token_exchange_failed");
  }

  const athlete = tokens.athlete;
  if (!athlete?.id) return errorRedirect(origin, "no_athlete");

  const expiresAt = new Date(tokens.expires_at * 1000).toISOString();
  const athleteName = [athlete.firstname, athlete.lastname]
    .filter(Boolean)
    .join(" ")
    .trim() || athlete.username || null;

  const { error: upsertErr } = await admin
    .from("strava_tokens")
    .upsert(
      {
        user_id: verified.userId,
        athlete_id: athlete.id,
        athlete_name: athleteName,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        scope: tokens.scope ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (upsertErr) return errorRedirect(origin, "store_failed");

  return successRedirect(origin);
}
