"use client";

import { createContext, useContext, useMemo } from "react";
import { toClients, type Packed } from "@/lib/packed";
import type { Campaign, Client } from "@/lib/types";

interface Ctx {
  clients: Client[];
  lastSync: string | null;
  demo: boolean;
  /** muda quando os dados da agência mudam: as telas buscam de novo */
  version: number;
  /** só no modo demonstração: as campanhas de exemplo, calculadas no navegador */
  demoCampaigns: Campaign[] | null;
  /** link do cliente: as telas pedem os dados por este link */
  shareToken: string | null;
  clientById: (id: string) => Client | undefined;
}

const DataContext = createContext<Ctx | null>(null);

/**
 * Base leve compartilhada pelas telas: clientes, última sincronização e versão dos dados.
 * As campanhas NÃO ficam aqui: cada tela pede ao servidor só o que vai mostrar (useView).
 */
export default function DataProvider({
  clients: rawClients,
  baseClients,
  lastSync = null,
  demo = false,
  version = 0,
  demoCampaigns = null,
  shareToken = null,
  children,
}: {
  clients?: Client[];
  baseClients?: Packed["clients"];
  lastSync?: string | null;
  demo?: boolean;
  version?: number;
  demoCampaigns?: Campaign[] | null;
  shareToken?: string | null;
  children: React.ReactNode;
}) {
  const value = useMemo(() => {
    const clients = baseClients ? toClients(baseClients) : (rawClients ?? []);
    const map = new Map(clients.map((c) => [c.id, c]));
    return { clients, lastSync, demo, version, demoCampaigns, shareToken, clientById: (id: string) => map.get(id) };
  }, [baseClients, rawClients, lastSync, demo, version, demoCampaigns, shareToken]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData precisa estar dentro de <DataProvider>");
  return ctx;
}
