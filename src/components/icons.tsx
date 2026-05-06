type IconProps = {
  className?: string;
  size?: number;
};

const baseProps = (size: number, className: string) => ({
  viewBox: "0 0 24 24",
  fill: "none" as const,
  width: size,
  height: size,
  className,
  "aria-hidden": true,
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

/* ─── Brand ──────────────────────────────────────────────────── */

/**
 * GoatMark — the punk-goat mascot with shades.
 *
 * Front-on stylised goat head: curled horns, big rectangular shades dominating
 * the face, slight snarl line at the muzzle, and the signature goatee. Drawn
 * in the same 24x24 line-icon vocabulary as the rest of the icon set so it
 * scales clean from 16px (favicon) to 64px+ (hero glyph).
 *
 * The shades are a filled bar (uses currentColor) — that single block of
 * solid colour is what the eye reads first, even at 16px. The horns + goatee
 * fill in the "goat" read above ~24px.
 */
export function GoatMark({ size = 22, className = "" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      className={className}
      aria-hidden
    >
      {/* Curled left horn */}
      <path d="M8.5 7 C 6.5 5, 5 3, 6 1.5 C 7 3, 8 5, 9 7" strokeWidth={1.6} />
      {/* Curled right horn */}
      <path d="M15.5 7 C 17.5 5, 19 3, 18 1.5 C 17 3, 16 5, 15 7" strokeWidth={1.6} />
      {/* Head outline (rounded snout) */}
      <path d="M8 7 C 7 11, 7 15, 9 18 C 10.5 19.5, 13.5 19.5, 15 18 C 17 15, 17 11, 16 7" />
      {/* Big shades — solid bar with bridge */}
      <rect x="7.4" y="9.5" width="3.6" height="3" rx="0.7" fill="currentColor" stroke="none" />
      <rect x="13" y="9.5" width="3.6" height="3" rx="0.7" fill="currentColor" stroke="none" />
      <line x1="11" y1="11" x2="13" y2="11" strokeWidth={1.2} />
      {/* Snarl line + nostril */}
      <path d="M10.5 16 L13.5 16" strokeWidth={1.3} />
      {/* Goatee */}
      <path d="M10.5 19.5 L12 22.5 L13.5 19.5" strokeWidth={1.5} />
    </svg>
  );
}

/**
 * GoatLogo — wordmark + mascot lock-up. The "MY" is light, "GOAT" is heavy,
 * honouring the acronym (Greatest Of All Time).
 */
export function GoatLogo({
  size = 20,
  className = "",
  variant = "duo",
}: IconProps & { variant?: "duo" | "mono" }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <GoatMark
        size={size}
        className={variant === "duo" ? "text-accent" : ""}
      />
      <span className="tracking-tight font-medium">
        my<span className="font-black tracking-[-0.02em]">GOAT</span>
      </span>
    </span>
  );
}

/* Back-compat aliases — leftover imports keep working until everything migrates. */
export const PhantomMark = GoatMark;
export const PhantomLogo = GoatLogo;

/* ─── Sport icons ───────────────────────────────────────────── */

export function BikeIcon({ size = 14, className = "" }: IconProps) {
  return (
    <svg {...baseProps(size, className)} strokeWidth={1.6}>
      <circle cx="5.5" cy="17.5" r="3.5" />
      <circle cx="18.5" cy="17.5" r="3.5" />
      <path d="M12 17.5 L8 9 L13 9 M14.5 6 L17 6 L18.5 17.5" />
      <circle cx="12" cy="6" r="0.5" fill="currentColor" />
    </svg>
  );
}

export function RunIcon({ size = 14, className = "" }: IconProps) {
  return (
    <svg {...baseProps(size, className)} strokeWidth={1.6}>
      <circle cx="14" cy="4.5" r="1.6" />
      <path d="M9 21 L11 15 L8 12 L10 8 L13 10 L17 11 M11 15 L14.5 17.5 L13 21" />
    </svg>
  );
}

export function SwimIcon({ size = 14, className = "" }: IconProps) {
  return (
    <svg {...baseProps(size, className)} strokeWidth={1.6}>
      <path d="M2 16 Q 5 14, 8 16 T 14 16 T 20 16 T 22 16" />
      <path d="M2 20 Q 5 18, 8 20 T 14 20 T 20 20 T 22 20" />
      <circle cx="17" cy="7" r="1.5" />
      <path d="M5 12 L9 9 L13 11 L18 9" />
    </svg>
  );
}

export function StrengthIcon({ size = 14, className = "" }: IconProps) {
  return (
    <svg {...baseProps(size, className)} strokeWidth={1.6}>
      <path d="M6 8 L6 16 M3 10 L3 14 M18 8 L18 16 M21 10 L21 14 M6 12 L18 12" />
    </svg>
  );
}

export function BrickIcon({ size = 14, className = "" }: IconProps) {
  return (
    <svg {...baseProps(size, className)} strokeWidth={1.6}>
      <circle cx="5" cy="18" r="2.5" />
      <circle cx="13" cy="18" r="2.5" />
      <path d="M8 18 L10 12 L14 12 M16 4 L18 4 L20 12 M19 16 L19 21 M19 18 L17 21 M19 18 L21 21" />
    </svg>
  );
}

export function RestIcon({ size = 14, className = "" }: IconProps) {
  return (
    <svg {...baseProps(size, className)} strokeWidth={1.6}>
      <path d="M21 12.5 A 9 9 0 1 1 11.5 3 A 7 7 0 0 0 21 12.5 Z" />
    </svg>
  );
}

/* ─── Connections ───────────────────────────────────────────── */

export function PulseIcon({ size = 18, className = "" }: IconProps) {
  return (
    <svg {...baseProps(size, className)} strokeWidth={1.6}>
      <path d="M3 12 L7 12 L9 6 L12 18 L14 12 L17 12 L19 9 L21 12" />
    </svg>
  );
}

export function SparkIcon({ size = 18, className = "" }: IconProps) {
  return (
    <svg {...baseProps(size, className)} strokeWidth={1.6}>
      <path d="M12 3 L13.5 9.5 L20 11 L13.5 12.5 L12 19 L10.5 12.5 L4 11 L10.5 9.5 Z" />
    </svg>
  );
}

export function MountainIcon({ size = 18, className = "" }: IconProps) {
  return (
    <svg {...baseProps(size, className)} strokeWidth={1.6}>
      <path d="M3 19 L9 9 L13 14 L16 11 L21 19 Z" />
    </svg>
  );
}

export function LeafIcon({ size = 18, className = "" }: IconProps) {
  return (
    <svg {...baseProps(size, className)} strokeWidth={1.6}>
      <path d="M4 20 C 4 12, 10 4, 20 4 C 20 14, 12 20, 4 20 Z" />
      <path d="M4 20 L14 10" />
    </svg>
  );
}

export function FlagIcon({ size = 18, className = "" }: IconProps) {
  return (
    <svg {...baseProps(size, className)} strokeWidth={1.6}>
      <path d="M5 21 L5 4 M5 4 L18 4 L15 8 L18 12 L5 12" />
    </svg>
  );
}

/* ─── Partner brand wordmarks (monochrome, currentColor) ────── */

export function GarminWordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-extrabold tracking-[0.04em] text-[15px] leading-none ${className}`}
      aria-label="Garmin"
    >
      GARMIN
    </span>
  );
}

export function StravaWordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      aria-label="Strava"
    >
      <svg viewBox="0 0 14 14" fill="currentColor" className="size-3.5">
        <path d="M5.5 1 L1 9 L3 9 L5.5 4.4 L7 7 L9 7 L5.5 1 Z M9 7 L7.6 9.4 L6.5 7.5 L5.5 9 L7.6 13 L9 10.6 L10.4 13 L13 8.5 L11 8.5 L10.4 9.6 L9 7 Z" />
      </svg>
      <span className="font-extrabold tracking-[0.06em] text-[14.5px] leading-none">
        STRAVA
      </span>
    </span>
  );
}

export function ZwiftWordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-extrabold italic tracking-[-0.02em] text-[16px] leading-none ${className}`}
      aria-label="Zwift"
      style={{ fontStyle: "italic" }}
    >
      ZWIFT
    </span>
  );
}

export function WahooWordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-extrabold tracking-[0.06em] text-[15px] leading-none ${className}`}
      aria-label="Wahoo"
    >
      WAHOO
    </span>
  );
}

export function TrainingPeaksWordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      aria-label="TrainingPeaks"
    >
      <svg viewBox="0 0 14 14" fill="currentColor" className="size-3.5">
        <path d="M2 12 L7 3 L12 12 Z" />
      </svg>
      <span className="font-bold tracking-[-0.005em] text-[14px] leading-none">
        Training<span className="font-extrabold">Peaks</span>
      </span>
    </span>
  );
}

export function CorosWordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-extrabold tracking-[0.05em] text-[14.5px] leading-none ${className}`}
      aria-label="Coros"
    >
      COROS
    </span>
  );
}

export function AppleWatchWordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      aria-label="Apple Watch"
    >
      <svg viewBox="0 0 14 16" fill="currentColor" className="size-3.5">
        <rect x="3.5" y="4" width="7" height="8" rx="1.6" />
        <rect x="4.5" y="2" width="5" height="2" rx="0.5" />
        <rect x="4.5" y="12" width="5" height="2" rx="0.5" />
      </svg>
      <span className="font-bold tracking-[-0.005em] text-[13.5px] leading-none">
        Apple Watch
      </span>
    </span>
  );
}

/* ─── Inline UI ─────────────────────────────────────────────── */

export function ArrowRightIcon({ size = 12, className = "" }: IconProps) {
  return (
    <svg {...baseProps(size, className)} strokeWidth={1.8}>
      <path d="M5 12 L19 12 M13 6 L19 12 L13 18" />
    </svg>
  );
}

export function CheckIcon({ size = 12, className = "" }: IconProps) {
  return (
    <svg {...baseProps(size, className)} strokeWidth={2}>
      <path d="M5 12.5 L10 17.5 L19 7" />
    </svg>
  );
}

export function DotIcon({ size = 8, className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 8 8" width={size} height={size} className={className} aria-hidden>
      <circle cx="4" cy="4" r="3" fill="currentColor" />
    </svg>
  );
}

export function SyncIcon({ size = 14, className = "" }: IconProps) {
  return (
    <svg {...baseProps(size, className)} strokeWidth={1.8}>
      <path d="M21 12 A 9 9 0 0 1 12 21 A 9.75 9.75 0 0 1 5.26 18.26 L3 16" />
      <path d="M3 12 A 9 9 0 0 1 12 3 A 9.75 9.75 0 0 1 18.74 5.74 L21 8" />
      <path d="M21 3 V 8 H 16" />
      <path d="M3 21 V 16 H 8" />
    </svg>
  );
}
