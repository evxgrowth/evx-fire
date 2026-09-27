"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Plus, Search, X } from "lucide-react";
import CampaignTable from "@/components/CampaignTable";
import FilterBar from "@/components/FilterBar";
import { statusLabels } from "@/components/StatusLed";
import { Panel, PageHeader } from "@/components/ui";
import { useData } from "@/components/DataProvider";
import { useDebounced, usePref } from "@/components/Prefs";
import { defaultFilters, filterCampaigns, type Filters } from "@/lib/data";
import type { CampaignStatus, Source } from "@/lib/types";

const statuses: (CampaignStatus | "all")[] = ["all", "active", "learning", "paused", "ended"];
const PAGE = 50;

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export default function CampanhasPage() {
  const { campaigns, clients, demo } = useData();
  const [prefs, setPrefs] = usePref("campaigns.filters", {
    ...defaultFilters,
    status: "all" as CampaignStatus | "all",
    source: "all" as Source | "all",
  });
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const q = useDebounced(search, 300);

  const filters: Filters = { period: prefs.period, platform: prefs.platform, clientId: clients.some((c) => c.id === prefs.clientId) ? prefs.clientId : "all" };
  const base = useMemo(() => {
    const list = filterCampaigns(campaigns, filters);
    const bySource = prefs.source === "all" ? list : list.filter((c) => c.source === prefs.source);
    if (!q.trim()) return bySource;
    const t = norm(q.trim());
    return bySource.filter((c) => norm(c.name).includes(t) || c.id.includes(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaigns, JSON.stringify(filters), prefs.source, q]);
  const list = prefs.status === "all" ? base : base.filter((c) => c.status === prefs.status);

  return (
    <>
      <PageHeader title="Campanhas" subtitle="Campanhas conectadas (Meta Ads e Google Ads) e campanhas cadastradas manualmente.">
        {!demo && (
          <Link href="/campanhas/nova" className="btn-fire">
            <Plus size={16} /> Campanha manual
          </Link>
        )}
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <FilterBar filters={filters} onChange={(f) => setPrefs({ ...prefs, ...f })} />
        <div className="inline-flex rounded-xl border border-white/5 bg-black/30 p-1 text-xs">
          {(
            [
              ["all", "Todas"],
              ["api", "Conectadas"],
              ["manual", "Manuais"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setPrefs({ ...prefs, source: v })}
              className={clsx("rounded-lg px-3 py-1.5 font-medium transition-colors", prefs.source === v ? "bg-fire-500/15 text-white" : "text-ash-400 hover:text-white")}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {statuses.map((s) => {
          const count = s === "all" ? base.length : base.filter((c) => c.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setPrefs({ ...prefs, status: s })}
              className={clsx(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-all",
                prefs.status === s ? "border-fire-500/50 bg-fire-500/15 text-white shadow-[0_0_14px_-4px_rgba(255,92,0,.8)]" : "border-white/10 text-ash-300 hover:border-white/20",
              )}
            >
              {s !== "all" && <span className={`led led-${s}`} />}
              {s === "all" ? "Todas" : statusLabels[s]}
              <span className="text-ash-400">{count}</span>
            </button>
          );
        })}
        <div className="relative ml-auto w-full sm:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ash-400" />
          <input className="input !py-2 !pl-9 !pr-8" placeholder="Buscar por nome ou ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ash-400 hover:text-white" aria-label="Limpar busca">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <Panel>
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
