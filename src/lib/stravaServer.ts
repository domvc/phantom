/**
 * Server-side Strava helpers — token verification, OAuth state HMAC,
 * and admin-client construction for token storage.
 *
 * NEVER imported from client components. Tokens never leave the server.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const STRAVA_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_DEAUTH_URL = "https://www.strava.com/oauth/deauthorize";

export const STRAVA_SCOPES = "read,activity:read_all,profile:read_all";

export type StravaTokenSet = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  scope?: string;
  athlete?: {
    id: number;
    firstname?: string;
    lastname?: string;
    username?: string;
  };
};

export type StravaEnv = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
};

export function readStravaEnv(): StravaEnv | null {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const redirectUri = process.env.STRAVA_REDIRECT_URI;
  const stateSecret = process.env.STRAVA_STATE_SECRET;
  if (!clientId || !clientSecret || !redirectUri || !stateSecret) return null;
  return { clientId, clientSecret, redirectUri, stateSecret };
}

export function getServiceRoleAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getAnonClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/** Verify a Supabase bearer token from a request and return user_id + email. */
export async function verifyBearer(
  authHeader: string | null
): Promise<{ userId: string; email: string | null } | null> {
  const token = (authHeader || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const sb = getAnonClient();
  if (!sb) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  return { userId: data.user.id, email: data.user.email ?? null };
}

// --- HMAC state signing (Web Crypto, edge-runtime safe) ----------------------

function bytesToB64Url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64UrlToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacSign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return bytesToB64Url(new Uint8Array(sig));
}

/**
 * Sign an OAuth state string carrying { userId, exp }. Format: payload.sig
 * where payload is base64url(JSON) and sig is HMAC-SHA256 of payload.
 */
export async function signState(
  userId: string,
  secret: string,
  ttlSeconds = 600
): Promise<string> {
  const payload = {
    u: userId,
    e: Math.floor(Date.now() / 1000) + ttlSeconds,
    n: crypto.randomUUID(),
  };
  const payloadB64 = bytesToB64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmacSign(secret, payloadB64);
  return `${payloadB64}.${sig}`;
}

export async function verifyState(
  state: string,
  secret: string
): Promise<{ userId: string } | null> {
  const [payloadB64, sig] = state.split(".");
  if (!payloadB64 || !sig) return null;
  const expected = await hmacSign(secret, payloadB64);
  // Constant-time compare on equal-length strings.
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const json = new TextDecoder().decode(b64UrlToBytes(payloadB64));
    const { u, e } = JSON.parse(json) as { u: string; e: number };
    if (typeof u !== "string" || typeof e !== "number") return null;
    if (Math.floor(Date.now() / 1000) > e) return null;
    return { userId: u };
  } catch {
    return null;
  }
}

// --- OAuth helpers -----------------------------------------------------------

export function buildAuthorizeUrl(env: StravaEnv, state: string): string {
  const params = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: env.redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: STRAVA_SCOPES,
    state,
  });
  return `${STRAVA_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  env: StravaEnv,
  code: string
): Promise<StravaTokenSet> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Strava token exchange failed: ${res.status} ${txt}`);
  }
  return (await res.json()) as StravaTokenSet;
}

export async function refreshAccessToken(
  env: StravaEnv,
  refreshToken: string
): Promise<StravaTokenSet> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Strava token refresh failed: ${res.status} ${txt}`);
  }
  return (await res.json()) as StravaTokenSet;
}

export async function deauthorizeStrava(accessToken: string): Promise<void> {
  // Best-effort. Strava ignores invalid tokens here.
  await fetch(STRAVA_DEAUTH_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  }).catch(() => undefined);
}
