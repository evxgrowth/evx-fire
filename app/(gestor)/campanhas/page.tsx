"use client";

import { useMemo, useState } from "react";
import CampaignTable from "@/components/CampaignTable";
import FilterBar from "@/components/FilterBar";
import { statusLabels } from "@/components/StatusLed";
import { Panel, PageHeader } from "@/components/ui";
import { defaultFilters, filterCampaigns, type Filters } from "@/lib/data";
import { useData } from "@/components/DataProvider";
import type { CampaignStatus } from "@/lib/types";
import clsx from "clsx";

const statuses: (CampaignStatus | "all")[] = ["all", "active", "learning", "paused", "ended"];

export default function CampanhasPage() {
  const { campaigns } = useData();
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [status, setStatus] = useState<CampaignStatus | "all">("all");
  const all = useMemo(() => filterCampaigns(campaigns, filters), [campaigns, filters]);
  const list = status === "all" ? all : all.filter((c) => c.status === status);

  return (
    <>
      <PageHeader title="Campanhas" subtitle="Todas as campanhas de Meta Ads e Google Ads das suas contas conectadas." />
      <div className="mb-4">
        <FilterBar filters={filters} onChange={setFilters} />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {statuses.map((s) => {
          const count = s === "all" ? all.length : all.filter((c) => c.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={clsx(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-all",
                status === s ? "border-fire-500/50 bg-fire-500/15 text-white shadow-[0_0_14px_-4px_rgba(255,92,0,.8)]" : "border-white/10 text-ash-300 hover:border-white/20",
              )}
            >
              {s !== "all" && <span className={`led led-${s}`} />}
              {s === "all" ? "Todas" : statusLabels[s]}
              <span className="text-ash-400">{count}</span>
            </button>
          );
        })}
      </div>
      <Panel>
        {list.length ? (
          <CampaignTable campaigns={list} linkBase="/campanhas" />
        ) : (
          <p className="py-10 text-center text-sm text-ash-400">Nenhuma campanha com esses filtros.</p>
        )}
      </Panel>
    </>
  );
}
