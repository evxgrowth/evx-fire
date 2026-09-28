import ReportView from "@/components/report/ReportView";
import { requireManager } from "@/lib/auth";
import { defaultFilters, type Filters } from "@/lib/data";
import { decodeFilters } from "@/lib/reportFilters";
import { loadAgencyData } from "@/lib/repo";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Relatório — EVX Fire" };

/** Relatório em PDF do gestor, com os filtros aplicados no painel. */
export default async function RelatorioPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const me = await requireManager();
  const db = await createClient();
  const { f } = await searchParams;
  const [data, { data: prefRow }] = await Promise.all([loadAgencyData(db, me.agencyId), db.from("user_preferences").select("prefs").eq("user_id", me.id).maybeSingle()]);
  const saved = (prefRow?.prefs as Record<string, Filters> | undefined)?.["filters.v2"];
  const filters = decodeFilters(f) ?? { ...defaultFilters, ...(saved ?? {}) };

  return <ReportView campaigns={data.campaigns} clients={data.clients} filters={filters} agencyName={me.agencyName} backHref="/dashboard" />;
}
