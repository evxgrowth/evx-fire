// Formato compacto dos dados das telas (vem pronto do banco pela função gestor_data).
// Viaja assim do banco ao servidor e do servidor ao navegador; só é "aberto" no fim,
// para as telas continuarem recebendo as mesmas listas de sempre (Campaign[], Client[]).

import type { Campaign, Client, Creative, DailyPoint } from "./types";

type Num = number | string;

export interface Packed {
  has_accounts: boolean;
  last_sync: string | null;
  /** primeiro dia do histórico (yyyy-mm-dd) */
  since: string | null;
  clients: { id: string; name: string; segment: string; active: boolean; notes: string | null; meta: string | null; google: string | null }[];
  /** [id, cliente, plataforma, origem, nome, objetivo, status, orçamento diário, alcance 30d] */
  campaigns: [string, string | null, Campaign["platform"], Campaign["source"] | null, string, string, Campaign["status"], Num, Num][];
  /** [id, campanha, nome, ativo] */
  adsets: [string, string, string, boolean][];
  creatives: {
    id: string;
    c: string;
    s?: string;
    n: string;
    f: Creative["format"];
    h?: string;
    b?: string;
    img?: string;
    vid?: string;
    cta?: string;
    m?: Creative["media"];
    a: boolean;
    i: Num;
    k: Num;
    sp: Num;
    cv: Num;
  }[];
  /** { campanha: [[dia desde `since`, gasto, impressões, cliques, conversões, receita], ...] } */
  daily: Record<string, [number, Num, Num, Num, Num, Num][]>;
}

export const HISTORY_DAYS = 90;

function hue(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return 10 + (h % 30);
}

function axis(since: string, n: number) {
  const start = Date.parse(since + "T12:00:00Z");
  return Array.from({ length: n }, (_, i) => new Date(start + i * 864e5).toISOString().slice(0, 10));
}

/** Abre o formato compacto nas listas que as telas usam. */
export function unpack(p: Packed): { campaigns: Campaign[]; clients: Client[]; lastSync: string | null; hasAccounts: boolean } {
  const clients: Client[] = p.clients.map((c) => ({
    id: c.id,
    name: c.name,
    segment: c.segment,
    active: c.active,
    notes: c.notes ?? undefined,
    metaAccountId: c.meta || undefined,
    googleCustomerId: c.google || undefined,
  }));

  const days = p.since ? axis(p.since, HISTORY_DAYS) : [];
  const setsBy = new Map<string, { id: string; name: string; active: boolean }[]>();
  for (const [id, campaign, name, active] of p.adsets) {
    if (!setsBy.has(campaign)) setsBy.set(campaign, []);
    setsBy.get(campaign)!.push({ id, name, active });
  }
  const crBy = new Map<string, Creative[]>();
  for (const c of p.creatives) {
    if (!crBy.has(c.c)) crBy.set(c.c, []);
    crBy.get(c.c)!.push({
      id: c.id,
      name: c.n,
      format: c.f,
      headline: c.h || c.n,
      body: c.b ?? "",
      hue: hue(c.id),
      imageUrl: c.img ?? c.m?.find((m) => m.type === "image")?.url ?? undefined,
      videoUrl: c.vid ?? c.m?.find((m) => m.type === "video")?.url ?? undefined,
      media: c.m ?? [],
      adSetId: c.s ?? undefined,
      cta: c.cta ?? undefined,
      impressions: Number(c.i),
      clicks: Number(c.k),
      spend: Number(c.sp),
      conversions: Number(c.cv),
      active: c.a,
    });
  }

  const campaigns: Campaign[] = p.campaigns.map(([id, clientId, platform, source, name, objective, status, budget, reach]) => {
    const rows = p.daily[id];
    // Campanha sem nenhum dado no período vai sem a lista de dias (deixa a tela bem mais leve)
    let daily: DailyPoint[] = [];
    if (rows) {
      const byDay = new Map(rows.map((r) => [r[0], r]));
      daily = days.map((date, i) => {
        const r = byDay.get(i);
        return {
          date,
          spend: Number(r?.[1] ?? 0),
          impressions: Number(r?.[2] ?? 0),
          clicks: Number(r?.[3] ?? 0),
          conversions: Number(r?.[4] ?? 0),
          revenue: Number(r?.[5] ?? 0),
        };
      });
    }
    return {
      id,
      clientId: clientId ?? "",
      platform,
      source: source ?? "api",
      name,
      objective,
      status,
      dailyBudget: Number(budget),
      reach: Number(reach),
      daily,
      creatives: crBy.get(id) ?? [],
      adsets: setsBy.get(id) ?? [],
    };
  });

  return { campaigns, clients, lastSync: p.last_sync, hasAccounts: p.has_accounts };
}
