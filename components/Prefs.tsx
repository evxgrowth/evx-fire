"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { savePrefs } from "@/app/(gestor)/prefs-actions";

type Prefs = Record<string, unknown>;
const PrefsContext = createContext<{ prefs: Prefs; set: (key: string, value: unknown) => void } | null>(null);

/** Guarda as preferências do gestor (filtros etc.) e salva no banco alguns instantes depois de cada mudança. */
export function PrefsProvider({ initial, children }: { initial: Prefs; children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const pending = useRef<Prefs>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = useCallback((key: string, value: unknown) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    pending.current[key] = value;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const patch = pending.current;
      pending.current = {};
      savePrefs(patch).catch(() => {});
    }, 800);
  }, []);

  return <PrefsContext.Provider value={{ prefs, set }}>{children}</PrefsContext.Provider>;
}

/** Como useState, mas lembrado entre sessões. Fora do painel do gestor (ex.: link do cliente) vira um useState comum. */
export function usePref<T>(key: string, fallback: T): [T, (v: T) => void] {
  const ctx = useContext(PrefsContext);
  const [local, setLocal] = useState<T>(fallback);
  if (!ctx) return [local, setLocal];
  const stored = ctx.prefs[key];
  // Objetos são mesclados com o padrão, para aceitar campos novos no futuro
  const value = stored === undefined ? fallback : isObj(fallback) && isObj(stored) ? ({ ...fallback, ...(stored as object) } as T) : (stored as T);
  return [value, (v: T) => ctx.set(key, v)];
}

const isObj = (v: unknown): v is object => typeof v === "object" && v !== null && !Array.isArray(v);

/** Valor atrasado (para busca com debounce). */
export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
