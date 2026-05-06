# Strava integration setup

One-time steps to enable the Strava connection in MyGOAT.

## 1. Register the Strava API app

Visit https://www.strava.com/settings/api and create an application:

- **Application Name**: MyGOAT
- **Category**: Training
- **Club**: leave blank
- **Website**: `https://mygoat.coach`
- **Application Description**: AI endurance coaching that adapts to your real training.
- **Authorization Callback Domain**: `mygoat.coach`
  *(domain only — no scheme, no path. Strava limits OAuth redirects to this domain.)*

After creating, you'll see:

- **Client ID** — public-safe (e.g. `12345`)
- **Client Secret** — treat like a password

## 2. Run the SQL migration in Supabase

Open Supabase → SQL Editor → run the contents of `docs/strava_tokens.sql`. This creates the `strava_tokens` table with row-level security so each user can only read their own tokens.

## 3. Add Netlify env vars

Site configuration → Environment variables → add:

- `STRAVA_CLIENT_ID` — the numeric ID from step 1
- `STRAVA_CLIENT_SECRET` — the secret from step 1
- `STRAVA_REDIRECT_URI` — `https://mygoat.coach/api/strava/callback`
- `STRAVA_STATE_SECRET` — any long random string (used to HMAC-sign OAuth state). Generate with `openssl rand -hex 32`.

For local dev, mirror these in `.env.local` with `STRAVA_REDIRECT_URI=http://localhost:3000/api/strava/callback` and add a second Strava app (or use the same one — Strava allows the callback domain to match a parent of the actual redirect host, so `mygoat.coach` won't allow `localhost`; you'll need a separate dev app pointing at `localhost`).

## 4. Trigger a redeploy

Once env vars are saved, redeploy on Netlify so the API routes can read them.

## How it works

- User clicks **Connect Strava** → POST `/api/strava/connect` returns a signed authorize URL.
- Browser redirects to Strava → user grants `read,activity:read_all` scope.
- Strava redirects back to `/api/strava/callback?code=...&state=...` → server verifies state, swaps code for tokens, upserts into `strava_tokens` (service-role write), and clears any existing Intervals.icu connection (mutual exclusion).
- Sync calls `/api/strava/sync` which refreshes the access token if expired and pulls last 90 days of activities, mapped to the same shape `/api/intervals/sync` returns. CTL/ATL/TSB are null on Strava (we don't fabricate training-load metrics — UI shows "Connect Intervals.icu for training load" instead).
