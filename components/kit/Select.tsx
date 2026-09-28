"use client";

import { useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Check, ChevronDown, Search } from "lucide-react";
import Popover from "./Popover";

export interface Option<T extends string> {
  value: T;
  label: React.ReactNode;
  /** texto usado na busca (quando o label não é texto) */
  text?: string;
  hint?: string;
  /** item de ação (ex.: "+ Novo cliente…"), com destaque */
  action?: boolean;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Lista suspensa personalizada (substitui o <select> do navegador). */
export default function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder = "Escolha…",
  disabled,
  className,
  size = "md",
  searchable,
  icon,
}: {
  value: T | "";
  onChange: (v: T) => void;
  options: Option<T>[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
  searchable?: boolean;
  icon?: React.ReactNode;
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const withSearch = searchable ?? options.length > 8;
  const current = options.find((o) => o.value === value);

  const list = useMemo(() => {
    if (!q.trim()) return options;
    const t = norm(q.trim());
    return options.filter((o) => o.action || norm(o.text ?? (typeof o.label === "string" ? o.label : String(o.value))).includes(t));
  }, [options, q]);

  const pick = (o: Option<T>) => {
    onChange(o.value);
    setOpen(false);
    setQ("");
    anchor.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      setOpen(true);
      setHi(Math.max(0, list.findIndex((o) => o.value === value)));
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((h) => Math.min(list.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (list[hi]) pick(list[hi]);
    }
  };

  return (
    <>
      <button
        ref={anchor}
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((o) => !o);
          setHi(Math.max(0, options.findIndex((o) => o.value === value)));
        }}
        onKeyDown={onKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={clsx(
          "flex w-full items-center gap-2 rounded-xl border bg-black/35 text-left text-white outline-none transition-all disabled:opacity-50",
          size === "sm" ? "px-3 py-1.5 text-xs" : "px-3.5 py-[11px] text-sm",
          open ? "border-fire-500/60 shadow-[0_0_0_4px_rgba(255,122,26,.12)]" : "border-white/10 hover:border-white/20",
          className,
        )}
      >
        {icon}
        <span className={clsx("flex-1 truncate", !current && "text-ash-500")}>{current ? current.label : placeholder}</span>
        <ChevronDown size={size === "sm" ? 13 : 15} className={clsx("shrink-0 text-ash-400 transition-transform", open && "rotate-180 text-fire-300")} />
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} minWidth={180}>
        {withSearch && (
          <div className="relative border-b border-white/5 p-2">
            <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-ash-500" />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setHi(0);
              }}
              onKeyDown={onKey}
              placeholder="Buscar…"
              className="w-full rounded-lg bg-black/40 py-1.5 pl-7 pr-2 text-xs text-white outline-none placeholder:text-ash-500"
            />
          </div>
        )}
        <ul role="listbox" className="flex-1 overflow-y-auto p-1">
          {list.map((o, i) => {
            const sel = o.value === value;
            return (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={sel}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => pick(o)}
                  className={clsx(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    i === hi ? "bg-fire-500/15 text-white" : "text-ash-200",
                    o.action && "border-t border-white/5 text-fire-300",
                  )}
                >
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="shrink-0 text-[10px] text-ash-500">{o.hint}</span>}
                  {sel && <Check size={14} className="shrink-0 text-fire-400" />}
                </button>
              </li>
            );
          })}
          {!list.length && <li className="px-3 py-3 text-center text-xs text-ash-500">Nada encontrado</li>}
        </ul>
      </Popover>
    </>
  );
}
