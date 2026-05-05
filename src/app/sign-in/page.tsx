"use client";

import Link from "next/link";
import { useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export default function SignIn() {
  const configured = isSupabaseConfigured();
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setPhase("sending");
    setError(null);

    const sb = getSupabase();
    if (!sb) {
      setError("Auth isn't configured yet — running in demo mode.");
      setPhase("error");
      return;
    }

    const { error: authError } = await sb.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (authError) {
      setError(authError.message);
      setPhase("error");
      return;
    }
    setPhase("sent");
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-20">
      <div className="w-full max-w-sm">
        <Link href="/" className="font-bold tracking-tight text-[15px] block text-center mb-10">
          phantom<span className="text-accent">coach</span>
        </Link>
        <div className="bg-surface border border-border-soft rounded-lg p-8">
          <h1 className="text-2xl font-bold tracking-tight mb-1">Welcome back</h1>
          <p className="text-[13px] text-text-muted mb-7">
            {configured
              ? "We'll email you a magic link. Click it and you're in — no password to remember."
              : "Sign in to your Phantomcoach account."}
          </p>

          {configured ? (
            <>
              {phase === "sent" ? (
                <div className="rounded-md border border-go/30 bg-go-soft p-5 text-center">
                  <p className="text-[13px] font-semibold text-go mb-1">Check your inbox.</p>
                  <p className="text-[12px] text-text-mid">
                    We sent a sign-in link to <strong>{email}</strong>. Open it on this device.
                  </p>
                </div>
              ) : (
                <form onSubmit={sendMagicLink} className="space-y-3">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    className="w-full px-3 py-2.5 bg-bg border border-border rounded-md text-[13px] focus:outline-none focus:border-accent transition"
                  />
                  <button
                    type="submit"
                    disabled={phase === "sending"}
                    className="w-full px-5 py-2.5 bg-accent hover:bg-accent-h disabled:opacity-50 text-white text-[13px] font-semibold rounded-md transition"
                  >
                    {phase === "sending" ? "Sending…" : "Send magic link"}
                  </button>
                  {error && (
                    <p className="text-[12px] text-modify mt-2">⚠️ {error}</p>
                  )}
                </form>
              )}
            </>
          ) : (
            <div className="rounded-md border border-dashed border-border bg-bg p-6 text-center">
              <p className="text-[12px] text-text-muted">
                Auth not configured yet. Demo mode active — your data lives in this browser only.
              </p>
              <Link
                href="/onboarding"
                className="inline-block mt-4 px-5 py-2.5 bg-accent hover:bg-accent-h text-white text-[12.5px] font-semibold rounded-md transition"
              >
                Continue to demo
              </Link>
            </div>
          )}
        </div>
        <p className="text-center text-[12px] text-text-muted mt-5">
          New here?{" "}
          <Link href="/onboarding" className="text-accent font-semibold hover:underline">
            Start free trial
          </Link>
        </p>
      </div>
    </main>
  );
}
