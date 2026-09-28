import clsx from "clsx";

export function Flame({ size = 36, className }: { size?: number; className?: string }) {
  // O desenho ocupa 0–64; a área visível tem folga em volta para o brilho e as faíscas não serem cortados.
  return (
    <svg width={size} height={size} viewBox="-14 -10 92 92" className={clsx("overflow-visible", className)} aria-hidden>
      <defs>
        <linearGradient id="fl-o" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ff3d00" />
          <stop offset="0.55" stopColor="#ff8a1f" />
          <stop offset="1" stopColor="#ffd9b0" />
        </linearGradient>
        <linearGradient id="fl-m" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ff6a00" />
          <stop offset="1" stopColor="#ffc27a" />
        </linearGradient>
        <linearGradient id="fl-i" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ffb866" />
          <stop offset="1" stopColor="#ffffff" />
        </linearGradient>
        <radialGradient id="fl-g" cx="0.5" cy="0.62" r="0.5">
          <stop offset="0" stopColor="#ff6a00" stopOpacity="0.55" />
          <stop offset="0.55" stopColor="#ff4d00" stopOpacity="0.18" />
          <stop offset="1" stopColor="#ff4d00" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="32" cy="40" rx="40" ry="38" fill="url(#fl-g)" className="flame-glow" />
      <path className="flame-outer" fill="url(#fl-o)" d="M32 4c2 9 12 14 14 26 2 11-5 26-14 26S16 50 17 38c1-8 6-11 7-18 5 4 5 9 5 12 4-6 5-17 3-28z" />
      <path className="flame-mid" fill="url(#fl-m)" opacity="0.85" d="M31 18c2 7 9 11 10 20 1 9-4 18-9 18s-11-5-10-14c.5-6 4-8 5-13 3 3 3 6 3 8 2-5 3-12 1-19z" />
      <path className="flame-inner" fill="url(#fl-i)" d="M32 30c1 5 7 8 7 15 0 6-3 11-7 11s-8-4-7-10c.5-4 3-5 4-9 2 2 2 4 2 6 2-3 2-8 1-13z" />
      <circle className="flame-spark" cx="24" cy="30" r="1.4" fill="#ffd9b0" />
      <circle className="flame-spark flame-spark-2" cx="40" cy="26" r="1.1" fill="#ffb866" />
      <circle className="flame-spark flame-spark-3" cx="33" cy="20" r="0.9" fill="#fff" />
    </svg>
  );
}

export default function FlameLogo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={clsx("flex items-center gap-2.5", className)}>
      <Flame size={compact ? 38 : 48} className="-my-1" />
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
