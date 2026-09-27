"use client";

import { createContext, useContext, useMemo } from "react";
import type { Campaign, Client } from "@/lib/types";

interface Ctx {
  campaigns: Campaign[];
  clients: Client[];
  lastSync: string | null;
  demo: boolean;
  clientById: (id: string) => Client | undefined;
}

const DataContext = createContext<Ctx | null>(null);

export default function DataProvider({
  campaigns,
  clients,
  lastSync = null,
  demo = false,
  children,
}: {
  campaigns: Campaign[];
  clients: Client[];
  lastSync?: string | null;
  demo?: boolean;
  children: React.ReactNode;
}) {
  const value = useMemo(() => {
    const map = new Map(clients.map((c) => [c.id, c]));
    return { campaigns, clients, lastSync, demo, clientById: (id: string) => map.get(id) };
  }, [campaigns, clients, lastSync, demo]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData precisa estar dentro de <DataProvider>");
  return ctx;
}
