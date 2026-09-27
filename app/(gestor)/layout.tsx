import AppShell from "@/components/AppShell";
import DataProvider from "@/components/DataProvider";
import DemoBanner from "@/components/DemoBanner";
import { requireManager } from "@/lib/auth";
import { loadAgencyData } from "@/lib/repo";
import { createClient } from "@/lib/supabase/server";
import { campaigns as demoCampaigns, clients as demoClients } from "@/lib/mock";

export const dynamic = "force-dynamic";

export default async function GestorLayout({ children }: { children: React.ReactNode }) {
  const me = await requireManager();
  const db = await createClient();
  const data = await loadAgencyData(db, me.agencyId);

  // Sem nenhuma conta conectada ainda: mostra a demonstração com um aviso.
  const { count } = await db.from("ad_accounts").select("id", { count: "exact", head: true }).eq("agency_id", me.agencyId);
  const demo = !count;

  return (
    <AppShell mode="gestor" user={{ name: me.fullName || me.email, role: me.agencyName, isSuperAdmin: me.role === "super_admin" }} lastSync={data.lastSync}>
      <DataProvider
        campaigns={demo ? demoCampaigns : data.campaigns}
        clients={demo ? demoClients : data.clients}
        lastSync={data.lastSync}
        demo={demo}
      >
        <DemoBanner />
        {children}
      </DataProvider>
    </AppShell>
  );
}
