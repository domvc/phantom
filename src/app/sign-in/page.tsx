"use client";

import Link from "next/link";
import { useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export default function SignIn() {
  const configured = isSupabaseConfigured();
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [googlePhase, setGooglePhase] = useState<"idle" | "redirecting" | "error">("idle");
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

  async function signInWithGoogle() {
    setGooglePhase("redirecting");
    setError(null);
    const sb = getSupabase();
    if (!sb) {
      setError("Auth isn't configured yet — running in demo mode.");
      setGooglePhase("error");
      return;
    }
    const { error: authError } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (authError) {
      setError(authError.message);
      setGooglePhase("error");
    }
    // On success the browser navigates to Google's consent screen — no need to
    // unset the redirecting state, the page is unmounting.
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-20">
      <div className="w-full max-w-sm">
        <Link href="/" className="font-bold tracking-tight text-[15px] block text-center mb-10">
          <span className="font-medium">my</span><span className="font-black tracking-[-0.02em] text-accent">GOAT</span>
        </Link>
        <div className="bg-surface border border-border-soft rounded-lg p-8">
          <h1 className="text-2xl font-bold tracking-tight mb-1">Welcome back</h1>
          <p className="text-[13px] text-text-muted mb-7">
            {configured
              ? "We'll email you a magic link. Click it and you're in — no password to remember."
              : "Sign in to your MyGOAT account."}
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
                <div className="space-y-3">
                  {/* Google OAuth */}
                  <button
                    type="button"
                    onClick={signInWithGoogle}
                    disabled={googlePhase === "redirecting"}
                    className="w-full flex items-center justify-center gap-2.5 px-5 py-2.5 bg-bg border border-border hover:border-accent text-text text-[13px] font-semibold rounded-md transition disabled:opacity-50"
                  >
                    <GoogleGlyph />
                    {googlePhase === "redirecting" ? "Redirecting…" : "Continue with Google"}
                  </button>

                  {/* Divider */}
                  <div className="flex items-center gap-3 my-1">
                    <div className="flex-1 h-px bg-border-soft" />
                    <span className="text-[10px] uppercase tracking-[0.16em] text-text-muted font-bold">
                      or
                    </span>
                    <div className="flex-1 h-px bg-border-soft" />
                  </div>

                  {/* Magic link */}
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
                      {phase === "sending" ? "Sending…" : "Email me a magic link"}
                    </button>
                    {error && (
                      <p className="text-[12px] text-modify mt-1">⚠️ {error}</p>
                    )}
                  </form>
                </div>
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

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 9.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 3.18 29.93 1 24 1 15.4 1 7.96 5.93 4.34 13.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}
