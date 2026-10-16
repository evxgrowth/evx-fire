import { notFound } from "next/navigation";
import ReportView from "@/components/report/ReportView";
import { defaultFilters } from "@/lib/data";
import { decodeFilters } from "@/lib/reportFilters";
import { toClients } from "@/lib/packed";
import { loadBase, loadView } from "@/lib/repo";
import { REPORT_ROWS, resolveView, stripRevenue, type DashboardData } from "@/lib/views";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Relatório — EVX Fire" };

/** Relatório em PDF pelo link do cliente (só os dados daquele cliente). */
export default async function ShareReportPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ f?: string }> }) {
  const { token } = await params;
  const { f } = await searchParams;
  const db = createAdminClient();
  const { data: link } = await db
    .from("share_links")
    .select("agency_id, client_id, show_revenue, show_creatives, active, clients(name, active), agencies(name, status)")
    .eq("token", token)
    .maybeSingle();
  const agency = (Array.isArray(link?.agencies) ? link?.agencies[0] : link?.agencies) as { name: string; status: string } | null;
  const client = (Array.isArray(link?.clients) ? link?.clients[0] : link?.clients) as { name: string; active: boolean } | null;
  if (!link || !link.active || agency?.status === "suspended" || client?.active === false) notFound();

  const filters = { ...(decodeFilters(f) ?? defaultFilters), clients: [link.client_id] };
  // Dados prontos do servidor; receita e criativos nem saem daqui se o link não mostrar
  const [base, view] = await Promise.all([
    loadBase(link.agency_id, link.client_id),
    loadView(link.agency_id, link.client_id, resolveView({ view: "report", filters, top: link.show_creatives ? 9 : 0, limit: REPORT_ROWS })) as Promise<DashboardData | null>,
  ]);
  const data = view && !link.show_revenue ? stripRevenue(view) : view;

  return (
    <ReportView
      data={data}
      clients={toClients(base.clients)}
      filters={filters}
      agencyName={agency?.name ?? ""}
      defaultTitle={client?.name}
      hideRevenue={!link.show_revenue}
      hideCreatives={!link.show_creatives}
      backHref={`/share/${token}`}
    />
  );
}
