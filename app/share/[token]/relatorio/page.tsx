import { notFound } from "next/navigation";
import ReportView from "@/components/report/ReportView";
import { defaultFilters } from "@/lib/data";
import { decodeFilters } from "@/lib/reportFilters";
import { loadAgencyData } from "@/lib/repo";
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

  const data = await loadAgencyData(db, link.agency_id, link.client_id);
  const filters = { ...(decodeFilters(f) ?? defaultFilters), clients: [link.client_id] };

  return (
    <ReportView
      campaigns={data.campaigns}
      clients={data.clients}
      filters={filters}
      agencyName={agency?.name ?? ""}
      defaultTitle={client?.name}
      hideRevenue={!link.show_revenue}
      hideCreatives={!link.show_creatives}
      backHref={`/share/${token}`}
    />
  );
}
