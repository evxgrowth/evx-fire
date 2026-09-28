"use client";

import { defaultFilters, type Filters } from "@/lib/data";
import { useData } from "./DataProvider";
import { usePref } from "./Prefs";

/**
 * Filtros do painel, compartilhados entre Dashboard, Campanhas e Criativos
 * e lembrados na conta do gestor (voltam aplicados no próximo login).
 */
export function useFilters(): [Filters, (f: Filters) => void] {
  const { clients } = useData();
  const [saved, setSaved] = usePref<Filters>("filters.v2", defaultFilters);
  // Ignora clientes salvos que não existem mais ou foram desativados
  const valid = new Set(clients.filter((c) => c.active).map((c) => c.id));
  const filters: Filters = { ...defaultFilters, ...saved, clients: (saved.clients ?? []).filter((id) => valid.has(id)) };
  return [filters, setSaved];
}
