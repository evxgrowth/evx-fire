import AppShell from "@/components/AppShell";
import DataProvider from "@/components/DataProvider";
import DemoBanner from "@/components/DemoBanner";
import { PrefsProvider } from "@/components/Prefs";
import { requireManager } from "@/lib/auth";
import { loadBase } from "@/lib/repo";
import { createClient } from "@/lib/supabase/server";
import { campaigns as demoCampaigns, clients as demoClients } from "@/lib/mock";

export const dynamic = "force-dynamic";

export default async function GestorLayout({ children }: { children: React.ReactNode }) {
  const me = await requireManager();
  const db = await createClient();
  // Base leve (clientes, última sincronização): do cache do servidor. As campanhas não vêm aqui:
  // cada tela pede só o que mostra (components/useView.ts).
  const [data, { data: prefRow }] = await Promise.all([loadBase(me.agencyId), db.from("user_preferences").select("prefs").eq("user_id", me.id).maybeSingle()]);

  // Sem nenhuma conta conectada ainda: mostra a demonstração com um aviso.
  const demo = !data.has_accounts;

  return (
    <AppShell mode="gestor" user={{ name: me.fullName || me.email, role: me.agencyName, isSuperAdmin: me.role === "super_admin" }} lastSync={data.last_sync}>
      <PrefsProvider initial={(prefRow?.prefs as Record<string, unknown>) ?? {}}>
      <DataProvider
        {...(demo ? { demoCampaigns, clients: demoClients } : { baseClients: data.clients })}
        lastSync={data.last_sync}
        version={data.v}
        demo={demo}
      >
        <DemoBanner />
        {children}
      </DataProvider>
      </PrefsProvider>
    </AppShell>
  );
}
