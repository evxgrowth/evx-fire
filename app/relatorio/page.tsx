import ReportView from "@/components/report/ReportView";
import { requireManager } from "@/lib/auth";
import { defaultFilters, type Filters } from "@/lib/data";
import { decodeFilters } from "@/lib/reportFilters";
import { normalizePeriod } from "@/lib/period";
import { toClients } from "@/lib/packed";
import { loadBase, loadView } from "@/lib/repo";
import { REPORT_ROWS, resolveView, type DashboardData } from "@/lib/views";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Relatório — EVX Fire" };

/** Relatório em PDF do gestor, com os filtros aplicados no painel. */
export default async function RelatorioPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const me = await requireManager();
  const db = await createClient();
  const { f } = await searchParams;
  let filters = decodeFilters(f);
  if (!filters) {
    const { data: prefRow } = await db.from("user_preferences").select("prefs").eq("user_id", me.id).maybeSingle();
    const prefs = (prefRow?.prefs ?? {}) as Record<string, unknown>;
    filters = { ...defaultFilters, ...((prefs["filters.dashboard"] as Partial<Filters>) ?? {}), period: normalizePeriod(prefs["filters.period"]) };
  }
  // Dados prontos do servidor (em cache até algo mudar)
  const [base, data] = await Promise.all([loadBase(me.agencyId), loadView(me.agencyId, null, resolveView({ view: "report", filters, top: 9, limit: REPORT_ROWS })) as Promise<DashboardData | null>]);

  return <ReportView data={data} clients={toClients(base.clients)} filters={filters} agencyName={me.agencyName} backHref="/dashboard" />;
}
