// Cálculos do painel. Funções puras que recebem a lista de campanhas
// (reais, vindas do banco, ou de demonstração) e devolvem totais e séries.

import type { Campaign, CampaignStatus, DailyPoint, Platform, Source, Totals } from "./types";

export type Period = 7 | 14 | 30 | 90;
export type TermScope = "any" | "campaign" | "adset" | "ad";

/** Filtros do painel. Todos se somam (E): cada um estreita o resultado. */
export interface Filters {
  period: Period;
  platform: Platform | "all";
  /** clientes escolhidos (vazio = todos) */
  clients: string[];
  /** status das campanhas (vazio = todos) */
  statuses: CampaignStatus[];
  /** conectadas (api) e/ou manuais (vazio = ambas) */
  sources: Source[];
  /** nome ou ID contém QUALQUER um destes termos */
  include: string[];
  /** nome ou ID NÃO contém nenhum destes termos */
  exclude: string[];
  /** onde procurar os termos */
  scope: TermScope;
}

export const defaultFilters: Filters = { period: 30, platform: "all", clients: [], statuses: [], sources: [], include: [], exclude: [], scope: "any" };

/** Quantos filtros "avançados" estão ligados (para o contador do botão). */
export function activeFilterCount(f: Filters) {
  return (f.clients.length ? 1 : 0) + (f.statuses.length ? 1 : 0) + (f.sources.length ? 1 : 0) + (f.include.length ? 1 : 0) + (f.exclude.length ? 1 : 0) + (f.platform !== "all" ? 1 : 0);
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function hits(text: string, terms: string[]) {
  const t = norm(text);
  return terms.some((x) => x.trim() && t.includes(norm(x.trim())));
}

type Partialish = Partial<Filters> & { clientId?: string };

/** Aplica os filtros e corta o período. Com termos em conjunto/anúncio, mostra só os criativos que batem. */
export function filterCampaigns(all: Campaign[], raw: Partialish = {}) {
  const f = { ...defaultFilters, ...raw };
  const inc = f.include.filter((t) => t.trim());
  const exc = f.exclude.filter((t) => t.trim());
  const out: Campaign[] = [];

  for (const c of all) {
    if (f.platform !== "all" && c.platform !== f.platform) continue;
    if (raw.clientId && raw.clientId !== "all" && c.clientId !== raw.clientId) continue;
    if (f.clients.length && !f.clients.includes(c.clientId)) continue;
    if (f.statuses.length && !f.statuses.includes(c.status)) continue;
    if (f.sources.length && !f.sources.includes(c.source)) continue;

    let creatives = c.creatives;
    const adsets = c.adsets ?? [];
    const campText = `${c.name} ${c.id}`;
    const setText = (id?: string) => {
      const s = adsets.find((x) => x.id === id);
      return s ? s.name : "";
    };
    const adText = (cr: Campaign["creatives"][number]) => `${cr.name} ${cr.headline} ${cr.id}`;

    if (inc.length) {
      if (f.scope === "campaign") {
        if (!hits(campText, inc)) continue;
      } else if (f.scope === "adset") {
        const ok = adsets.filter((s) => hits(s.name, inc)).map((s) => s.id);
        if (!ok.length) continue;
        creatives = creatives.filter((cr) => cr.adSetId && ok.includes(cr.adSetId));
      } else if (f.scope === "ad") {
        creatives = creatives.filter((cr) => hits(adText(cr), inc));
        if (!creatives.length) continue;
      } else {
        // qualquer nível: a campanha inteira entra se o nome dela bater; senão, só as partes que batem
        if (!hits(campText, inc)) {
          const sets = adsets.filter((s) => hits(s.name, inc)).map((s) => s.id);
          const matched = creatives.filter((cr) => hits(adText(cr), inc) || (cr.adSetId && sets.includes(cr.adSetId)));
          if (!matched.length && !sets.length) continue;
          creatives = matched;
        }
      }
    }
    if (exc.length) {
      if ((f.scope === "campaign" || f.scope === "any") && hits(campText, exc)) continue;
      if (f.scope === "adset" || f.scope === "any") creatives = creatives.filter((cr) => !hits(setText(cr.adSetId), exc));
      if (f.scope === "ad" || f.scope === "any") creatives = creatives.filter((cr) => !hits(adText(cr), exc));
    }

    out.push({ ...c, creatives, daily: c.daily.slice(-f.period) });
  }
  return out;
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
  // O alcance de 30 dias vem pronto da Meta; para outros períodos é uma estimativa proporcional
  const reach = list.reduce((a, c) => a + c.reach * Math.min(1, days / 30), 0);
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
  const available = all[0]?.daily.length ?? 0;
  if (available < f.period * 2) return null;
  const full = filterCampaigns(all, { ...f, period: available as Period });
  const prev = full.map((c) => ({ ...c, daily: c.daily.slice(-f.period * 2, -f.period) }));
  if (!prev.length) return null;
  return totalsOf(prev);
}

export function topCreatives(list: Campaign[], n = 6) {
  return list
    .flatMap((c) => c.creatives.map((cr) => ({ ...cr, campaign: c })))
    .sort((a, b) => b.conversions - a.conversions || b.spend - a.spend)
    .slice(0, n);
}
