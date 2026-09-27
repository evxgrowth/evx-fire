"use client";

import { useMemo, useState } from "react";
import CreativeCard from "@/components/CreativeCard";
import FilterBar from "@/components/FilterBar";
import { PageHeader } from "@/components/ui";
import { defaultFilters, filterCampaigns, topCreatives, type Filters } from "@/lib/data";
import { useData } from "@/components/DataProvider";

export default function CriativosPage() {
  const { campaigns } = useData();
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const creatives = useMemo(() => topCreatives(filterCampaigns(campaigns, filters), 999), [campaigns, filters]);
  return (
    <>
      <PageHeader title="Criativos" subtitle="Imagens, vídeos e anúncios que estão rodando — ordenados por resultado." />
      <div className="mb-5">
        <FilterBar filters={filters} onChange={setFilters} />
      </div>
      {!creatives.length && <p className="py-16 text-center text-sm text-ash-400">Nenhum criativo no período.</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {creatives.map((c, i) => (
          <CreativeCard key={c.id} c={c} campaign={c.campaign} index={i} />
        ))}
      </div>
    </>
  );
}
