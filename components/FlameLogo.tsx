import clsx from "clsx";

export function Flame({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="fl-o" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ff4d00" />
          <stop offset="0.6" stopColor="#ff8a1f" />
          <stop offset="1" stopColor="#ffd9b0" />
        </linearGradient>
        <linearGradient id="fl-i" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ffb866" />
          <stop offset="1" stopColor="#ffffff" />
        </linearGradient>
        <radialGradient id="fl-g" cx="0.5" cy="0.75" r="0.5">
          <stop offset="0" stopColor="#ff6a00" stopOpacity="0.6" />
          <stop offset="1" stopColor="#ff6a00" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="42" r="30" fill="url(#fl-g)" className="flame-glow" />
      <path
        className="flame-outer"
        fill="url(#fl-o)"
        d="M32 4c2 9 12 14 14 26 2 11-5 26-14 26S16 50 17 38c1-8 6-11 7-18 5 4 5 9 5 12 4-6 5-17 3-28z"
      />
      <path
        className="flame-inner"
        fill="url(#fl-i)"
        d="M32 30c1 5 7 8 7 15 0 6-3 11-7 11s-8-4-7-10c.5-4 3-5 4-9 2 2 2 4 2 6 2-3 2-8 1-13z"
      />
    </svg>
  );
}

export default function FlameLogo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={clsx("flex items-center gap-2.5", className)}>
      <Flame size={compact ? 32 : 40} />
      {!compact && (
        <div className="leading-none">
          <div className="font-display text-xl font-extrabold tracking-tight">
            <span className="text-white">EVX</span> <span className="text-fire neon-text">FIRE</span>
          </div>
          <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.28em] text-ash-400">Ads Intelligence</div>
        </div>
      )}
    </div>
  );
}
