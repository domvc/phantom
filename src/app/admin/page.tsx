"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

type UserRow = {
  id: string;
  email: string | null;
  provider: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  hasRace: boolean;
  hasTrainingPrefs: boolean;
  hasAthleteNotes: boolean;
  hasPlan: boolean;
  hasSync: boolean;
  feedbackCount: number;
  reconciliationCount: number;
  furthestStep: string;
  stateUpdatedAt: string | null;
};

type Funnel = {
  signedUp: number;
  setRace: number;
  setTrainingPrefs: number;
  completedNotes: number;
  generatedPlan: number;
  connectedSync: number;
  loggedSession: number;
};

type Phase = "loading" | "unauthorised" | "ready" | "error";

const ADMIN_EMAIL = "djvcarter@gmail.com";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(iso);
}

function pct(n: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((n / total) * 100)}%`;
}

export default function AdminPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isSupabaseConfigured()) {
        setPhase("unauthorised");
        return;
      }
      const sb = getSupabase();
      if (!sb) {
        setPhase("unauthorised");
        return;
      }
      const { data: sessionData } = await sb.auth.getSession();
      const session = sessionData.session;
      if (!session || session.user.email !== ADMIN_EMAIL) {
        if (!cancelled) setPhase("unauthorised");
        return;
      }

      try {
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        if (cancelled) return;
        setFunnel(json.funnel);
        setUsers(json.users);
        setTotal(json.total);
        setPhase("ready");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Unknown error");
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (phase === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-[13px] text-text-muted">Loading admin…</p>
      </main>
    );
  }

  if (phase === "unauthorised") {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-20">
        <div className="text-center max-w-sm">
          <p className="text-[14px] font-semibold mb-2">Not authorised.</p>
          <p className="text-[13px] text-text-muted mb-5">
            Admin is restricted to the site owner.
          </p>
          <Link
            href="/"
            className="text-[13px] text-accent font-semibold hover:underline"
          >
            ← Back to home
          </Link>
        </div>
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-20">
        <div className="text-center max-w-sm">
          <p className="text-[14px] font-semibold mb-2 text-modify">Admin failed to load.</p>
          <p className="text-[12px] text-text-muted mb-2 break-all">{error}</p>
          <p className="text-[12px] text-text-muted">
            Check that <code>SUPABASE_SERVICE_ROLE_KEY</code> is set in Netlify env vars.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 px-6 py-10 max-w-6xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
          <p className="text-[13px] text-text-muted mt-1">
            {total} {total === 1 ? "user" : "users"} signed up.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-[13px] text-accent font-semibold hover:underline"
        >
          ← Dashboard
        </Link>
      </div>

      {/* Funnel */}
      {funnel && (
        <section className="mb-10">
          <h2 className="text-[11px] uppercase tracking-[0.18em] font-bold text-text-muted mb-3">
            Funnel
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
            {[
              { label: "Signed up", value: funnel.signedUp },
              { label: "Set race", value: funnel.setRace },
              { label: "Set prefs", value: funnel.setTrainingPrefs },
              { label: "Notes done", value: funnel.completedNotes },
              { label: "Plan made", value: funnel.generatedPlan },
              { label: "Synced", value: funnel.connectedSync },
              { label: "Logged session", value: funnel.loggedSession },
            ].map((stage, i) => (
              <div
                key={stage.label}
                className="bg-surface border border-border-soft rounded-md p-3"
              >
                <p className="text-[10px] uppercase tracking-[0.14em] text-text-muted font-semibold">
                  {i + 1}. {stage.label}
                </p>
                <p className="text-xl font-bold tracking-tight mt-1">{stage.value}</p>
                <p className="text-[11px] text-text-muted mt-0.5">
                  {pct(stage.value, funnel.signedUp)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Users table */}
      <section>
        <h2 className="text-[11px] uppercase tracking-[0.18em] font-bold text-text-muted mb-3">
          Users
        </h2>
        <div className="bg-surface border border-border-soft rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="bg-bg border-b border-border-soft">
                <tr className="text-left">
                  <th className="px-3 py-2 font-semibold">Email</th>
                  <th className="px-3 py-2 font-semibold">Provider</th>
                  <th className="px-3 py-2 font-semibold">Signed up</th>
                  <th className="px-3 py-2 font-semibold">Last seen</th>
                  <th className="px-3 py-2 font-semibold">Furthest step</th>
                  <th className="px-3 py-2 font-semibold text-right">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-border-soft last:border-0">
                    <td className="px-3 py-2 font-medium">{u.email || "—"}</td>
                    <td className="px-3 py-2 text-text-muted">{u.provider || "—"}</td>
                    <td className="px-3 py-2 text-text-muted">{fmtDate(u.createdAt)}</td>
                    <td className="px-3 py-2 text-text-muted">
                      {fmtRelative(u.lastSignInAt)}
                    </td>
                    <td className="px-3 py-2">{u.furthestStep}</td>
                    <td className="px-3 py-2 text-right text-text-muted">
                      {u.feedbackCount + u.reconciliationCount}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-text-muted">
                      No users yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
