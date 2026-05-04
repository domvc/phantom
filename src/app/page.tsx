import Link from "next/link";
import {
  PhantomLogo,
  CheckIcon,
  BikeIcon,
  RunIcon,
  SwimIcon,
  StrengthIcon,
  RestIcon,
  PulseIcon,
  MountainIcon,
  SparkIcon,
  LeafIcon,
  GarminWordmark,
  StravaWordmark,
  ZwiftWordmark,
  WahooWordmark,
  TrainingPeaksWordmark,
  CorosWordmark,
  AppleWatchWordmark,
} from "@/components/icons";

export default function Home() {
  return (
    <div className="flex flex-col flex-1">
      <Header />
      <Hero />
      <SocialProof />
      <Features />
      <Sports />
      <WhatsInside />
      <HowItWorks />
      <Pricing />
      <FAQ />
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="absolute top-0 inset-x-0 z-40">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="text-white">
          <PhantomLogo size={20} />
        </Link>
        <nav className="hidden sm:flex items-center gap-7 text-[13px] text-white/60">
          <a href="#inside" className="hover:text-white transition">What&apos;s inside</a>
          <a href="#how" className="hover:text-white transition">How it works</a>
          <a href="#pricing" className="hover:text-white transition">Pricing</a>
          <a href="#faq" className="hover:text-white transition">FAQ</a>
        </nav>
        <div className="flex items-center gap-3">
          <Link
            href="/sign-in"
            className="text-[13px] text-white/60 hover:text-white transition hidden sm:block"
          >
            Sign in
          </Link>
          <Link
            href="/onboarding"
            className="px-4 py-2 bg-accent hover:bg-accent-h text-white text-[12.5px] font-semibold rounded-md transition"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative bg-black text-white overflow-hidden">
      {/* Background layer stack */}
      <div className="absolute inset-0">
        {/* Deep base + atmospheric gradient */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 78% 18%, rgba(193,68,14,0.42) 0%, rgba(193,68,14,0.10) 35%, transparent 60%), radial-gradient(ellipse at 12% 85%, rgba(193,68,14,0.18) 0%, transparent 50%), linear-gradient(180deg, #0B0B0C 0%, #050506 100%)",
          }}
        />
        {/* Treated photograph layer — graded into brand orange via blend */}
        <div
          className="absolute inset-0 opacity-[0.22] mix-blend-screen"
          style={{
            backgroundImage:
              "url(https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=2000&q=70)",
            backgroundSize: "cover",
            backgroundPosition: "center 30%",
            filter: "grayscale(0.85) contrast(1.15) sepia(0.55) hue-rotate(-12deg) saturate(1.6)",
          }}
        />
        {/* Vignette */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.55) 100%)",
          }}
        />
        {/* Grain */}
        <svg
          aria-hidden
          className="absolute inset-0 w-full h-full opacity-[0.10] mix-blend-overlay"
          viewBox="0 0 1200 800"
          preserveAspectRatio="none"
        >
          <filter id="grainFilter">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.85"
              numOctaves="2"
              stitchTiles="stitch"
            />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#grainFilter)" />
        </svg>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-32 pb-24 lg:pt-36 lg:pb-32">
        <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-10 lg:gap-12 items-center">
          {/* Left: copy block */}
          <div>
            <h1 className="font-black tracking-[-0.045em] leading-[0.94] text-[3rem] sm:text-[3.8rem] lg:text-[4.8rem]">
              <span className="block text-white">Train like an elite athlete</span>
              <span className="block text-accent">like never before.</span>
            </h1>

            <p className="mt-9 text-lg sm:text-xl text-white/85 leading-relaxed max-w-xl">
              <span className="text-white font-semibold">
                Connect your data. Set your goal. Get the plan that gets you
                there.
              </span>{" "}
              Phantomcoach is built on decades of sport science, hundreds of
              elite training protocols, and the live signal from your wearables
              — calibrated to you, recalibrated every day.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-3 sm:items-center">
              <Link
                href="/onboarding"
                className="px-6 py-3.5 bg-accent hover:bg-accent-h text-white text-sm font-semibold rounded-md transition shadow-[0_8px_30px_-10px_rgba(193,68,14,0.6)] inline-flex items-center justify-center gap-2"
              >
                Build my plan · 5 minutes
                <span aria-hidden>→</span>
              </Link>
              <Link
                href="#how"
                className="px-6 py-3.5 border border-white/15 hover:border-white/35 text-white/80 hover:text-white text-sm font-semibold rounded-md transition text-center"
              >
                See how it works
              </Link>
            </div>

            <p className="mt-6 text-xs text-white/45">
              14 days free. £5 a month after. The coaching elites pay £400 a
              month for.
            </p>
          </div>

          {/* Right: layered card deck (desktop) / stacked (mobile) */}
          <CardDeck />
        </div>
      </div>

      {/* Bottom hairline transition */}
      <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </section>
  );
}

function CardDeck() {
  return (
    <>
      {/* Mobile: clean vertical stack */}
      <div className="lg:hidden grid gap-4">
        <BikeWorkoutCard />
        <VerdictCard />
        <FeedbackCard />
      </div>

      {/* Desktop: fanned deck */}
      <div className="hidden lg:block relative h-[540px] -mr-8">
        {/* Card 1 — Bike workout, behind, tilted left */}
        <div
          className="absolute top-[55px] left-0 w-[290px] h-[440px] z-10 transition-transform duration-500 hover:-translate-y-2"
          style={{ transform: "rotate(-7deg)" }}
        >
          <BikeWorkoutCard />
        </div>

        {/* Card 2 — Verdict, centre, slightly forward, dominant */}
        <div
          className="absolute top-[10px] left-[110px] w-[310px] h-[470px] z-30 transition-transform duration-500 hover:-translate-y-2"
          style={{ transform: "rotate(1.5deg)" }}
        >
          <VerdictCard />
        </div>

        {/* Card 3 — Feedback, in front, tilted right */}
        <div
          className="absolute top-[70px] left-[230px] w-[290px] h-[440px] z-20 transition-transform duration-500 hover:-translate-y-2"
          style={{ transform: "rotate(8deg)" }}
        >
          <FeedbackCard />
        </div>
      </div>
    </>
  );
}

function CardShell({
  children,
  emphasised,
  topStrip,
}: {
  children: React.ReactNode;
  emphasised?: boolean;
  topStrip: React.ReactNode;
}) {
  return (
    <div className="relative h-full">
      {emphasised && (
        <div className="absolute -inset-4 bg-accent/25 blur-3xl opacity-70 pointer-events-none" />
      )}
      <div
        className={`relative h-full flex flex-col bg-[#FAFAF7] text-text rounded-xl border border-white/10 overflow-hidden ${
          emphasised
            ? "shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] md:scale-[1.025] md:z-10"
            : "shadow-[0_20px_50px_-20px_rgba(0,0,0,0.5)]"
        }`}
      >
        <div className="px-5 py-3 bg-white border-b border-border-soft flex items-center justify-between">
          {topStrip}
        </div>
        {children}
      </div>
    </div>
  );
}

function CardContextLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9.5px] uppercase tracking-[0.16em] text-text-muted font-bold">
      {children}
    </div>
  );
}

function CardLiveBadge({
  tone = "go",
  label = "Live",
}: {
  tone?: "go" | "accent" | "muted";
  label?: string;
}) {
  const colour =
    tone === "go" ? "text-go" : tone === "accent" ? "text-accent" : "text-text-muted";
  const dot =
    tone === "go" ? "bg-go" : tone === "accent" ? "bg-accent" : "bg-text-muted";
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold ${colour}`}>
      <span className={`size-1.5 rounded-full ${dot} animate-pulse`} />
      {label}
    </span>
  );
}

function CardRibbon({
  items,
}: {
  items: { label: string; value: string; tone?: "default" | "go" | "accent" }[];
}) {
  return (
    <div className="px-5 py-2.5 mt-auto bg-surface border-t border-border-soft flex items-center justify-between text-[9.5px] uppercase tracking-[0.1em] text-text-muted font-semibold gap-2">
      {items.map((it) => (
        <span key={it.label} className="flex items-baseline gap-1">
          {it.label}{" "}
          <strong
            className={`font-bold ${
              it.tone === "go"
                ? "text-go"
                : it.tone === "accent"
                ? "text-accent"
                : "text-text"
            }`}
          >
            {it.value}
          </strong>
        </span>
      ))}
    </div>
  );
}

function VerdictCard() {
  return (
    <CardShell
      emphasised
      topStrip={
        <>
          <CardContextLabel>Today&apos;s call · Tue 6 May</CardContextLabel>
          <CardLiveBadge tone="go" />
        </>
      }
    >
      <div className="p-5 flex-1 flex flex-col">
        <div className="text-[5rem] font-black tracking-[-0.05em] leading-none text-go">
          GO
        </div>
        <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted font-bold mt-2 mb-4">
          — Clear to train
        </div>
        <p className="text-[12.5px] text-text-mid leading-relaxed mb-4">
          TSB +6 after Sunday&apos;s recovery day. ACWR 1.08 — load is climbing
          healthily. The window is open.
        </p>
        <div className="mt-auto pt-3 border-t border-border-soft">
          <div className="text-[9px] uppercase tracking-[0.14em] text-accent font-bold mb-1">
            Today&apos;s session · AM
          </div>
          <div className="text-[13.5px] font-bold text-text tracking-tight">
            VO₂ intervals · 60 min
          </div>
          <div className="text-[11px] text-text-mid mt-0.5 leading-snug">
            6 × 3min @ 240W · 3min easy between
          </div>
        </div>
      </div>
      <CardRibbon
        items={[
          { label: "CTL", value: "62" },
          { label: "ATL", value: "56" },
          { label: "TSB", value: "+6", tone: "go" },
          { label: "ACWR", value: "1.08" },
        ]}
      />
    </CardShell>
  );
}

function BikeWorkoutCard() {
  return (
    <CardShell
      topStrip={
        <>
          <CardContextLabel>Workout · Bike · AM</CardContextLabel>
          <span className="inline-flex items-center gap-1 text-text-muted">
            <BikeIcon size={14} />
          </span>
        </>
      }
    >
      <div className="p-5 flex-1 flex flex-col">
        <div className="text-[10px] uppercase tracking-[0.12em] text-accent font-bold mb-2">
          Sweet-spot intervals
        </div>
        <div className="text-[24px] font-black text-text tracking-tight leading-none mb-1">
          75 min
        </div>
        <div className="text-[11px] uppercase tracking-[0.08em] text-text-muted font-semibold mb-4">
          Z3-Z4 · 88-94% FTP
        </div>
        <div className="space-y-1.5 text-[11.5px] text-text-mid leading-snug mb-4">
          <div className="flex items-baseline gap-2">
            <span className="text-text-muted font-mono text-[10px] w-10">
              15min
            </span>
            <span>Warm-up · Z2 progression</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-accent font-mono text-[10px] w-10 font-bold">
              3×12
            </span>
            <span className="text-text font-semibold">
              @ 200W (90% FTP) · 5min Z2 between
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-text-muted font-mono text-[10px] w-10">
              10min
            </span>
            <span>Cool-down · Z1</span>
          </div>
        </div>
        <div className="mt-auto pt-3 border-t border-border-soft text-[10.5px] text-text-muted leading-snug">
          HR ceiling 162. Cadence 90+ throughout.
        </div>
      </div>
      <CardRibbon
        items={[
          { label: "TSS", value: "92" },
          { label: "IF", value: "0.88" },
          { label: "kJ", value: "780" },
        ]}
      />
    </CardShell>
  );
}

function FeedbackCard() {
  return (
    <CardShell
      topStrip={
        <>
          <CardContextLabel>Coach reading · 12m ago</CardContextLabel>
          <CardLiveBadge tone="accent" label="AI" />
        </>
      }
    >
      <div className="p-5 flex-1 flex flex-col">
        <div className="text-[10px] uppercase tracking-[0.12em] text-go font-bold mb-2">
          ✓ Strong session
        </div>
        <div className="text-[20px] font-black text-text tracking-tight leading-tight mb-3">
          You held the work.
        </div>
        <p className="text-[12.5px] text-text-mid leading-relaxed mb-4">
          5 of 6 intervals at target watts. The drop on rep 6 lined up with HR
          drift, not power loss — that&apos;s heat, not fitness.
        </p>
        <div className="mt-auto pt-3 border-t border-border-soft">
          <div className="text-[9px] uppercase tracking-[0.14em] text-accent font-bold mb-1">
            Carrying forward
          </div>
          <div className="text-[12px] text-text leading-snug">
            Adding 2min to the main set on Thursday. Same wattage. Hydration
            note logged.
          </div>
        </div>
      </div>
      <CardRibbon
        items={[
          { label: "Avg", value: "234W" },
          { label: "TSS", value: "81" },
          { label: "IF", value: "0.94" },
          { label: "RPE", value: "8" },
        ]}
      />
    </CardShell>
  );
}

function SocialProof() {
  const logos = [
    <GarminWordmark key="garmin" />,
    <TrainingPeaksWordmark key="tp" />,
    <StravaWordmark key="strava" />,
    <ZwiftWordmark key="zwift" />,
    <WahooWordmark key="wahoo" />,
    <CorosWordmark key="coros" />,
    <AppleWatchWordmark key="apple" />,
  ];
  return (
    <section className="border-y border-border-soft bg-surface">
      <div className="max-w-6xl mx-auto px-6 py-9">
        <div className="text-[10px] uppercase tracking-[0.16em] text-text-muted font-semibold text-center mb-5">
          Reads the apps you already train on
        </div>
        <div className="flex flex-wrap gap-x-10 gap-y-5 items-center justify-center text-text-muted">
          {logos.map((l, i) => (
            <span key={i} className="hover:text-text transition-colors">
              {l}
            </span>
          ))}
        </div>
        <div className="mt-7 pt-5 border-t border-border-soft flex flex-wrap gap-x-6 gap-y-2 items-center justify-center text-[10.5px] uppercase tracking-[0.14em] text-text-muted font-semibold">
          <span>Built by athletes</span>
          <span className="text-border">·</span>
          <span>Grounded in peer-reviewed sport science</span>
          <span className="text-border">·</span>
          <span>Trained on elite coaching protocols</span>
        </div>
      </div>
    </section>
  );
}

function Features() {
  const items = [
    {
      title: "Your data, every signal",
      body: "Connect your wearables and training apps. Phantomcoach reads activities, fitness scores, sleep, HRV, and weight — every signal that informs today's call.",
      visual: (
        <div className="flex items-center gap-2 flex-wrap">
          {["Garmin", "Strava", "Intervals.icu", "Wahoo", "Apple Health"].map(
            (s, i) => (
              <span
                key={s}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-md ${
                  i < 3
                    ? "bg-accent-soft border border-accent-mid text-accent"
                    : "bg-bg border border-border-soft text-text-muted"
                }`}
              >
                {s}
              </span>
            )
          )}
        </div>
      ),
    },
    {
      title: "Science, not opinion",
      body: "Every recommendation traces to published research — polarised intensity (Seiler), block periodisation (Issurin), ACWR injury thresholds, lactate-based protocols (Olbrecht). The frameworks elite coaches build careers on.",
      visual: (
        <div className="space-y-2 text-[11.5px]">
          {[
            "Polarised 80/20 intensity",
            "ACWR < 1.3 injury ceiling",
            "Block periodisation",
            "Carb fuelling: 60-90g/hr",
          ].map((s) => (
            <div key={s} className="flex items-center gap-2 text-text-mid">
              <span className="size-1 rounded-full bg-accent" />
              <span>{s}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: "Action, every morning",
      body: "Open the app. See the call. Train the session — with watts, paces, and HR ranges from your numbers. Ask anything. The plan reshapes when life shifts. Outcomes are made daily.",
      visual: (
        <div className="space-y-2 text-[11.5px]">
          {[
            { d: "Wk 1", w: "Base — aerobic foundation" },
            { d: "Wk 8", w: "Build — threshold blocks" },
            { d: "Wk 14", w: "Peak — race-specific" },
            { d: "Wk 16", w: "Taper · race day" },
          ].map((m) => (
            <div key={m.d} className="flex items-center gap-3">
              <span className="text-[10px] uppercase tracking-wide text-text-muted font-semibold w-10">
                {m.d}
              </span>
              <span className="text-text-mid">{m.w}</span>
            </div>
          ))}
        </div>
      ),
    },
  ];
  return (
    <section className="max-w-6xl mx-auto w-full px-6 py-24">
      <div className="max-w-2xl mb-14">
        <div className="text-[11px] uppercase tracking-[0.12em] text-accent font-semibold mb-3">
          Three pillars
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-text">
          Data. Science. Action. Three things make goals real.
        </h2>
      </div>
      <div className="grid md:grid-cols-3 gap-5">
        {items.map((it, i) => (
          <div
            key={i}
            className="bg-surface border border-border-soft rounded-lg p-7 flex flex-col gap-6 hover:border-border transition"
          >
            <div className="min-h-[110px]">{it.visual}</div>
            <div>
              <h3 className="text-base font-bold text-text mb-2 tracking-tight">
                {it.title}
              </h3>
              <p className="text-[13px] text-text-mid leading-relaxed">{it.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Sports() {
  const sports = [
    {
      icon: <RunIcon size={20} className="text-accent" />,
      name: "Running",
      body: "5K to ultra. Threshold work, long runs, race-pace progressions, easy days that stay easy.",
    },
    {
      icon: <BikeIcon size={20} className="text-accent" />,
      name: "Cycling",
      body: "FTP-based zones. Sweet spot, VO₂, anaerobic intervals. Ride durations matched to your weekly load.",
    },
    {
      icon: <SwimIcon size={20} className="text-accent" />,
      name: "Swimming",
      body: "CSS-based pace targets. Technique-led drills. Race-specific aerobic-anaerobic mixes for tri or open water.",
    },
    {
      icon: <StrengthIcon size={20} className="text-accent" />,
      name: "Strength & conditioning",
      body: "Hypertrophy or power-focused. Sequenced around endurance load — durability without compromising legs.",
    },
    {
      icon: <RestIcon size={20} className="text-accent" />,
      name: "Mobility",
      body: "Sport-specific stretching and recovery work. Short, daily, designed to keep you doing the hard stuff.",
    },
  ];
  return (
    <section className="border-y border-border-soft bg-surface">
      <div className="max-w-6xl mx-auto w-full px-6 py-24">
        <div className="max-w-2xl mb-14">
          <div className="text-[11px] uppercase tracking-[0.12em] text-accent font-semibold mb-3">
            One coach, every discipline
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-text">
            Five sports. One programme. Sequenced to compound.
          </h2>
          <p className="mt-4 text-[14px] text-text-mid leading-relaxed">
            Most apps specialise in one thing. Phantomcoach reads your week as
            integrated load — running, cycling, swimming, strength, mobility —
            sequenced so each session multiplies the next.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sports.map((s) => (
            <div
              key={s.name}
              className="bg-bg border border-border-soft rounded-lg p-6 hover:border-border transition"
            >
              <div className="size-9 rounded-md bg-accent-soft border border-accent-mid flex items-center justify-center mb-4">
                {s.icon}
              </div>
              <h3 className="text-[14.5px] font-bold text-text mb-1.5 tracking-tight">
                {s.name}
              </h3>
              <p className="text-[12.5px] text-text-mid leading-relaxed">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhatsInside() {
  const layers = [
    {
      n: "01",
      icon: <PulseIcon size={18} className="text-accent" />,
      title: "The research",
      body: "Peer-reviewed sport science — lactate physiology, ACWR injury thresholds, polarised intensity distribution, periodisation models, fuelling protocols.",
    },
    {
      n: "02",
      icon: <MountainIcon size={18} className="text-accent" />,
      title: "The methodologies",
      body: "Block periodisation (Issurin). Polarised training (Seiler). Reverse-linear (Bompa & Buzzichelli). Lactate-based protocols (Olbrecht). The frameworks elite coaches build careers on.",
    },
    {
      n: "03",
      icon: <StrengthIcon size={18} className="text-accent" />,
      title: "The workout libraries",
      body: "Proven session structures from elite coaching frameworks — interval sets, threshold blocks, race-specific bricks — mapped to your current fitness state.",
    },
    {
      n: "04",
      icon: <LeafIcon size={18} className="text-accent" />,
      title: "The fuelling protocols",
      body: "Race-day and training nutrition. Calibrated to your weight, intensity, training load, and body composition goal.",
    },
    {
      n: "05",
      icon: <SparkIcon size={18} className="text-accent" />,
      title: "The intelligence layer",
      body: "Anthropic's most capable model — applied specifically to your Garmin / Strava / Intervals.icu data. The model is one ingredient. The curation is the moat.",
    },
  ];
  return (
    <section id="inside" className="bg-bg">
      <div className="max-w-6xl mx-auto w-full px-6 py-24">
        <div className="grid lg:grid-cols-[5fr_7fr] gap-x-12 gap-y-10">
          <div>
            <div className="text-[11px] uppercase tracking-[0.12em] text-accent font-semibold mb-3">
              What&apos;s inside
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-text mb-5">
              Not a chat wrapper.
              <br />
              <span className="text-accent">A coaching system.</span>
            </h2>
            <p className="text-[14px] text-text-mid leading-relaxed mb-5">
              Years of curation, layered into one brain. Phantomcoach knows
              what&apos;s been proven — then reads your data and applies it.
            </p>
            <p className="text-[13px] text-text-muted leading-relaxed">
              The result: coaching that doesn&apos;t guess. Decisions that hold up
              to scrutiny. Plans that reshape when life shifts. Output an elite
              coach would sign off on.
            </p>
          </div>

          <div className="space-y-2.5">
            {layers.map((l) => (
              <div
                key={l.n}
                className="bg-surface border border-border-soft rounded-lg p-5 flex gap-4 items-start hover:border-border transition"
              >
                <div className="size-9 rounded-md bg-accent-soft border border-accent-mid flex items-center justify-center flex-shrink-0">
                  {l.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-3 mb-1">
                    <span className="text-[10px] font-bold tracking-[0.1em] text-text-muted">
                      {l.n}
                    </span>
                    <h3 className="text-[14px] font-bold text-text tracking-tight">
                      {l.title}
                    </h3>
                  </div>
                  <p className="text-[12.5px] text-text-mid leading-relaxed">
                    {l.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Connect your data",
      body: "Link Garmin, Strava, or Intervals.icu. Six months of activities, fitness, wellness, recovery — read on demand. No manual logging.",
    },
    {
      n: "02",
      title: "Set your race",
      body: "Pick the event. Pick the date. Add what's around it — body comp targets, strength goals, holidays, niggles. Every constraint is load-bearing.",
    },
    {
      n: "03",
      title: "Get the plan",
      body: "Six weeks or twelve months — your build runs from race day backwards. Run, bike, swim, strength, mobility — phased, sequenced, calibrated to today.",
    },
    {
      n: "04",
      title: "Train with intent",
      body: "Open Phantomcoach each morning. Read the call. Train the session. Ask anything. The plan adapts as your data does.",
    },
  ];
  return (
    <section id="how" className="border-y border-border-soft bg-surface">
      <div className="max-w-6xl mx-auto w-full px-6 py-24">
        <div className="max-w-2xl mb-14">
          <div className="text-[11px] uppercase tracking-[0.12em] text-accent font-semibold mb-3">
            How it works
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-text">
            Four steps. Under five minutes. Then you train.
          </h2>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {steps.map((s) => (
            <div key={s.n} className="bg-bg border border-border-soft rounded-lg p-7">
              <div className="font-bold text-3xl text-accent tracking-tight mb-4">
                {s.n}
              </div>
              <h3 className="text-base font-bold text-text mb-2 tracking-tight">
                {s.title}
              </h3>
              <p className="text-[13px] text-text-mid leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const features = [
    "Daily readiness call — GO, MODIFY, REST, with reasons",
    "A plan calibrated to your timeline — six weeks to twelve months",
    "Run, bike, swim, strength, mobility — sequenced as one programme",
    "Adapts when life shifts — illness, travel, missed sessions",
    "Coaching chat — your data, in context, on every reply",
    "Performance and body composition tracking with projections",
    "Workouts exportable to Garmin, Wahoo, Zwift, TrainingPeaks",
    "Sync from Garmin, Strava, Intervals.icu — no manual logging",
  ];
  return (
    <section id="pricing" className="max-w-6xl mx-auto w-full px-6 py-24">
      <div className="max-w-2xl mx-auto text-center mb-12">
        <div className="text-[11px] uppercase tracking-[0.12em] text-accent font-semibold mb-3">
          Pricing
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-text">
          Elite frameworks. Coffee money.
        </h2>
        <p className="mt-4 text-[14px] text-text-mid leading-relaxed">
          A human coach is £200 to £600 a month. Phantomcoach is £5. Same
          frameworks. Faster. Always on.
        </p>
      </div>
      <div className="max-w-md mx-auto bg-surface border-2 border-accent rounded-lg p-9">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-5xl font-bold tracking-tight text-text">£5</span>
          <span className="text-text-muted text-sm">/ month</span>
        </div>
        <div className="text-[12px] text-text-muted mb-6">
          14 days free · cancel anytime
        </div>
        <ul className="space-y-3 mb-8 text-[13px] text-text-mid">
          {features.map((f, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="size-4 rounded-full bg-accent-soft border border-accent-mid text-accent flex items-center justify-center flex-shrink-0 mt-0.5">
                <CheckIcon size={9} />
              </span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <Link
          href="/onboarding"
          className="block text-center px-5 py-3 bg-accent hover:bg-accent-h text-white text-[13px] font-semibold rounded-md transition"
        >
          Start 14-day free trial
        </Link>
      </div>
    </section>
  );
}

function FAQ() {
  const qs = [
    {
      q: "Which sports does Phantomcoach handle?",
      a: "Run, bike, swim, strength & conditioning, mobility — one coach, one programme, sequenced together. 5K to Ironman, marathon PB to body composition target. The coaching brain plans them all.",
    },
    {
      q: "How long is my plan?",
      a: "As long as your event needs. Six weeks for a sharpening block. Twenty-four weeks for an Ironman. Nine months for a marathon PB. The build runs from race day backwards. No fixed templates.",
    },
    {
      q: "What data sources do you support?",
      a: "Garmin, Strava, and Intervals.icu at launch. Phantomcoach reads activities, training-load metrics, sleep, HRV, weight — refreshes on demand. Apple Health and Wahoo are next on the list.",
    },
    {
      q: "Where does the science come from?",
      a: "The frameworks elite coaches build careers on. Seiler's polarised intensity model. Issurin block periodisation. Bompa & Buzzichelli reverse-linear. Olbrecht lactate-based protocols. ACWR injury risk modelling. Banister fitness-fatigue. Each one peer-reviewed, proven, and encoded into the coaching layer that reads your data.",
    },
    {
      q: "Is this just a Claude wrapper?",
      a: "No. The model is one ingredient. The moat is the curation — research, methodologies, workout libraries, fuelling protocols, and the coaching heuristics layered on top. Anthropic's Claude is the intelligence engine that applies all of it to your data. Years of work. Five layers. One coaching brain.",
    },
    {
      q: "What happens if I miss a session, get sick, or life happens?",
      a: "The plan rebuilds. Skip a session and the coming week reshapes around what you actually did. Tell the coach about a holiday or a niggle and the affected weeks reshape — displaced quality recuperates where you have capacity. No guilt. No resets.",
    },
    {
      q: "How is this different from TrainerRoad, Final Surge, or other plan apps?",
      a: "Most apps give you a structured library — pick a plan, follow it. Phantomcoach builds your plan from scratch using your training data, your race goal, your athlete notes, and your feedback after every session. Coaching, not a library.",
    },
    {
      q: "Does this replace a human coach?",
      a: "For most age-groupers chasing a half ironman, marathon PB, or strength target — yes. For elites with sponsor obligations, biomechanical complexity, or in-person form coaching needs — no, but it's a strong second opinion at a fraction of the cost.",
    },
    {
      q: "Where does my data go?",
      a: "Connections are encrypted at rest. Phantomcoach reads on demand, sends relevant slices to Anthropic for coaching responses, and stores the latest snapshot for fast loads. Delete your account and it's gone. No archives. No resale.",
    },
    {
      q: "Can I cancel?",
      a: "One click in settings. Your data stays for 30 days. After that it's deleted.",
    },
  ];
  return (
    <section id="faq">
      <div className="max-w-3xl mx-auto px-6 py-24">
        <div className="text-center mb-12">
          <div className="text-[11px] uppercase tracking-[0.12em] text-accent font-semibold mb-3">
            FAQ
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-text">
            Common questions.
          </h2>
        </div>
        <div className="space-y-1">
          {qs.map((it, i) => (
            <details
              key={i}
              className="group bg-surface border border-border-soft rounded-lg p-5 hover:border-border transition"
            >
              <summary className="flex items-center justify-between cursor-pointer list-none font-semibold text-[14px] text-text gap-4">
                <span>{it.q}</span>
                <span className="text-text-muted group-open:rotate-45 transition-transform text-xl leading-none flex-shrink-0">
                  +
                </span>
              </summary>
              <p className="mt-3 text-[13px] text-text-mid leading-relaxed">{it.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border-soft mt-auto bg-surface">
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="text-[14px]">
            <PhantomLogo size={18} />
          </div>
          <div className="text-[11px] text-text-muted mt-1.5">
            © 2026 Phantomcoach · Built by athletes · Powered by Claude
          </div>
        </div>
        <div className="flex gap-5 text-[12px] text-text-muted">
          <a href="#" className="hover:text-text transition">Privacy</a>
          <a href="#" className="hover:text-text transition">Terms</a>
          <a href="mailto:hello@phantomcoach.app" className="hover:text-text transition">
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
