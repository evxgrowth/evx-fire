"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Search } from "lucide-react";
import CreativeCard from "@/components/CreativeCard";
import FilterBar from "@/components/FilterBar";
import { PageHeader } from "@/components/ui";
import { useData } from "@/components/DataProvider";
import { useDebounced, usePref } from "@/components/Prefs";
import { defaultFilters, filterCampaigns, topCreatives, type Filters } from "@/lib/data";

const PAGE = 40;
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export default function CriativosPage() {
  const { campaigns, clients } = useData();
  const [prefs, setPrefs] = usePref("creatives.filters", { ...defaultFilters, state: "all" as "all" | "active" | "inactive" });
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const q = useDebounced(search, 300);
  const filters: Filters = { period: prefs.period, platform: prefs.platform, clientId: clients.some((c) => c.id === prefs.clientId) ? prefs.clientId : "all" };

  const creatives = useMemo(() => {
    let list = topCreatives(filterCampaigns(campaigns, filters), 9999);
    if (prefs.state !== "all") list = list.filter((c) => c.active === (prefs.state === "active"));
    if (q.trim()) {
      const t = norm(q.trim());
      list = list.filter((c) => norm(`${c.name} ${c.headline} ${c.campaign.name}`).includes(t));
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaigns, JSON.stringify(filters), prefs.state, q]);

  return (
    <>
      <PageHeader title="Criativos" subtitle="Imagens, vídeos e anúncios, ordenados por resultado." />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <FilterBar filters={filters} onChange={(f) => setPrefs({ ...prefs, ...f })} />
        <div className="inline-flex rounded-xl border border-white/5 bg-black/30 p-1 text-xs">
          {(
            [
              ["all", "Todos"],
              ["active", "Rodando"],
              ["inactive", "Parados"],
            ] as const
          ).map(([v, l]) => (
            <button key={v} onClick={() => setPrefs({ ...prefs, state: v })} className={clsx("rounded-lg px-3 py-1.5 font-medium", prefs.state === v ? "bg-fire-500/15 text-white" : "text-ash-400 hover:text-white")}>
              {l}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ash-400" />
          <input className="input !py-2 !pl-9" placeholder="Buscar criativo ou campanha…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      {!creatives.length && <p className="py-16 text-center text-sm text-ash-400">Nenhum criativo com esses filtros.</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {creatives.slice(0, limit).map((c, i) => (
          <CreativeCard key={c.id} c={c} campaign={c.campaign} index={i % PAGE} />
        ))}
      </div>
      {creatives.length > limit && (
        <div className="mt-6 text-center">
          <button className="btn-ghost !py-2 !text-xs" onClick={() => setLimit((l) => l + PAGE)}>
            Mostrar mais ({creatives.length - limit} restantes)
          </button>
        </div>
      )}
    </>
  );
}
