"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getUserState, setUserState } from "@/lib/storage";
import { PhantomLogo, SyncIcon } from "@/components/icons";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  useEffect(() => {
    const s = getUserState();
    if (!s.onboardingComplete) {
      router.replace("/onboarding");
      return;
    }
    setReady(true);
  }, [router]);

  async function handleSync() {
    const s = getUserState();
    if (!s.intervals) {
      setSyncMsg("Not connected");
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
      } else {
        setUserState({ synced: data });
        setSyncMsg("✓ Data synced");
        // Force re-render of children consuming synced data
        window.dispatchEvent(new Event("phantomcoach:synced"));
        setTimeout(() => setSyncMsg(null), 2500);
      }
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : "Network error");
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

  return (
    <div className="flex flex-1 min-h-0 h-screen overflow-hidden">
      <aside className="w-48 flex-shrink-0 bg-surface border-r border-border-soft flex flex-col h-screen">
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
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-[12.5px] transition ${
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
              className="w-full flex items-center gap-2.5 px-3 py-2 bg-accent hover:bg-accent-h disabled:opacity-50 text-white text-[12px] font-semibold rounded-md transition"
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
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">{children}</div>
    </div>
  );
}

const iconBase = "w-3.5 h-3.5 flex-shrink-0";
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
