"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { hydrateFromCloud } from "@/lib/cloudSync";
import { getUserState } from "@/lib/storage";

/**
 * Magic-link callback. Supabase parses the URL fragment automatically
 * (detectSessionInUrl: true in the client), so we just wait for the session
 * to land, hydrate state, then redirect based on onboarding status.
 */
export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      router.replace("/sign-in");
      return;
    }

    const sb = getSupabase();
    if (!sb) {
      router.replace("/sign-in");
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function finish() {
      const {
        data: { user },
      } = await sb!.auth.getUser();
      if (cancelled) return;

      if (!user) {
        setError("Sign-in didn't complete. Please try again.");
        return;
      }

      await hydrateFromCloud();
      if (cancelled) return;

      const state = getUserState();
      if (state.onboardingComplete) {
        router.replace("/dashboard");
      } else {
        router.replace("/onboarding");
      }
    }

    // Wait briefly for Supabase to process the URL hash
    timeoutId = setTimeout(finish, 600);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [router]);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-20">
      <div className="w-full max-w-sm text-center">
        {error ? (
          <>
            <h1 className="text-xl font-bold mb-2">Sign-in error</h1>
            <p className="text-[13px] text-text-muted mb-5">{error}</p>
            <Link href="/sign-in" className="text-accent font-semibold text-[13px] hover:underline">
              Try again →
            </Link>
          </>
        ) : (
          <>
            <div className="size-3 rounded-full bg-accent animate-pulse mx-auto mb-4" />
            <p className="text-[13px] text-text-muted">Signing you in…</p>
          </>
        )}
      </div>
    </main>
  );
}
