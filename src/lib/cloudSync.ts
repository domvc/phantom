/**
 * Two-way sync between localStorage UserState and Supabase.
 *
 * Pattern: localStorage is the canonical fast cache. Supabase is the
 * source-of-truth across devices. On sign-in we hydrate localStorage from
 * Supabase. On every setUserState call we debounce-flush to Supabase so the
 * cloud catches up without blocking the UI.
 *
 * No-op gracefully when Supabase isn't configured.
 */
import { getSupabase, isSupabaseConfigured } from "./supabase";
import { getUserState, setUserState, type UserState } from "./storage";

const FLUSH_DEBOUNCE_MS = 1500;

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let lastSyncedAt = 0;

/** Push localStorage state to Supabase (debounced). Caller must already hold a session. */
export function scheduleCloudFlush() {
  if (!isSupabaseConfigured() || typeof window === "undefined") return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushNow();
  }, FLUSH_DEBOUNCE_MS);
}

async function flushNow() {
  const sb = getSupabase();
  if (!sb) return;

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return;

  const state = getUserState();
  const { error } = await sb
    .from("user_state")
    .upsert(
      {
        user_id: user.id,
        state,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    // Don't surface — sync errors are logged for debugging but shouldn't break the UI.
    // The local copy is still authoritative.
    console.warn("[cloudSync] flush failed:", error.message);
    return;
  }
  lastSyncedAt = Date.now();
}

/**
 * Pull state from Supabase and hydrate localStorage. Returns the fetched state
 * (or null if no row, or null if not configured / not signed in).
 */
export async function hydrateFromCloud(): Promise<UserState | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const { data, error } = await sb
    .from("user_state")
    .select("state, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) return null;

  const cloudState = data.state as UserState;

  // If the cloud state is non-empty, replace local. Otherwise keep local
  // (this is the first sign-in on a new account — we'll push local up next flush).
  if (cloudState && Object.keys(cloudState).length > 0) {
    if (typeof window !== "undefined") {
      localStorage.setItem("phantomcoach:user", JSON.stringify(cloudState));
    }
    return cloudState;
  }

  // First sign-in on a new account — push the local state up so it's persisted.
  const localState = getUserState();
  if (Object.keys(localState).length > 0) {
    scheduleCloudFlush();
  }
  return localState;
}

/** Return current Supabase user (or null). */
export async function getSupabaseUser() {
  const sb = getSupabase();
  if (!sb) return null;
  const {
    data: { user },
  } = await sb.auth.getUser();
  return user;
}

/** Convenience wrapper: write local + schedule cloud flush. */
export function writeAndSync(patch: Partial<UserState>) {
  setUserState(patch);
  scheduleCloudFlush();
}

export function getLastCloudSyncedAt(): number {
  return lastSyncedAt;
}
