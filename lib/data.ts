// Cálculos do painel. Funções puras que recebem a lista de campanhas
// (reais, vindas do banco, ou de demonstração) e devolvem totais e séries.

import type { Campaign, DailyPoint, Platform, Totals } from "./types";

export type Period = 7 | 14 | 30;

export interface Filters {
  period: Period;
  platform: Platform | "all";
  clientId: string | "all";
}

export const defaultFilters: Filters = { period: 30, platform: "all", clientId: "all" };

export function filterCampaigns(all: Campaign[], f: Partial<Filters> = {}) {
  const { platform = "all", clientId = "all", period = 30 } = f;
  return all
    .filter((c) => (platform === "all" ? true : c.platform === platform))
    .filter((c) => (clientId === "all" ? true : c.clientId === clientId))
    .map((c) => ({ ...c, daily: c.daily.slice(-period) }));
}

export function sumDaily(points: DailyPoint[]) {
  return points.reduce(
    (a, p) => ({
      spend: a.spend + p.spend,
      impressions: a.impressions + p.impressions,
      clicks: a.clicks + p.clicks,
      conversions: a.conversions + p.conversions,
      revenue: a.revenue + p.revenue,
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 },
  );
}

export function totalsOf(list: Campaign[]): Totals {
  const base = sumDaily(list.flatMap((c) => c.daily));
  const days = list[0]?.daily.length ?? 30;
  const reach = list.reduce((a, c) => a + c.reach * (days / 30), 0);
  return {
    ...base,
    reach,
    ctr: base.impressions ? (base.clicks / base.impressions) * 100 : 0,
    cpc: base.clicks ? base.spend / base.clicks : 0,
    cpm: base.impressions ? (base.spend / base.impressions) * 1000 : 0,
    cpa: base.conversions ? base.spend / base.conversions : 0,
    roas: base.spend ? base.revenue / base.spend : 0,
  };
}

export function campaignTotals(c: Campaign) {
  return totalsOf([c]);
}

/** Série diária somada, separada por plataforma. */
export function dailySeries(list: Campaign[]) {
  const map = new Map<string, { date: string; meta: number; google: number; revenue: number; conversions: number; clicks: number; impressions: number }>();
  for (const c of list) {
    for (const p of c.daily) {
      const row = map.get(p.date) ?? { date: p.date, meta: 0, google: 0, revenue: 0, conversions: 0, clicks: 0, impressions: 0 };
      row[c.platform] += p.spend;
      row.revenue += p.revenue;
      row.conversions += p.conversions;
      row.clicks += p.clicks;
      row.impressions += p.impressions;
      map.set(p.date, row);
    }
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Compara o período atual com o período imediatamente anterior (para as setas de variação). */
export function previousTotals(all: Campaign[], f: Filters) {
  const full = filterCampaigns(all, { ...f, period: 30 });
  const prev = full.map((c) => ({ ...c, daily: c.daily.slice(-f.period * 2, -f.period) }));
  if (!prev.length || prev[0].daily.length === 0) return null;
  return totalsOf(prev);
}

export function topCreatives(list: Campaign[], n = 6) {
  return list
    .flatMap((c) => c.creatives.map((cr) => ({ ...cr, campaign: c })))
    .sort((a, b) => b.conversions - a.conversions || b.spend - a.spend)
    .slice(0, n);
}
