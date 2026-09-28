"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import Popover from "./Popover";
import { todaySP } from "@/lib/period";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const WEEK = ["D", "S", "T", "Q", "Q", "S", "S"];
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Campo de data com calendário personalizado (substitui o seletor do navegador).
 * mode "date" → "AAAA-MM-DD"; mode "month" → "AAAA-MM".
 */
export default function DateInput({
  value,
  onChange,
  mode = "date",
  placeholder = "Escolher data",
  clearable = false,
}: {
  value: string;
  onChange: (v: string) => void;
  mode?: "date" | "month";
  placeholder?: string;
  clearable?: boolean;
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const today = todaySP();
  const base = value || today;
  const [view, setView] = useState({ y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) - 1 });

  const label = value ? (mode === "month" ? `${MONTHS[Number(value.slice(5, 7)) - 1]} de ${value.slice(0, 4)}` : value.split("-").reverse().join("/")) : placeholder;

  const move = (delta: number) =>
    setView((v) => {
      if (mode === "month") return { ...v, y: v.y + delta };
      const d = new Date(Date.UTC(v.y, v.m + delta, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });

  const first = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
  const total = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => {
          const b = value || today;
          setView({ y: Number(b.slice(0, 4)), m: Number(b.slice(5, 7)) - 1 });
          setOpen((o) => !o);
        }}
        className={clsx(
          "flex w-full items-center gap-2 rounded-xl border bg-black/35 px-3.5 py-[11px] text-left text-sm outline-none transition-all",
          open ? "border-fire-500/60 shadow-[0_0_0_4px_rgba(255,122,26,.12)]" : "border-white/10 hover:border-white/20",
        )}
      >
        <CalendarDays size={15} className="shrink-0 text-fire-400" />
        <span className={clsx("flex-1 truncate", value ? "text-white" : "text-ash-500")}>{label}</span>
        {clearable && value && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            className="text-ash-500 hover:text-white"
            aria-label="Limpar data"
          >
            <X size={14} />
          </span>
        )}
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} matchWidth={false} minWidth={272} maxHeight={380}>
        <div className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => move(-1)} className="grid h-7 w-7 place-items-center rounded-lg text-ash-300 hover:bg-white/5 hover:text-white" aria-label="Anterior">
              <ChevronLeft size={16} />
            </button>
            <span className="font-display text-sm font-semibold text-white">{mode === "month" ? view.y : `${MONTHS[view.m]} ${view.y}`}</span>
            <button type="button" onClick={() => move(1)} className="grid h-7 w-7 place-items-center rounded-lg text-ash-300 hover:bg-white/5 hover:text-white" aria-label="Próximo">
              <ChevronRight size={16} />
            </button>
          </div>

          {mode === "month" ? (
            <div className="grid grid-cols-3 gap-1.5">
              {MONTHS.map((name, i) => {
                const v = `${view.y}-${pad(i + 1)}`;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      onChange(v);
                      setOpen(false);
                    }}
                    className={clsx(
                      "rounded-lg px-2 py-2 text-xs transition-colors",
                      value === v ? "bg-fire-500 font-semibold text-coal-950" : v === today.slice(0, 7) ? "border border-fire-500/40 text-white" : "text-ash-200 hover:bg-white/5",
                    )}
                  >
                    {name.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-semibold text-ash-500">
                {WEEK.map((w, i) => (
                  <span key={i}>{w}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((d, i) => {
                  if (!d) return <span key={i} />;
                  const v = `${view.y}-${pad(view.m + 1)}-${pad(d)}`;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        onChange(v);
                        setOpen(false);
                      }}
                      className={clsx(
                        "grid h-8 place-items-center rounded-lg text-xs tabular-nums transition-colors",
                        value === v ? "bg-fire-500 font-semibold text-coal-950 shadow-[0_0_12px_-2px_rgba(255,92,0,.8)]" : v === today ? "border border-fire-500/40 text-white" : "text-ash-200 hover:bg-white/5",
                      )}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div className="mt-2 flex justify-between border-t border-white/5 pt-2 text-xs">
            <button
              type="button"
              className="text-fire-300 hover:text-fire-200"
              onClick={() => {
                onChange(mode === "month" ? today.slice(0, 7) : today);
                setOpen(false);
              }}
            >
              {mode === "month" ? "Este mês" : "Hoje"}
            </button>
            {clearable && (
              <button
                type="button"
                className="text-ash-400 hover:text-white"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                Limpar
              </button>
            )}
          </div>
        </div>
      </Popover>
    </>
  );
}
