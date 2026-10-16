"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search, X } from "lucide-react";
import CampaignTable from "@/components/CampaignTable";
import FilterBar from "@/components/FilterBar";
import { Panel, PageHeader } from "@/components/ui";
import { useData } from "@/components/DataProvider";
import { useDebounced } from "@/components/Prefs";
import { useFilters } from "@/components/useFilters";
import { useView } from "@/components/useView";
import type { CampaignsData } from "@/lib/views";
const PAGE = 50;

export default function CampanhasPage() {
  const { demo } = useData();
  const [filters, setFilters] = useFilters("campaigns");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const q = useDebounced(search, 300);

  // Filtro, busca e soma do período são feitos no servidor; chegam só as linhas mostradas
  const filtersKey = JSON.stringify(filters);
  useEffect(() => setLimit(PAGE), [filtersKey, q]);
  const { data, loading, error } = useView<CampaignsData>({ view: "campaigns", filters, search: q.trim(), limit });
  const rows = data?.rows ?? [];
  const count = data?.count ?? 0;

  return (
    <>
      <PageHeader title="Campanhas" subtitle="Campanhas conectadas (Meta Ads e Google Ads) e campanhas cadastradas manualmente.">
        {!demo && (
          <Link href="/campanhas/nova" className="btn-fire">
            <Plus size={16} /> Campanha manual
          </Link>
        )}
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <FilterBar filters={filters} onChange={setFilters} />
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ash-400" />
          <input className="input !py-2 !pl-9 !pr-8" placeholder="Buscar campanha, conjunto ou anúncio…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ash-400 hover:text-white" aria-label="Limpar busca">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <Panel
        title={data ? `${count} campanha(s)` : "Campanhas"}
        subtitle={data ? `${data.active} ativa(s) · ordenadas por investimento no período` : "Carregando…"}
        className={loading && data ? "opacity-60 transition-opacity" : "transition-opacity"}
      >
        {error && !data ? (
          <p className="py-10 text-center text-sm text-bad">{error}</p>
        ) : !data ? (
          <div className="h-40 animate-pulse rounded-xl bg-white/[0.03]" />
        ) : rows.length ? (
          <>
            <CampaignTable campaigns={rows} linkBase="/campanhas" />
            {count > rows.length && (
              <div className="mt-4 text-center">
                <button className="btn-ghost !py-2 !text-xs" disabled={loading} onClick={() => setLimit((l) => l + PAGE)}>
                  {loading ? "Carregando…" : `Mostrar mais (${count - rows.length} restantes)`}
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="py-10 text-center text-sm text-ash-400">Nenhuma campanha com esses filtros.</p>
        )}
      </Panel>
    </>
  );
}
