-- MyGOAT — Strava OAuth token storage
-- Run this once in Supabase → SQL Editor.

create table if not exists public.strava_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  athlete_id bigint not null,
  athlete_name text,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.strava_tokens enable row level security;

-- Users can read their own row (so the client can show "connected as ..."), but
-- never the actual tokens — we expose a view that hides them.
create or replace view public.strava_connection as
  select user_id, athlete_id, athlete_name, scope, created_at, updated_at
  from public.strava_tokens;

grant select on public.strava_connection to authenticated;

-- Direct table access: read own metadata only. Writes are service-role only.
drop policy if exists "users read own strava metadata" on public.strava_tokens;
create policy "users read own strava metadata"
  on public.strava_tokens
  for select
  using (auth.uid() = user_id);
