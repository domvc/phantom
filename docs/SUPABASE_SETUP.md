# Supabase setup — enable cloud auth + state sync

The app ships with all the auth + sync code in place, but it's gated behind two
env vars. Until you set them, the app runs in **demo mode** (localStorage only,
no sign-in, data confined to a single browser).

To turn on cross-device persistence and proper sign-in, follow these steps once.

---

## 1. Create the Supabase project

1. Go to <https://supabase.com> → **New project**
2. Pick a name (e.g. `phantomcoach`), a region close to most users (UK = London / Frankfurt), and a strong DB password
3. Wait ~2 min for the project to spin up

## 2. Run the schema migration

In the Supabase dashboard for your new project: **SQL Editor → New query**, paste
this in, hit Run:

```sql
-- Single row per user containing the entire UserState blob.
-- Keeps the schema flexible — no need to migrate when fields are added/removed
-- in storage.ts. RLS ensures one user can never read another's row.

create table public.user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_state enable row level security;

create policy "Users can read own state"
  on public.user_state
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own state"
  on public.user_state
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own state"
  on public.user_state
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index user_state_updated_at_idx on public.user_state(updated_at desc);
```

You should see "Success. No rows returned." — the table is ready.

## 3. Configure auth (magic link)

Magic-link sign-in is enabled by default on new Supabase projects, so usually
nothing to do. To verify:

1. **Authentication → Providers** — confirm "Email" is enabled
2. **Authentication → URL Configuration**:
   - **Site URL**: `https://cerulean-sable-ea6de1.netlify.app` (your Netlify URL)
   - **Redirect URLs**: add the same URL with `/auth/callback` appended:
     `https://cerulean-sable-ea6de1.netlify.app/auth/callback`
   - Add `http://localhost:3000/auth/callback` too if you want local dev to work
3. (Optional) **Authentication → Email Templates → Magic Link**: customise the
   email if you want it on-brand. Default works fine to start.

## 4. Grab the API credentials

1. **Project Settings → API**
2. Copy two values:
   - **Project URL** (looks like `https://xxxxxxxxxxxx.supabase.co`)
   - **anon public** key (a long JWT-looking string — this is safe to expose to
     the browser, RLS protects the data)

## 5. Add them to Netlify

In your Netlify site dashboard:

1. **Site configuration → Environment variables → Add a variable**
2. Add **two** variables:
   - Key: `NEXT_PUBLIC_SUPABASE_URL`, Value: the Project URL from step 4
   - Key: `NEXT_PUBLIC_SUPABASE_ANON_KEY`, Value: the anon key from step 4
3. (Both can be in "All deploy contexts" — they're meant for the browser)
4. **Deploys → Trigger deploy → Clear cache and deploy site**

Wait for the deploy to go green.

## 6. Verify

1. Visit `https://cerulean-sable-ea6de1.netlify.app/sign-in`
2. The page should now show an email input + "Send magic link" button (instead
   of the "Auth not configured yet" placeholder)
3. Enter your email, hit send, click the link in your inbox
4. You'll bounce through `/auth/callback` and land on `/onboarding` (or
   `/dashboard` if you'd already onboarded)
5. Settings page now has an "Account → Sign out" panel
6. Sign in on a second device → your race goal, plan, and history follow you

If something doesn't fire, check the browser DevTools console (the cloud sync
logs `[cloudSync]` warnings) and confirm the env vars actually made it into the
build (Netlify shows them in the build log header).

---

## Notes for later

- **Local dev**: add the same two env vars to `.env.local` and `npm run dev`
  picks them up. The redirect URL in Supabase needs `http://localhost:3000/auth/callback`
  for local sign-in to work.
- **Schema flexibility**: the `state` column is JSONB so you can add fields to
  `UserState` in `storage.ts` without any migration. Old rows just get the
  defaults from `getUserState()`.
- **Migrating away from this scheme**: if you eventually split state into
  proper tables (recommended once paid users grow past a few thousand), the
  JSONB blob is easy to ETL — `select state -> 'plan' from user_state` etc.
- **Clerk**: `@clerk/nextjs` is in package.json but unused. If you want Clerk
  for auth + Supabase for storage, you'll need to map the Clerk JWT to a
  Supabase session — not hard but adds moving parts. Supabase auth alone is
  simpler for now.
