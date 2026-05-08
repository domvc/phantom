"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getUserState, setUserState } from "@/lib/storage";
import { useCloudSync } from "@/lib/useCloudSync";
import { runReconciliationsAfterSync } from "@/lib/reconcile";
import { PhantomLogo, SyncIcon } from "@/components/icons";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const cloud = useCloudSync();
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!cloud.ready) return;

    // Auth guard: if Supabase is configured but the user isn't signed in,
    // bounce to /sign-in. (Demo mode without Supabase: skip the guard.)
    if (cloud.configured && !cloud.user) {
      router.replace("/sign-in");
      return;
    }

    const s = getUserState();
    if (!s.onboardingComplete) {
      router.replace("/onboarding");
      return;
    }
    setReady(true);
  }, [router, cloud.ready, cloud.configured, cloud.user]);

  // Close mobile drawer on route change so it doesn't persist after navigation.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Close drawer on Escape key.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  async function handleSync() {
    const s = getUserState();
    if (!s.intervals) {
      setSyncMsg("Not connected");
      setTimeout(() => setSyncMsg(null), 2500);
      return;
    }
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/intervals/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: s.intervals.apiKey,
          athleteId: s.intervals.athleteId,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setSyncMsg(data.error || "Sync failed");
        setTimeout(() => setSyncMsg(null), 3500);
      } else {
        setUserState({ synced: data });
        setSyncMsg("✓ Data synced");
        // Force re-render of children consuming synced data
        window.dispatchEvent(new Event("phantomcoach:synced"));
        setTimeout(() => setSyncMsg(null), 2500);

        // Background reconciliation: classify any new activities against the plan.
        runReconciliationsAfterSync()
          .then((result) => {
            if (result.newReconciliations.length > 0) {
              window.dispatchEvent(new Event("phantomcoach:reconciliation-changed"));
            }
          })
          .catch(() => {
            /* swallow — reconciliation is best-effort */
          });
      }
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : "Network error");
      setTimeout(() => setSyncMsg(null), 3500);
    } finally {
      setSyncing(false);
    }
  }

  if (!ready) {
    return (
      <main className="flex flex-1 items-center justify-center text-[13px] text-text-muted">
        Loading…
      </main>
    );
  }

  const nav = [
    { href: "/dashboard", label: "Dashboard", icon: dashIcon },
    { href: "/dashboard/calendar", label: "Calendar", icon: calIcon },
    { href: "/dashboard/progress", label: "Progress", icon: progIcon },
    { href: "/dashboard/settings", label: "Settings", icon: setIcon },
  ];

  const sidebarInner = (
    <>
      <div className="px-5 py-5 border-b border-border-soft">
        <Link href="/" className="text-[14px]">
          <PhantomLogo size={18} />
        </Link>
        <div className="text-[10px] text-text-muted mt-1.5 ml-[26px]">
          Demo workspace
        </div>
      </div>
      <nav className="flex-1 p-2.5 flex flex-col gap-0.5 overflow-y-auto">
        {nav.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2.5 md:py-2 rounded-md text-[13.5px] md:text-[12.5px] transition ${
                active
                  ? "bg-accent-soft text-accent font-semibold"
                  : "text-text-muted hover:bg-surface-2 hover:text-text"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
        <div className="mt-3 pt-3 border-t border-border-soft">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="w-full flex items-center justify-center gap-2.5 px-3 py-2.5 md:py-2 bg-accent hover:bg-accent-h disabled:opacity-50 text-white text-[13px] md:text-[12px] font-semibold rounded-md transition"
          >
            <SyncIcon size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : "Sync data"}
          </button>
          {syncMsg && (
            <div className="mt-1.5 text-[10.5px] text-center text-text-muted">
              {syncMsg}
            </div>
          )}
        </div>
      </nav>
      {/* Auth status footer */}
      <div className="px-3 py-2.5 border-t border-border-soft text-[10px] text-text-muted">
        {!cloud.configured ? (
          <span title="Data lives in this browser only — see SUPABASE_SETUP.md to enable cloud sync">
            Demo mode · local only
          </span>
        ) : cloud.user ? (
          <span className="truncate block" title={cloud.user.email ?? undefined}>
            ☁ {cloud.user.email}
          </span>
        ) : (
          <span>Not signed in</span>
        )}
      </div>
    </>
  );

  return (
    <div className="flex flex-1 min-h-0 h-screen overflow-hidden">
      {/* Mobile top app bar (visible <md). Sticky so content scrolls underneath. */}
      <header className="md:hidden fixed top-0 inset-x-0 z-30 h-14 bg-surface border-b border-border-soft flex items-center justify-between px-3 pr-4">
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          className="size-10 flex items-center justify-center rounded-md hover:bg-surface-2 active:bg-surface-2 text-text"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <line x1="3" y1="7" x2="21" y2="7" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="17" x2="21" y2="17" />
          </svg>
        </button>
        <Link href="/" className="text-[13px] flex items-center">
          <PhantomLogo size={17} />
        </Link>
        <button
          onClick={handleSync}
          disabled={syncing}
          aria-label="Sync data"
          className="size-10 flex items-center justify-center rounded-md text-accent hover:bg-accent-soft disabled:opacity-50 transition"
        >
          <SyncIcon size={18} className={syncing ? "animate-spin" : ""} />
        </button>
      </header>

      {/* Mobile sync toast (no sidebar to live in) */}
      {syncMsg && (
        <div className="md:hidden fixed top-16 left-1/2 -translate-x-1/2 z-40 bg-text text-bg text-[12px] font-semibold px-3 py-1.5 rounded-full shadow-lg">
          {syncMsg}
        </div>
      )}

      {/* Mobile drawer backdrop */}
      {drawerOpen && (
        <button
          aria-label="Close menu"
          onClick={() => setDrawerOpen(false)}
          className="md:hidden fixed inset-0 z-40 bg-text/40 backdrop-blur-[1px] animate-[fade-in_0.15s_ease-out]"
        />
      )}

      {/* Sidebar — drawer on mobile, fixed column on md+ */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-64 md:w-48 flex-shrink-0 bg-surface border-r border-border-soft flex flex-col h-screen transition-transform duration-200 ease-out md:transition-none ${
          drawerOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {sidebarInner}
      </aside>

      {/* Main content — top-padded on mobile to clear the fixed app bar */}
      <div className="flex-1 flex flex-col overflow-hidden pt-14 md:pt-0">
        {children}
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

const iconBase = "w-4 h-4 md:w-3.5 md:h-3.5 flex-shrink-0";
const dashIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={iconBase}>
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);
const calIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={iconBase}>
    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);
const progIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={iconBase}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);
const setIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={iconBase}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);
