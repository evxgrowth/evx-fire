// Dados prontos de cada tela ("visões"). Arquivo puro: vale no navegador e no servidor.
//
// Em produção, quem calcula é o banco (função fire_view), e o navegador recebe só o resultado.
// Aqui fica o MESMO cálculo feito sobre uma lista de campanhas em memória (computeView), usado:
//  - no modo demonstração (agência sem contas), com os dados de exemplo;
//  - como gabarito: scripts/verify-views.mts compara banco × este cálculo nos dados reais.

import { dailySeries, filterCampaigns, type Filters } from "./data";
import { HISTORY_DAYS, toCreative, type PackedCreative } from "./packed";
import { periodRange, previousRange, todaySP } from "./period";
import type { Campaign, CampaignStatus, Creative, Platform, Source, Totals } from "./types";

/** Quantas campanhas cabem na tabela do relatório em PDF. */
export const REPORT_ROWS = 22;

export type ViewName = "dashboard" | "report" | "campaigns" | "creatives" | "clients" | "campaign";

/** O que a tela pede. */
export interface ViewRequest {
  view: ViewName;
  filters?: Filters;
  /** campanhas e criativos: quantas linhas trazer */
  limit?: number;
  /** painel e relatório: quantos criativos de destaque */
  top?: number;
  search?: string;
  /** criativos: todos, rodando ou parados */
  state?: "all" | "active" | "inactive";
  /** detalhe de campanha */
  id?: string;
}

/** Pedido com as datas já calculadas (fuso de São Paulo). É o que vai ao banco e compõe a chave do cache. */
export interface ResolvedView extends ViewRequest {
  since: string;
  until: string;
  days: number;
  prev_since: string;
  prev_until: string;
  prev_days: number;
  hist_since: string;
}

export interface Sums {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
}

export interface CampRow extends Sums {
  id: string;
  name: string;
  platform: Platform;
  source: Source;
  status: CampaignStatus;
  objective: string;
  clientId: string | null;
}

export type CreativeRow = Creative & { campaign: { id: string; name: string; platform: Platform } };

export interface SeriesPoint {
  date: string;
  meta: number;
  google: number;
  revenue: number;
  conversions: number;
  clicks: number;
  impressions: number;
}

export interface DashboardData {
  count: number;
  /** ativas + em análise */
  running: number;
  /** só ativas */
  activeOnly: number;
  totals: Sums & { reach: number };
  prev: (Sums & { reach: number }) | null;
  series: SeriesPoint[];
  metaSpend: number;
  googleSpend: number;
  /** campanhas com veiculação no período (ou ativas), por investimento */
  table: CampRow[];
  tableTotal: number;
  best: CampRow | null;
  most: CampRow | null;
  creatives: CreativeRow[];
}

export interface CampaignsData {
  count: number;
  active: number;
  rows: CampRow[];
}

export interface CreativesData {
  count: number;
  rows: CreativeRow[];
}

export interface ClientStats {
  spend: number;
  conversions: number;
  revenue: number;
  running: number;
  manual: number;
  count: number;
}

export interface ClientsData {
  stats: Record<string, ClientStats>;
}

export interface CampaignData {
  campaign: { id: string; name: string; platform: Platform; source: Source; status: CampaignStatus; objective: string; dailyBudget: number; clientId: string | null; clientName: string | null };
  totals: Sums & { reach: number };
  series: SeriesPoint[];
  creatives: CreativeRow[];
}

export type ViewData = DashboardData | CampaignsData | CreativesData | ClientsData | CampaignData | null;

const shift = (iso: string, days: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Calcula as datas do pedido. A tela de clientes usa sempre "Este mês" (como antes). */
export function resolveView(r: ViewRequest, today = todaySP()): ResolvedView {
  const period = r.view === "clients" ? "month" : (r.filters?.period ?? "month");
  const range = periodRange(period, today);
  const prev = previousRange(range);
  return {
    ...r,
    since: r.view === "campaign" ? shift(today, -(HISTORY_DAYS - 1)) : range.since,
    until: today,
    days: range.days,
    prev_since: prev.since,
    prev_until: prev.until,
    prev_days: prev.days,
    hist_since: shift(today, -(HISTORY_DAYS - 1)),
  };
}

/** Indicadores derivados (CTR, CPC, CPM, CPA, ROAS) a partir das somas. */
export function derive(s: Sums & { reach?: number }): Totals {
  return {
    spend: s.spend,
    impressions: s.impressions,
    clicks: s.clicks,
    conversions: s.conversions,
    revenue: s.revenue,
    reach: s.reach ?? 0,
    ctr: s.impressions ? (s.clicks / s.impressions) * 100 : 0,
    cpc: s.clicks ? s.spend / s.clicks : 0,
    cpm: s.impressions ? (s.spend / s.impressions) * 1000 : 0,
    cpa: s.conversions ? s.spend / s.conversions : 0,
    roas: s.spend ? s.revenue / s.spend : 0,
  };
}

/** Converte números que o banco devolve como texto (numeric) e abre os anúncios. */
export function normalizeView(view: ViewName, raw: unknown): ViewData {
  if (!raw) return null;
  const num = <T extends object>(o: T): T => {
    const out = { ...o } as Record<string, unknown>;
    for (const k of ["spend", "impressions", "clicks", "conversions", "revenue", "reach", "meta", "google", "dailyBudget"]) if (k in out && out[k] != null) out[k] = Number(out[k]);
    return out as T;
  };
  const cr = (c: PackedCreative & { cn: string; cp: Platform }): CreativeRow => ({ ...toCreative(c), campaign: { id: c.c, name: c.cn, platform: c.cp } });
  const r = raw as Record<string, unknown>;
  if (view === "dashboard" || view === "report") {
    const d = r as unknown as DashboardData;
    return {
      ...d,
      count: Number(d.count),
      running: Number(d.running),
      activeOnly: Number(d.activeOnly),
      totals: num(d.totals),
      prev: d.prev ? num(d.prev) : null,
      series: d.series.map(num),
      metaSpend: Number(d.metaSpend),
      googleSpend: Number(d.googleSpend),
      table: d.table.map(num),
      tableTotal: Number(d.tableTotal),
      best: d.best ? num(d.best) : null,
      most: d.most ? num(d.most) : null,
      creatives: (d.creatives as unknown as Parameters<typeof cr>[0][]).map(cr),
    };
  }
  if (view === "campaigns") {
    const d = r as unknown as CampaignsData;
    return { count: Number(d.count), active: Number(d.active), rows: d.rows.map(num) };
  }
  if (view === "creatives") {
    const d = r as unknown as CreativesData;
    return { count: Number(d.count), rows: (d.rows as unknown as Parameters<typeof cr>[0][]).map(cr) };
  }
  if (view === "clients") {
    const d = r as unknown as ClientsData;
    return { stats: Object.fromEntries(Object.entries(d.stats ?? {}).map(([k, v]) => [k, num({ ...v, running: Number(v.running), manual: Number(v.manual), count: Number(v.count) })])) };
  }
  const d = r as unknown as CampaignData;
  return { campaign: num(d.campaign), totals: num(d.totals), series: d.series.map(num), creatives: (d.creatives as unknown as Parameters<typeof cr>[0][]).map(cr) };
}

/** Link do cliente com "mostrar receita" desligado: a receita nem sai do servidor. */
export function stripRevenue(d: DashboardData): DashboardData {
  const z = <T extends { revenue: number }>(o: T): T => ({ ...o, revenue: 0 });
  return {
    ...d,
    totals: z(d.totals),
    prev: d.prev ? z(d.prev) : null,
    series: d.series.map(z),
    table: d.table.map(z),
    best: d.best ? z(d.best) : null,
    most: d.most ? z(d.most) : null,
  };
}

// ---------------- cálculo em memória (demonstração e gabarito) ----------------

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const sumOf = (list: Campaign[]): Sums => {
  const s = { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
  for (const c of list)
    for (const p of c.daily) {
      s.spend += p.spend;
      s.impressions += p.impressions;
      s.clicks += p.clicks;
      s.conversions += p.conversions;
      s.revenue += p.revenue;
    }
  return s;
};

const rowOf = (c: Campaign): CampRow => ({
  id: c.id,
  name: c.name,
  platform: c.platform,
  source: c.source,
  status: c.status,
  objective: c.objective,
  clientId: c.clientId || null,
  ...sumOf([c]),
});

// Ordenação igual à do banco: valores comparados em centavos (o banco soma em decimal exato) e empate pelo id
const cents = (v: number) => Math.round(v * 100);
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const bySpend = (a: CampRow, b: CampRow) => cents(b.spend) - cents(a.spend) || byId(a, b);
const byResult = (a: Creative, b: Creative) => b.conversions - a.conversions || cents(b.spend) - cents(a.spend) || byId(a, b);
const crRows = (list: Campaign[]): CreativeRow[] => list.flatMap((c) => c.creatives.map((cr) => ({ ...cr, campaign: { id: c.id, name: c.name, platform: c.platform } })));

/** Mesmo resultado de fire_view, calculado sobre a base inteira em memória. */
export function computeView(all: Campaign[], r: ResolvedView): ViewData {
  const range = { since: r.since, until: r.until, days: r.days };
  const f = r.filters;
  const lim = Math.max(1, Math.min(r.limit ?? 50, 2000));

  if (r.view === "dashboard" || r.view === "report") {
    const list = filterCampaigns(all, { ...f, range });
    const hasHist = list.some((c) => c.daily.length > 0);
    const base = sumOf(list);
    const reach = list.reduce((a, c) => a + c.reach, 0) * (hasHist ? Math.min(1, r.days / 30) : 1);
    // comparação: só se o período anterior inteiro couber no histórico de 90 dias
    const anyHist = all.some((c) => c.daily.length > 0);
    let prev: DashboardData["prev"] = null;
    if (anyHist && r.prev_since >= r.hist_since) {
      const pl = filterCampaigns(all, { ...f, range: { since: r.prev_since, until: r.prev_until, days: r.prev_days } });
      prev = { ...sumOf(pl), reach: pl.reduce((a, c) => a + c.reach, 0) * Math.min(1, r.prev_days / 30) };
    }
    const rows = list.map(rowOf);
    const tbl = rows.filter((x) => x.spend > 0 || x.status === "active").sort(bySpend);
    const best = tbl.filter((x) => x.conversions > 0).sort((a, b) => a.spend / a.conversions - b.spend / b.conversions || bySpend(a, b))[0] ?? null;
    const most = [...tbl].sort((a, b) => Math.round(b.conversions) - Math.round(a.conversions) || bySpend(a, b))[0] ?? null;
    return {
      count: list.length,
      running: list.filter((c) => c.status === "active" || c.status === "learning").length,
      activeOnly: list.filter((c) => c.status === "active").length,
      totals: { ...base, reach },
      prev,
      series: hasHist ? dailySeries(list) : [],
      metaSpend: rows.filter((x) => x.platform === "meta").reduce((a, x) => a + x.spend, 0),
      googleSpend: rows.filter((x) => x.platform === "google").reduce((a, x) => a + x.spend, 0),
      table: tbl.slice(0, lim),
      tableTotal: tbl.length,
      best,
      most,
      creatives: crRows(list).sort(byResult).slice(0, Math.max(0, Math.min(r.top ?? 4, 60))),
    };
  }

  if (r.view === "campaigns") {
    const t = norm((r.search ?? "").trim());
    const list = filterCampaigns(all, { ...f, range }).filter(
      (c) => !t || norm(c.name).includes(t) || c.id.includes(t) || (c.adsets ?? []).some((s) => norm(s.name).includes(t)) || c.creatives.some((cr) => norm(cr.name).includes(t)),
    );
    const rows = list.map(rowOf).sort(bySpend);
    return { count: rows.length, active: rows.filter((x) => x.status === "active").length, rows: rows.slice(0, lim) };
  }

  if (r.view === "creatives") {
    const t = norm((r.search ?? "").trim());
    const st = r.state ?? "all";
    const rows = crRows(filterCampaigns(all, { ...f, range }))
      .filter((c) => st === "all" || c.active === (st === "active"))
      .filter((c) => !t || norm(`${c.name} ${c.headline} ${c.campaign.name}`).includes(t))
      .sort(byResult);
    return { count: rows.length, rows: rows.slice(0, lim) };
  }

  if (r.view === "clients") {
    const stats: Record<string, ClientStats> = {};
    for (const c of filterCampaigns(all, { range })) {
      if (!c.clientId) continue;
      const s = (stats[c.clientId] ??= { spend: 0, conversions: 0, revenue: 0, running: 0, manual: 0, count: 0 });
      const t = sumOf([c]);
      s.spend += t.spend;
      s.conversions += t.conversions;
      s.revenue += t.revenue;
      s.count++;
      if (c.status === "active" || c.status === "learning") s.running++;
      if (c.source === "manual") s.manual++;
    }
    return { stats };
  }

  // detalhe de campanha (histórico inteiro carregado)
  const c = all.find((x) => x.id === r.id);
  if (!c) return null;
  return {
    campaign: { id: c.id, name: c.name, platform: c.platform, source: c.source, status: c.status, objective: c.objective, dailyBudget: c.dailyBudget, clientId: c.clientId || null, clientName: null },
    totals: { ...sumOf([c]), reach: c.reach },
    series: dailySeries([c]),
    creatives: crRows([c]).sort(byResult),
  };
}
