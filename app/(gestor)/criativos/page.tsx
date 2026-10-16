"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Search } from "lucide-react";
import CreativeCard from "@/components/CreativeCard";
import FilterBar from "@/components/FilterBar";
import { PageHeader } from "@/components/ui";
import { useDebounced, usePref } from "@/components/Prefs";
import { useFilters } from "@/components/useFilters";
import { useView } from "@/components/useView";
import type { CreativesData } from "@/lib/views";

const PAGE = 40;

export default function CriativosPage() {
  const [filters, setFilters] = useFilters("creatives");
  const [prefs, setPrefs] = usePref("creatives.view", { state: "all" as "all" | "active" | "inactive" });
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const q = useDebounced(search, 300);

  // Filtro, busca e ordem no servidor; chegam só os criativos mostrados (40 por vez)
  const filtersKey = JSON.stringify(filters);
  useEffect(() => setLimit(PAGE), [filtersKey, prefs.state, q]);
  const { data, loading, error } = useView<CreativesData>({ view: "creatives", filters, state: prefs.state, search: q.trim(), limit });
  const creatives = data?.rows ?? [];
  const count = data?.count ?? 0;

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
      {error && !data && <p className="py-16 text-center text-sm text-bad">{error}</p>}
      {!data && !error && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="glass aspect-[4/5] animate-pulse" />
          ))}
        </div>
      )}
      {data && !creatives.length && <p className="py-16 text-center text-sm text-ash-400">Nenhum criativo com esses filtros.</p>}
      <div className={`grid grid-cols-1 gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 ${loading && data ? "opacity-60" : ""}`}>
        {creatives.map((c, i) => (
          <CreativeCard key={c.id} c={c} campaign={c.campaign} index={i % PAGE} />
        ))}
      </div>
      {count > creatives.length && (
        <div className="mt-6 text-center">
          <button className="btn-ghost !py-2 !text-xs" disabled={loading} onClick={() => setLimit((l) => l + PAGE)}>
            {loading ? "Carregando…" : `Mostrar mais (${count - creatives.length} restantes)`}
          </button>
        </div>
      )}
    </>
  );
}
