"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { CalendarDays, Check, ChevronDown } from "lucide-react";
import Popover from "./kit/Popover";
import { fmtBR, PERIODS, periodRange, type PeriodKey } from "@/lib/period";

const span = (k: PeriodKey) => {
  const r = periodRange(k);
  return r.since === r.until ? fmtBR(r.since).slice(0, 5) : `${fmtBR(r.since).slice(0, 5)} – ${fmtBR(r.until).slice(0, 5)}`;
};

/** Botão único de período com lista suspensa (Hoje, Ontem, Esta semana, Este mês, 7…90 dias). */
export default function PeriodSelect({ value, onChange }: { value: PeriodKey; onChange: (v: PeriodKey) => void }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const current = PERIODS.find((p) => p.key === value) ?? PERIODS[3];

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={clsx(
          "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-all",
          open ? "border-fire-500/50 bg-fire-500/15 text-white shadow-[0_0_16px_-6px_rgba(255,92,0,.9)]" : "border-white/10 bg-black/30 text-white hover:border-white/20",
        )}
      >
        <CalendarDays size={14} className="text-fire-400" />
        {current.label}
        <span className="hidden text-ash-400 sm:inline">· {span(current.key)}</span>
        <ChevronDown size={13} className={clsx("text-ash-400 transition-transform", open && "rotate-180 text-fire-300")} />
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} matchWidth={false} minWidth={250} maxHeight={420}>
        <ul role="listbox" className="overflow-y-auto p-1">
          {PERIODS.map((p, i) => (
            <li key={p.key}>
              {(i === 4 || i === 2) && <div className="mx-2 my-1 h-px bg-white/5" />}
              <button
                type="button"
                role="option"
                aria-selected={p.key === value}
                onClick={() => {
                  onChange(p.key);
                  setOpen(false);
                }}
                className={clsx(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                  p.key === value ? "bg-fire-500/15 text-white" : "text-ash-200 hover:bg-white/5",
                )}
              >
                <span className="flex-1">{p.label}</span>
                <span className="text-[10px] tabular-nums text-ash-500">{span(p.key)}</span>
                {p.key === value && <Check size={14} className="text-fire-400" />}
              </button>
            </li>
          ))}
        </ul>
      </Popover>
    </>
  );
}
