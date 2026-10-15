"use client";

import { createContext, useContext, useMemo } from "react";
import { unpack, type Packed } from "@/lib/packed";
import type { Campaign, Client } from "@/lib/types";

interface Ctx {
  campaigns: Campaign[];
  clients: Client[];
  lastSync: string | null;
  demo: boolean;
  clientById: (id: string) => Client | undefined;
}

const DataContext = createContext<Ctx | null>(null);

/**
 * Recebe os dados já em listas (demonstração) ou no formato compacto vindo do servidor
 * (`packed`), que é aberto aqui no navegador: a página trafega bem menos.
 */
export default function DataProvider({
  campaigns: rawCampaigns,
  clients: rawClients,
  packed,
  lastSync = null,
  demo = false,
  children,
}: {
  campaigns?: Campaign[];
  clients?: Client[];
  packed?: Packed;
  lastSync?: string | null;
  demo?: boolean;
  children: React.ReactNode;
}) {
  const value = useMemo(() => {
    const open = packed ? unpack(packed) : null;
    const campaigns = open?.campaigns ?? rawCampaigns ?? [];
    const clients = open?.clients ?? rawClients ?? [];
    const map = new Map(clients.map((c) => [c.id, c]));
    return { campaigns, clients, lastSync: open?.lastSync ?? lastSync, demo, clientById: (id: string) => map.get(id) };
  }, [packed, rawCampaigns, rawClients, lastSync, demo]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData precisa estar dentro de <DataProvider>");
  return ctx;
}
