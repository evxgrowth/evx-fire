"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Check } from "lucide-react";

/** Item de checklist: a marcação fica salva neste navegador. */
export default function CheckItem({ storageKey, children }: { storageKey: string; children: React.ReactNode }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    try {
      setDone(localStorage.getItem(storageKey) === "1");
    } catch {}
  }, [storageKey]);
  const toggle = () => {
    const next = !done;
    setDone(next);
    try {
      if (next) localStorage.setItem(storageKey, "1");
      else localStorage.removeItem(storageKey);
    } catch {}
    window.dispatchEvent(new Event("checklist-change"));
  };
  return (
    <li>
      <button onClick={toggle} className="flex w-full items-start gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.03]">
        <span
          className={clsx(
            "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors",
            done ? "border-fire-500 bg-fire-500 text-white" : "border-white/25",
          )}
        >
          {done && <Check size={11} strokeWidth={3} />}
        </span>
        <span className={clsx(done && "text-ash-500 line-through")}>{children}</span>
      </button>
    </li>
  );
}

/** Contador "X de Y testados" (lê o mesmo armazenamento). */
export function CheckProgress({ prefix, keys }: { prefix: string; keys: string[] }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const count = () => {
      try {
        setN(keys.filter((k) => localStorage.getItem(`${prefix}:${k}`) === "1").length);
      } catch {}
    };
    count();
    window.addEventListener("checklist-change", count);
    return () => window.removeEventListener("checklist-change", count);
  }, [prefix, keys]);
  return (
    <span className="rounded-full border border-fire-500/30 bg-fire-500/10 px-3 py-1 text-xs text-fire-200">
      {n} de {keys.length} testados
    </span>
  );
}
