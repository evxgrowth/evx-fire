"use client";

import { defaultFilters, type Filters } from "@/lib/data";
import { DEFAULT_PERIOD, normalizePeriod, type PeriodKey } from "@/lib/period";
import { useData } from "./DataProvider";
import { usePref } from "./Prefs";

export type FilterScope = "dashboard" | "campaigns" | "creatives";

/**
 * Filtros lembrados na conta do gestor (voltam aplicados no próximo login).
 * - O PERÍODO é um só para Painel, Campanhas e Criativos: mudou em um, muda em todos.
 * - Os demais filtros (plataforma, clientes, status, nomes…) são guardados por página.
 */
export function useFilters(scope: FilterScope = "dashboard"): [Filters, (f: Filters) => void] {
  const { clients } = useData();
  const [period, setPeriod] = usePref<PeriodKey>("filters.period", DEFAULT_PERIOD);
  const [saved, setSaved] = usePref<Omit<Filters, "period">>(`filters.${scope}`, defaultFilters);

  // Ignora clientes salvos que não existem mais ou foram desativados
  const valid = new Set(clients.filter((c) => c.active).map((c) => c.id));
  const filters: Filters = {
    ...defaultFilters,
    ...saved,
    period: normalizePeriod(period),
    clients: (saved.clients ?? []).filter((id) => valid.has(id)),
  };

  const set = (f: Filters) => {
    const { period: next, ...rest } = f;
    if (next !== filters.period) setPeriod(next);
    const { period: _current, ...currentRest } = filters; // eslint-disable-line @typescript-eslint/no-unused-vars
    if (JSON.stringify(rest) !== JSON.stringify(currentRest)) setSaved(rest);
  };
  return [filters, set];
}
