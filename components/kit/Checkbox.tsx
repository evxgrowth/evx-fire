"use client";

import clsx from "clsx";
import { Check } from "lucide-react";

/** Caixa de marcar personalizada (substitui o checkbox do navegador). */
export default function Checkbox({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group inline-flex items-center gap-2.5 text-sm text-ash-200 disabled:opacity-50"
    >
      <span
        className={clsx(
          "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border transition-all",
          checked ? "border-fire-400 bg-fire-500 text-coal-950 shadow-[0_0_12px_-2px_rgba(255,92,0,.8)]" : "border-white/25 bg-black/30 group-hover:border-fire-400/70",
        )}
      >
        {checked && <Check size={12} strokeWidth={3.2} />}
      </span>
      {label}
    </button>
  );
}
