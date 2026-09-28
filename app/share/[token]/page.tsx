import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import DashboardView from "@/components/DashboardView";
import DataProvider from "@/components/DataProvider";
import FlameLogo from "@/components/FlameLogo";
import { LiveBadge } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/server";
import { loadAgencyData } from "@/lib/repo";

export const dynamic = "force-dynamic";

/** Tela que o CLIENTE do gestor vê pelo link compartilhável (somente leitura). */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createAdminClient();
  const { data: link } = await db
    .from("share_links")
    .select("id, agency_id, client_id, show_revenue, show_creatives, active, views, clients(name, active), agencies(name, status)")
    .eq("token", token)
    .maybeSingle();
  if (!link) notFound();

  const agency = (Array.isArray(link.agencies) ? link.agencies[0] : link.agencies) as { name: string; status: string } | null;
  const client = (Array.isArray(link.clients) ? link.clients[0] : link.clients) as { name: string; active: boolean } | null;

  if (!link.active || agency?.status === "suspended" || client?.active === false) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="glass max-w-md p-8 text-center">
          <Lock className="mx-auto text-fire-400" />
          <h1 className="mt-4 font-display text-xl font-bold text-white">Link desativado</h1>
          <p className="mt-2 text-sm text-ash-400">Este painel não está mais disponível. Fale com seu gestor de tráfego.</p>
        </div>
      </div>
    );
  }

  await db.from("share_links").update({ views: link.views + 1 }).eq("id", link.id);
  const data = await loadAgencyData(db, link.agency_id, link.client_id);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/[0.04] bg-coal-950/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-4 py-3 md:px-8">
          <FlameLogo />
          <div className="ml-auto">
            <LiveBadge lastSync={data.lastSync} />
          </div>
        </div>
        <div className="ember-line opacity-40" />
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-8 md:px-8">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-[0.25em] text-fire-400">Relatório de desempenho</div>
          <h1 className="mt-1 font-display text-3xl font-bold text-white">{client?.name}</h1>
          <p className="mt-1 text-sm text-ash-400">
            Resultados das suas campanhas, atualizados automaticamente{agency?.name ? ` · gestão ${agency.name}` : ""}.
          </p>
        </div>
        <DataProvider campaigns={data.campaigns} clients={data.clients} lastSync={data.lastSync}>
          <DashboardView fixedClientId={link.client_id} hideRevenue={!link.show_revenue} hideCreatives={!link.show_creatives} reportHref={`/share/${token}/relatorio`} />
        </DataProvider>
        <p className="mt-10 text-center text-xs text-ash-500">
          Painel gerado por <span className="text-fire-400">EVX Fire</span> · somente visualização
        </p>
      </main>
    </div>
  );
}
