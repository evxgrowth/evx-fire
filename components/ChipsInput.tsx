"use client";

import { useState } from "react";
import { X } from "lucide-react";

/** Campo de "etiquetas": digite e aperte Enter (ou vírgula) para adicionar. */
export default function ChipsInput({ value, onChange, placeholder, mono = false }: { value: string[]; onChange: (v: string[]) => void; placeholder: string; mono?: boolean }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const parts = draft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !value.includes(s));
    if (parts.length) onChange([...value, ...parts]);
    setDraft("");
  };
  return (
    <div className="flex min-h-[46px] flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-black/35 px-2 py-1.5 focus-within:border-fire-500/60">
      {value.map((t) => (
        <span key={t} className={`inline-flex items-center gap-1 rounded-lg bg-fire-500/15 px-2 py-1 text-xs text-fire-200 ${mono ? "font-mono" : ""}`}>
          {t}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Remover ${t}`} className="text-fire-300 hover:text-white">
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={add}
        placeholder={value.length ? "" : placeholder}
        className="min-w-[140px] flex-1 bg-transparent px-1 py-1 text-sm text-white outline-none placeholder:text-ash-500"
      />
    </div>
  );
}
