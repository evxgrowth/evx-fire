"use client";

import { useEffect, useMemo, useState } from "react";
import { computeView, resolveView, type ViewData, type ViewRequest } from "@/lib/views";
import { useData } from "./DataProvider";

// Respostas já recebidas nesta aba (voltar a uma tela ou filtro é instantâneo).
// A chave inclui a versão dos dados: depois de uma sincronização ou alteração, busca de novo.
const memory = new Map<string, ViewData>();
const MAX = 60;

const encode = (o: unknown) => {
  const bytes = new TextEncoder().encode(JSON.stringify(o));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/**
 * Dados prontos de uma tela. O servidor calcula (no banco) e devolve só o que a tela mostra.
 * Enquanto busca, continua mostrando o resultado anterior (sem piscar).
 * No modo demonstração, calcula aqui mesmo com os dados de exemplo.
 */
export function useView<T extends ViewData>(req: ViewRequest | null): { data: T | null; loading: boolean; error: string | null } {
  const { demo, demoCampaigns, version, shareToken } = useData();
  const reqKey = req ? JSON.stringify(req) : "";
  const key = `${version}|${shareToken ?? ""}|${reqKey}`;

  const local = useMemo(() => (demo && req && demoCampaigns ? (computeView(demoCampaigns, resolveView(req)) as T) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [demo, demoCampaigns, reqKey]);

  const [state, setState] = useState<{ key: string; data: T | null; error: string | null }>(() => ({ key, data: (memory.get(key) as T) ?? null, error: null }));

  useEffect(() => {
    if (demo || !req) return;
    const cached = memory.get(key) as T | undefined;
    if (cached !== undefined) {
      setState({ key, data: cached, error: null });
      return;
    }
    const ctrl = new AbortController();
    const url = `/api/view?q=${encode(req)}${shareToken ? `&t=${encodeURIComponent(shareToken)}` : ""}`;
    fetch(url, { signal: ctrl.signal, cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 401 ? "Sessão expirada. Entre de novo." : "Não foi possível carregar os dados.");
        const data = (await r.json()) as T;
        memory.set(key, data);
        if (memory.size > MAX) memory.delete(memory.keys().next().value!);
        setState({ key, data, error: null });
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setState((s) => ({ ...s, key, error: e instanceof Error ? e.message : "Erro" }));
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, demo]);

  if (demo) return { data: local, loading: false, error: null };
  return { data: state.data, loading: state.key !== key || (!state.data && !state.error), error: state.key === key ? state.error : null };
}
