"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, X } from "lucide-react";
import CampaignTable from "@/components/CampaignTable";
import FilterBar from "@/components/FilterBar";
import { Panel, PageHeader } from "@/components/ui";
import { useData } from "@/components/DataProvider";
import { useDebounced } from "@/components/Prefs";
import { useFilters } from "@/components/useFilters";
import { filterCampaigns } from "@/lib/data";
const PAGE = 50;

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export default function CampanhasPage() {
  const { campaigns, demo } = useData();
  const [filters, setFilters] = useFilters("campaigns");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const q = useDebounced(search, 300);

  const list = useMemo(() => {
    const base = filterCampaigns(campaigns, filters);
    if (!q.trim()) return base;
    const t = norm(q.trim());
    return base.filter((c) => norm(c.name).includes(t) || c.id.includes(t) || (c.adsets ?? []).some((s) => norm(s.name).includes(t)) || c.creatives.some((cr) => norm(cr.name).includes(t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaigns, JSON.stringify(filters), q]);
  const active = list.filter((c) => c.status === "active").length;

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

      <Panel title={`${list.length} campanha(s)`} subtitle={`${active} ativa(s) · ordenadas por investimento no período`}>
        {list.length ? (
          <>
            <CampaignTable campaigns={list.slice(0, limit)} linkBase="/campanhas" />
            {list.length > limit && (
              <div className="mt-4 text-center">
                <button className="btn-ghost !py-2 !text-xs" onClick={() => setLimit((l) => l + PAGE)}>
                  Mostrar mais ({list.length - limit} restantes)
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
