"use client";

import { useMemo } from "react";
import { Banknote, Eye, MousePointerClick, Percent, ShoppingCart, Target, TrendingUp, Users } from "lucide-react";
import { FileDown } from "lucide-react";
import { dailySeries, filterCampaigns, previousTotals, topCreatives, totalsOf, type Filters } from "@/lib/data";
import { useData } from "./DataProvider";
import { useFilters } from "./useFilters";
import { fmtMoney, fmtNum, fmtNumShort, fmtPct, fmtX } from "@/lib/format";
import KpiCard, { type KpiProps } from "./KpiCard";
import FilterBar from "./FilterBar";
import { Funnel, Legend, PlatformDonut, RevenueChart, SERIES, SpendChart } from "./charts";
import CampaignTable from "./CampaignTable";
import CreativeCard from "./CreativeCard";
import { Panel } from "./ui";

/**
 * Painel principal. Usado tanto pelo gestor quanto pelo link compartilhado
 * com o cliente (nesse caso o cliente vem fixo e não aparece o seletor).
 */
export default function DashboardView({
  fixedClientId,
  campaignLinkBase,
  hideRevenue = false,
  hideCreatives = false,
  reportHref,
}: {
  /** endereço do relatório em PDF (os filtros atuais vão junto) */
  reportHref?: string;
  fixedClientId?: string;
  campaignLinkBase?: string;
  hideRevenue?: boolean;
  hideCreatives?: boolean;
}) {
  const { campaigns: all } = useData();
  const [saved, setFilters] = useFilters();
  // No link do cliente, o cliente vem fixo
  const filters: Filters = fixedClientId ? { ...saved, clients: [fixedClientId] } : saved;

  const data = useMemo(() => {
    const list = filterCampaigns(all, filters);
    const totals = totalsOf(list);
    const prev = previousTotals(all, filters);
    const series = dailySeries(list);
    const meta = list.filter((c) => c.platform === "meta");
    const google = list.filter((c) => c.platform === "google");
    return {
      list,
      totals,
      prev,
      series,
      metaSpend: totalsOf(meta).spend,
      googleSpend: totalsOf(google).spend,
      creatives: topCreatives(list, 4),
      tableList: list.filter((c) => c.status === "active" || c.daily.some((d) => d.spend > 0)),
      active: list.filter((c) => c.status === "active" || c.status === "learning").length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, JSON.stringify(filters)]);

  const { totals: t, prev } = data;
  const delta = (k: keyof typeof t) => (prev && prev[k] ? ((t[k] - prev[k]) / prev[k]) * 100 : null);
  const s = data.series;

  const allKpis: KpiProps[] = [
    { id: "spend", label: "Investimento", value: t.spend, format: fmtMoney, icon: Banknote, delta: delta("spend"), spark: s.map((d) => d.meta + d.google), highlight: true },
    { id: "revenue", label: "Receita", value: t.revenue, format: fmtMoney, icon: TrendingUp, delta: delta("revenue"), spark: s.map((d) => d.revenue) },
    { id: "roas", label: "ROAS", value: t.roas, format: fmtX, icon: Target, delta: delta("roas") },
    { id: "conv", label: "Vendas / Leads", value: t.conversions, format: fmtNum, icon: ShoppingCart, delta: delta("conversions"), spark: s.map((d) => d.conversions) },
    { id: "imp", label: "Impressões", value: t.impressions, format: fmtNumShort, icon: Eye, delta: delta("impressions") },
    { id: "reach", label: "Alcance", value: t.reach, format: fmtNumShort, icon: Users },
    { id: "clicks", label: "Cliques", value: t.clicks, format: fmtNum, icon: MousePointerClick, delta: delta("clicks"), spark: s.map((d) => d.clicks) },
    { id: "ctr", label: "CTR", value: t.ctr, format: (v) => fmtPct(v), icon: Percent, delta: delta("ctr") },
  ];
  const kpis = hideRevenue ? allKpis.filter((k) => k.id !== "revenue" && k.id !== "roas") : allKpis;

  const legend = [
    ...(filters.platform !== "google" ? [{ color: SERIES.meta, label: "Meta Ads" }] : []),
    ...(filters.platform !== "meta" ? [{ color: SERIES.google, label: "Google Ads" }] : []),
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <FilterBar filters={filters} onChange={setFilters} lockClient={!!fixedClientId} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ash-400">
          <span>
            <b className="text-white">{data.active}</b> campanhas rodando
          </span>
          <span>
            CPC <b className="text-white">{fmtMoney(t.cpc)}</b>
          </span>
          <span>
            CPA <b className="text-white">{fmtMoney(t.cpa)}</b>
          </span>
          <span>
            CPM <b className="text-white">{fmtMoney(t.cpm)}</b>
          </span>
          {reportHref && (
            <a
              href={`${reportHref}?f=${encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(filters)))))}`}
              target="_blank"
              className="btn-fire !px-3 !py-2 !text-xs"
            >
              <FileDown size={14} /> Relatório PDF
            </a>
          )}
        </div>
      </div>

      {!data.list.length && (
        <div className="glass p-8 text-center text-sm text-ash-400">Nenhuma campanha com esses filtros.</div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k, i) => (
          <KpiCard key={k.id} {...k} index={i} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="Investimento diário"
          subtitle={`Últimos ${filters.period} dias, por plataforma`}
          action={<Legend items={legend} />}
          delay={0.2}
        >
          <SpendChart data={s} showMeta={filters.platform !== "google"} showGoogle={filters.platform !== "meta"} />
        </Panel>
        <Panel title="Divisão do investimento" subtitle="Meta Ads x Google Ads" delay={0.28}>
          <PlatformDonut meta={data.metaSpend} google={data.googleSpend} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {!hideRevenue && (
          <Panel className="xl:col-span-2" title="Receita diária" subtitle="Valor gerado pelas vendas atribuídas aos anúncios" delay={0.3}>
            <RevenueChart data={s} />
          </Panel>
        )}
        <Panel className={hideRevenue ? "xl:col-span-3" : undefined} title="Funil de conversão" subtitle="Do anúncio visto até a venda" delay={0.36}>
          <Funnel impressions={t.impressions} clicks={t.clicks} conversions={t.conversions} />
        </Panel>
      </div>

      <Panel title="Campanhas" subtitle="Com veiculação no período, ordenadas por investimento" delay={0.4}>
        <CampaignTable campaigns={data.tableList} linkBase={campaignLinkBase} />
      </Panel>

      {!hideCreatives && (
      <div>
        <h3 className="mb-3 font-display text-[15px] font-semibold text-white">Criativos com melhor resultado</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {data.creatives.map((c, i) => (
            <CreativeCard key={c.id} c={c} campaign={c.campaign} index={i} />
          ))}
        </div>
      </div>
      )}
    </div>
  );
}
