"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearUserState,
  getUserState,
  setUserState,
  type AthleteNotes,
  type RaceGoal,
  type UserState,
} from "@/lib/storage";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  PulseIcon,
  SparkIcon,
  MountainIcon,
  LeafIcon,
  FlagIcon,
  DotIcon,
} from "@/components/icons";

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserState>({});
  const [notes, setNotes] = useState<AthleteNotes>({});
  const [notesDirty, setNotesDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    const s = getUserState();
    setUser(s);
    setNotes(s.athleteNotes || {});
  }, []);

  function patchNotes(p: Partial<AthleteNotes>) {
    setNotes((n) => ({ ...n, ...p }));
    setNotesDirty(true);
  }

  function saveNotes() {
    const updated = { ...notes, updatedAt: new Date().toISOString() };
    setUserState({ athleteNotes: updated });
    setNotes(updated);
    setNotesDirty(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  }

  async function handleReset() {
    const sb = getSupabase();
    const signedIn = sb ? (await sb.auth.getUser()).data.user : null;
    const msg = signedIn
      ? "This wipes your stored plan, race goal, and history (cloud + local) and restarts onboarding. Continue?"
      : "This wipes your demo state and restarts onboarding. Continue?";
    if (!confirm(msg)) return;
    if (sb && signedIn) {
      // Clear the cloud row too so it can't rehydrate stale state on the next page load
      await sb.from("user_state").delete().eq("user_id", signedIn.id);
    }
    clearUserState();
    router.push("/onboarding");
  }

  async function handleSignOut() {
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
    clearUserState();
    router.push("/sign-in");
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-3xl">
      <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-semibold mb-2">
        Account
      </div>
      <h1 className="text-3xl font-bold tracking-tight mb-8">Settings</h1>

      {/* Connections */}
      <Section title="Connections">
        <ConnectionCard
          icon={<PulseIcon size={18} className="text-accent" />}
          name="Intervals.icu"
          desc="Training data, activities, wellness, and fitness metrics"
          meta={
            user.intervals
              ? `${user.intervals.athleteName} · ${user.intervals.athleteId} · connected ${new Date(
                  user.intervals.connectedAt
                ).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
              : "Not connected"
          }
          status={user.intervals ? "connected" : null}
        />
        <ConnectionCard
          icon={<SparkIcon size={18} className="text-accent" />}
          name="Anthropic Claude AI"
          desc="Powers your personal coaching assistant"
          meta="Server-side · key managed by Phantomcoach"
          status="active"
        />
        <ConnectionCard
          icon={<MountainIcon size={18} className="text-text-muted" />}
          name="Strava"
          desc="Secondary activity source — coming soon"
          meta="On the roadmap"
          status={null}
        />
        <ConnectionCard
          icon={<LeafIcon size={18} className="text-text-muted" />}
          name="MyFitnessPal"
          desc="Nutrition logging — pull macros + intake to compare against targets"
          meta="Coming soon · in the meantime, log adherence on the dashboard"
          status={null}
        />
      </Section>

      {/* Athlete Notes — the always-on context */}
      <Section title="Athlete Notes">
        <div className="bg-surface border border-border-soft rounded-md p-5">
          <p className="text-[12px] text-text-muted mb-4 leading-relaxed">
            Free-text context the coach sees on every reply. Edit any time — life changes
            (holidays, injuries, new goals) belong here. Updates apply to the next message.
          </p>
          <div className="space-y-4">
            <NoteField
              label="Weekly training pattern"
              hint="When you can train, when you can't"
              value={notes.weeklyPattern || ""}
              onChange={(v) => patchNotes({ weeklyPattern: v })}
              placeholder="e.g. 5 days/week — AM weekdays + long sessions weekends. No Wed evenings."
            />
            <NoteField
              label="Holidays / travel / busy periods"
              hint="Anything in the next 6 months we should plan around"
              value={notes.upcomingDisruptions || ""}
              onChange={(v) => patchNotes({ upcomingDisruptions: v })}
              placeholder="e.g. Lisbon Aug 15–22 — short runs only. Wedding weekend 12 July."
            />
            <NoteField
              label="Secondary goals"
              hint="Body comp, strength, look-and-feel — beyond the race"
              value={notes.secondaryGoals || ""}
              onChange={(v) => patchNotes({ secondaryGoals: v })}
              placeholder="e.g. Drop to 11% body fat by August. Keep 2× strength sessions/week."
            />
            <NoteField
              label="Constraints / things to avoid"
              hint="Injuries, niggles, methodology preferences"
              value={notes.constraints || ""}
              onChange={(v) => patchNotes({ constraints: v })}
              placeholder="e.g. Left achilles flares on hills — keep volume gradual."
            />
          </div>
          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={saveNotes}
              disabled={!notesDirty}
              className="px-4 py-2 bg-accent hover:bg-accent-h disabled:opacity-30 disabled:cursor-not-allowed text-white text-[12px] font-semibold rounded-md transition"
            >
              Save changes
            </button>
            {savedFlash && (
              <span className="text-[11.5px] text-go font-semibold">✓ Saved</span>
            )}
            {notes.updatedAt && !notesDirty && (
              <span className="text-[11px] text-text-muted ml-auto">
                Last updated{" "}
                {new Date(notes.updatedAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
        </div>
      </Section>

      {/* Race goal */}
      <Section title="Race Goals">
        <RaceGoalEditor user={user} onSaved={() => setUser(getUserState())} />
      </Section>

      {/* Account / sign-out (only shown when auth is configured) */}
      {isSupabaseConfigured() && (
        <Section title="Account">
          <div className="bg-surface border border-border-soft rounded-md p-5">
            <div className="font-semibold text-[13px] mb-1">Sign out</div>
            <div className="text-[12px] text-text-muted mb-4">
              Your training plan, race goal, and history stay safe in the cloud — sign back in
              from any device to continue.
            </div>
            <button
              onClick={handleSignOut}
              className="px-4 py-2 bg-bg border border-border hover:border-accent hover:text-accent text-[12px] font-semibold rounded-md transition"
            >
              Sign out
            </button>
          </div>
        </Section>
      )}

      {/* Danger zone */}
      <Section title="Demo controls">
        <div className="bg-surface border border-border-soft rounded-md p-5">
          <div className="font-semibold text-[13px] mb-1">Reset demo state</div>
          <div className="text-[12px] text-text-muted mb-4">
            Wipes local state{isSupabaseConfigured() ? " (cloud copy untouched)" : ""} and sends
            you back to onboarding. Useful for testing the flow with different inputs.
          </div>
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-bg border border-modify text-modify hover:bg-modify-soft text-[12px] font-semibold rounded-md transition"
          >
            Reset & restart onboarding
          </button>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted font-semibold mb-3 pb-2 border-b border-border-soft">
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function NoteField({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[12px] font-semibold text-text">{label}</span>
        {hint && <span className="text-[10.5px] text-text-muted">{hint}</span>}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 bg-bg border border-border rounded-md text-[13px] focus:outline-none focus:border-accent transition resize-none"
      />
    </label>
  );
}

function ConnectionCard({
  icon,
  name,
  desc,
  meta,
  status,
}: {
  icon: React.ReactNode;
  name: string;
  desc: string;
  meta: string;
  status: "connected" | "active" | null;
}) {
  return (
    <div className="bg-surface border border-border-soft rounded-md p-4 flex items-center gap-4">
      <div className="size-10 rounded-md bg-bg border border-border-soft flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[13px] text-text">{name}</div>
        <div className="text-[11.5px] text-text-muted">{desc}</div>
        <div className="text-[11px] text-text-mid mt-1">{meta}</div>
      </div>
      {status && (
        <span
          className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap inline-flex items-center gap-1.5 ${
            status === "connected"
              ? "text-go bg-go-soft"
              : "text-accent bg-accent-soft"
          }`}
        >
          <DotIcon size={6} />
          {status === "connected" ? "Connected" : "Active"}
        </span>
      )}
    </div>
  );
}

const RACE_TYPES: RaceGoal["type"][] = [
  "5K",
  "10K",
  "HM",
  "Marathon",
  "Ultra",
  "Olympic Tri",
  "Half Ironman",
  "Ironman",
  "Other",
];

function RaceGoalEditor({
  user,
  onSaved,
}: {
  user: UserState;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RaceGoal>(
    user.raceGoal ?? {
      name: "",
      type: "Half Ironman",
      date: "",
      targetTime: "",
      raceDetails: "",
      notes: "",
    }
  );
  const [savedFlash, setSavedFlash] = useState(false);

  // Reset draft when entering edit mode (so editing always starts from current)
  function startEdit() {
    setDraft(
      user.raceGoal ?? {
        name: "",
        type: "Half Ironman",
        date: "",
        targetTime: "",
        raceDetails: "",
        notes: "",
      }
    );
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
  }

  function save() {
    if (!draft.name || !draft.date) return;
    setUserState({ raceGoal: draft });
    setEditing(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2500);
    onSaved();
    window.dispatchEvent(new Event("phantomcoach:notes-updated"));
  }

  const showRaceDetails = draft.type === "Ultra" || draft.type === "Other";

  if (!editing) {
    if (!user.raceGoal) {
      return (
        <div className="bg-surface border border-dashed border-border rounded-md p-8 text-center text-[13px] text-text-muted">
          No race goal set —{" "}
          <button
            onClick={startEdit}
            className="text-accent font-semibold hover:underline"
          >
            add one
          </button>
        </div>
      );
    }
    return (
      <div className="bg-surface border border-border-soft rounded-md p-5 flex items-start gap-4">
        <div className="size-10 rounded-md bg-accent-soft border border-accent-mid flex items-center justify-center flex-shrink-0">
          <FlagIcon size={18} className="text-accent" />
        </div>
        <div className="flex-1">
          <div className="font-bold text-[15px] tracking-tight">
            {user.raceGoal.name}
          </div>
          <div className="text-[12px] text-text-muted mt-0.5">
            {user.raceGoal.type} ·{" "}
            {new Date(user.raceGoal.date).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            {user.raceGoal.targetTime ? ` · target ${user.raceGoal.targetTime}` : ""}
          </div>
          {user.raceGoal.raceDetails && (
            <div className="text-[12.5px] text-text-mid mt-2 leading-relaxed">
              <span className="text-text-muted">Format: </span>
              {user.raceGoal.raceDetails}
            </div>
          )}
          {savedFlash && (
            <div className="mt-2 text-[11.5px] text-go font-semibold">
              ✓ Saved — click Regenerate on the dashboard to refresh the plan
            </div>
          )}
        </div>
        <button
          onClick={startEdit}
          className="text-[12px] px-3 py-1.5 border border-border hover:border-accent hover:text-accent text-text-mid rounded-md transition"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-md p-5 space-y-4">
      <div>
        <label className="block text-[10.5px] uppercase tracking-[0.1em] text-text-muted font-bold mb-1.5">
          Race name
        </label>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className="w-full px-3 py-2 bg-bg border border-border rounded-md text-[13px] focus:outline-none focus:border-accent transition"
        />
      </div>

      <div>
        <label className="block text-[10.5px] uppercase tracking-[0.1em] text-text-muted font-bold mb-1.5">
          Race type
        </label>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {RACE_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setDraft({ ...draft, type: t })}
              className={`px-2 py-2 text-[11.5px] font-semibold rounded-md border transition ${
                draft.type === t
                  ? "bg-accent text-white border-accent"
                  : "bg-bg text-text-mid border-border hover:border-accent hover:text-accent"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {showRaceDetails && (
        <div>
          <label className="block text-[10.5px] uppercase tracking-[0.1em] text-text-muted font-bold mb-1.5">
            {draft.type === "Ultra" ? "Ultra format & distance" : "Race details"}
          </label>
          <textarea
            value={draft.raceDetails || ""}
            onChange={(e) => setDraft({ ...draft, raceDetails: e.target.value })}
            placeholder={draft.type === "Ultra" ? "e.g. Backyard ultra, 6.7km loops" : "Distance, format, terrain"}
            rows={2}
            className="w-full px-3 py-2 bg-bg border border-border rounded-md text-[13px] focus:outline-none focus:border-accent transition resize-none"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10.5px] uppercase tracking-[0.1em] text-text-muted font-bold mb-1.5">
            Race date
          </label>
          <input
            type="date"
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            className="w-full px-3 py-2 bg-bg border border-border rounded-md text-[13px] focus:outline-none focus:border-accent transition"
          />
        </div>
        <div>
          <label className="block text-[10.5px] uppercase tracking-[0.1em] text-text-muted font-bold mb-1.5">
            Target time
          </label>
          <input
            type="text"
            value={draft.targetTime}
            onChange={(e) => setDraft({ ...draft, targetTime: e.target.value })}
            placeholder="4:45:00"
            className="w-full px-3 py-2 bg-bg border border-border rounded-md font-mono text-[13px] focus:outline-none focus:border-accent transition"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={save}
          disabled={!draft.name || !draft.date}
          className="px-4 py-2 bg-accent hover:bg-accent-h disabled:opacity-30 text-white text-[12px] font-semibold rounded-md transition"
        >
          Save race goal
        </button>
        <button
          onClick={cancel}
          className="px-4 py-2 border border-border hover:border-accent text-text-mid hover:text-accent text-[12px] font-semibold rounded-md transition"
        >
          Cancel
        </button>
        <span className="text-[11px] text-text-muted ml-auto">
          You&apos;ll need to Regenerate your plan after saving.
        </span>
      </div>
    </div>
  );
}
