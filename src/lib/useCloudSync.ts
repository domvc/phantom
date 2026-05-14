"use client";

import { useEffect, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import { hydrateFromCloud, scheduleCloudFlush } from "./cloudSync";
import type { User } from "@supabase/supabase-js";

export type CloudSyncStatus = {
  /** Has the env-var-driven flag flipped on? */
  configured: boolean;
  /** Initial hydrate has finished (or skipped). UI safe to render. */
  ready: boolean;
  /** Currently signed-in user, or null if anonymous / unconfigured. */
  user: User | null;
};

/**
 * Mount this once at the top of your app shell (dashboard layout / onboarding).
 *
 * On mount: subscribes to auth changes, hydrates state from Supabase if signed in,
 * and registers a state-change listener that pushes local writes to the cloud.
 *
 * No-ops gracefully when Supabase isn't configured — the rest of the app
 * continues to work with localStorage only.
 */
export function useCloudSync(): CloudSyncStatus {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (!configured) {
      setReady(true);
      return;
    }
    const sb = getSupabase();
    if (!sb) {
      setReady(true);
      return;
    }

    let cancelled = false;

    // Listen for any local writes and push to cloud (debounced)
    const onChange = () => scheduleCloudFlush();
    window.addEventListener("phantomcoach:state-changed", onChange);

    // Read the cached session from localStorage — this is effectively
    // synchronous (no network roundtrip) so we can flip `ready` almost
    // immediately. The cloud hydrate fires in the background and dispatches
    // a state-changed event when it lands, so components re-render then.
    //
    // Previously we awaited `sb.auth.getUser()` (server-validated) AND the
    // cloud hydrate before un-gating render. That meant every layout mount
    // showed a "Loading…" flash on mobile networks while two network calls
    // ran in series. Now the user sees their cached state instantly and any
    // cloud-fresher state replaces it without blocking the UI.
    sb.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      setUser(session?.user ?? null);
      setReady(true);
      if (session?.user) {
        hydrateFromCloud().catch(() => {
          /* hydration is best-effort — local state stays authoritative */
        });
      }
    });

    // Subscribe to auth changes (sign-in / sign-out from another tab)
    const { data: sub } = sb.auth.onAuthStateChange(async (_event, session) => {
      if (cancelled) return;
      setUser(session?.user ?? null);
      if (session?.user) {
        await hydrateFromCloud();
      }
    });

    return () => {
      cancelled = true;
      window.removeEventListener("phantomcoach:state-changed", onChange);
      sub.subscription.unsubscribe();
    };
  }, [configured]);

  return { configured, ready, user };
}
