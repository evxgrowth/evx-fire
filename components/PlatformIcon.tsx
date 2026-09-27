import clsx from "clsx";
import type { Platform } from "@/lib/types";

export function MetaIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M6.9 5C4.1 5 2 8.6 2 12.6 2 15.8 3.5 18 5.9 18c1.9 0 3.2-1.3 5-4.5l1.1-2 .4.7c1.9 3.5 3.3 5.8 5.8 5.8 2.4 0 3.8-2.3 3.8-5.6C22 8.3 19.8 5 17 5c-1.8 0-3.300 1.3-5 3.8C10.3 6.2 8.8 5 6.9 5zm0 2.2c1.2 0 2.2 1 3.8 3.4-1.8 3.2-2.8 5.1-4.4 5.1-1.2 0-2.1-1.3-2.1-3.3 0-2.9 1.3-5.2 2.700-5.2zm10 0c1.6 0 3 2.3 3 5.3 0 2-.7 3.2-1.8 3.2-1.4 0-2.4-1.6-4.3-5l-.4-.7c1.3-2 2.4-2.8 3.500-2.8z"
      />
    </svg>
  );
}

export function GoogleAdsIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M9.3 3.6a3 3 0 0 1 4.1 1.1l6.9 12a3 3 0 1 1-5.2 3L8.2 7.7a3 3 0 0 1 1.1-4.1z" opacity=".9" />
      <path fill="currentColor" d="M8.2 7.7 3.4 16a3 3 0 1 0 5.2 3l3.3-5.8z" opacity=".55" />
      <circle cx="6" cy="17.5" r="3" fill="currentColor" />
    </svg>
  );
}

export default function PlatformBadge({ platform, withLabel = true }: { platform: Platform; withLabel?: boolean }) {
  const meta = platform === "meta";
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        meta ? "border-meta/30 bg-meta/10 text-fire-300" : "border-google/25 bg-google/10 text-ash-100",
      )}
    >
      <span className={meta ? "text-meta" : "text-google"}>{meta ? <MetaIcon size={13} /> : <GoogleAdsIcon size={13} />}</span>
      {withLabel && (meta ? "Meta Ads" : "Google Ads")}
    </span>
  );
}
