"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Search } from "lucide-react";
import CreativeCard from "@/components/CreativeCard";
import FilterBar from "@/components/FilterBar";
import { PageHeader } from "@/components/ui";
import { useData } from "@/components/DataProvider";
import { useDebounced, usePref } from "@/components/Prefs";
import { filterCampaigns, topCreatives } from "@/lib/data";
import { useFilters } from "@/components/useFilters";

const PAGE = 40;
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export default function CriativosPage() {
  const { campaigns } = useData();
  const [filters, setFilters] = useFilters("creatives");
  const [prefs, setPrefs] = usePref("creatives.view", { state: "all" as "all" | "active" | "inactive" });
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const q = useDebounced(search, 300);

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
      <div className="mb-5 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <FilterBar
            filters={filters}
            onChange={setFilters}
            extraCount={prefs.state !== "all" ? 1 : 0}
            onClearExtra={() => setPrefs({ ...prefs, state: "all" })}
            extra={
              <div>
                <div className="mb-2 text-xs font-medium text-ash-300">Criativo</div>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["all", "Todos"],
                      ["active", "Rodando"],
                      ["inactive", "Parados"],
                    ] as const
                  ).map(([v, l]) => (
                    <button
                      key={v}
                      onClick={() => setPrefs({ ...prefs, state: v })}
                      className={clsx(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-all",
                        prefs.state === v ? "border-fire-500/50 bg-fire-500/15 text-white shadow-[0_0_14px_-4px_rgba(255,92,0,.8)]" : "border-white/10 text-ash-300 hover:border-white/20",
                      )}
                    >
                      {v !== "all" && <span className={`led ${v === "active" ? "led-active" : "led-paused"}`} />}
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            }
          />
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
