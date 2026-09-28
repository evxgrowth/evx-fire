import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Campaign, Client, Creative, DailyPoint } from "./types";

const DAYS = 30;

function spToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
export function lastDays(n = DAYS) {
  const end = new Date(spToday() + "T12:00:00Z");
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - (n - 1 - i));
    return d.toISOString().slice(0, 10);
  });
}

/** Busca todas as linhas, contornando o limite de 1000 por consulta. */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

function hue(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return 10 + (h % 30);
}

/** Busca por lotes de campanhas (só as das contas ativas), em paralelo. */
async function byChunks<T>(ids: string[], run: (chunk: string[]) => Promise<T[]>) {
  const parts: string[][] = [];
  for (let i = 0; i < ids.length; i += 150) parts.push(ids.slice(i, i + 150));
  return (await Promise.all(parts.map(run))).flat();
}

export interface AgencyData {
  campaigns: Campaign[];
  clients: Client[];
  lastSync: string | null;
}

/**
 * Carrega os dados do painel de uma agência (ou só de um cliente, no link compartilhado).
 * `db` pode ser o cliente do usuário (segurança do banco aplicada) ou o administrativo.
 */
export async function loadAgencyData(db: SupabaseClient, agencyId: string, onlyClientId?: string): Promise<AgencyData> {
  const days = lastDays(90);
  const since = days[0];

  let accQ = db.from("ad_accounts").select("id, client_id, platform, external_id, name, last_synced_at, sync_enabled").eq("agency_id", agencyId);
  if (onlyClientId) accQ = accQ.eq("client_id", onlyClientId);
  const { data: accounts } = await accQ;
  const accById = new Map((accounts ?? []).map((a) => [a.id as string, a]));

  let cliQ = db.from("clients").select("id, name, segment, active, notes").eq("agency_id", agencyId).order("name");
  if (onlyClientId) cliQ = cliQ.eq("id", onlyClientId);
  const { data: clientRows } = await cliQ;

  const clients: Client[] = (clientRows ?? []).map((c) => {
    const accs = (accounts ?? []).filter((a) => a.client_id === c.id);
    return {
      id: c.id,
      name: c.name,
      segment: c.segment,
      active: c.active,
      notes: c.notes,
      metaAccountId: accs.filter((a) => a.platform === "meta").map((a) => a.external_id).join(", ") || undefined,
      googleCustomerId: accs.filter((a) => a.platform === "google").map((a) => a.external_id).join(", ") || undefined,
    };
  });

  // Contas de clientes desativados não aparecem em nenhuma tela
  const inactive = new Set((clientRows ?? []).filter((c) => !c.active).map((c) => c.id));
  // Contas desativadas (Integrações) e de clientes inativos não aparecem
  const accountIds = [...accById.values()]
    .filter((a) => (a.platform === "manual" || a.sync_enabled) && (!a.client_id || !inactive.has(a.client_id)))
    .map((a) => a.id as string);
  if (!accountIds.length) return { campaigns: [], clients, lastSync: null };

  const camps = await fetchAll<{ id: string; ad_account_id: string; platform: "meta" | "google"; source: Campaign["source"]; name: string; objective: string; status: Campaign["status"]; daily_budget: number; reach_30d: number }>((a, b) =>
    db.from("campaigns").select("id, ad_account_id, platform, source, name, objective, status, daily_budget, reach_30d").in("ad_account_id", accountIds).range(a, b),
  );
  const campIds = camps.map((c) => c.id);

  const dailyRows = campIds.length
    ? await byChunks(campIds, (ids) => fetchAll<{ campaign_id: string; date: string; spend: number; impressions: number; clicks: number; conversions: number; revenue: number }>((a, b) =>
        db.from("campaign_daily").select("campaign_id, date, spend, impressions, clicks, conversions, revenue").in("campaign_id", ids).gte("date", since).range(a, b),
      ))
    : [];
  const setRows = campIds.length
    ? await byChunks(campIds, (ids) => fetchAll<{ id: string; campaign_id: string; name: string; effective_status: string }>((a, b) =>
        db.from("ad_sets").select("id, campaign_id, name, effective_status").in("campaign_id", ids).range(a, b),
      ))
    : [];
  const setsBy = new Map<string, { id: string; name: string; active: boolean }[]>();
  for (const s of setRows) (setsBy.get(s.campaign_id) ?? setsBy.set(s.campaign_id, []).get(s.campaign_id)!).push({ id: s.id, name: s.name, active: s.effective_status === "ACTIVE" });

  const creativeRows = campIds.length
    ? await byChunks(campIds, (ids) => fetchAll<{ id: string; ad_set_id: string | null; campaign_id: string; name: string; format: Creative["format"]; headline: string; body: string; image_url: string | null; video_url: string | null; cta: string | null; media: Creative["media"]; active: boolean; impressions: number; clicks: number; spend: number; conversions: number }>((a, b) =>
        db.from("creatives").select("id, ad_set_id, campaign_id, name, format, headline, body, image_url, video_url, cta, media, active, impressions, clicks, spend, conversions").in("campaign_id", ids).range(a, b),
      ))
    : [];

  const dailyBy = new Map<string, Map<string, (typeof dailyRows)[number]>>();
  for (const d of dailyRows) {
    if (!dailyBy.has(d.campaign_id)) dailyBy.set(d.campaign_id, new Map());
    dailyBy.get(d.campaign_id)!.set(d.date, d);
  }
  const crBy = new Map<string, Creative[]>();
  for (const c of creativeRows) {
    const list = crBy.get(c.campaign_id) ?? [];
    list.push({
      id: c.id,
      name: c.name,
      format: c.format,
      headline: c.headline || c.name,
      body: c.body,
      hue: hue(c.id),
      imageUrl: c.image_url ?? c.media?.find((m) => m.type === "image")?.url ?? undefined,
      videoUrl: c.video_url ?? c.media?.find((m) => m.type === "video")?.url ?? undefined,
      media: c.media ?? [],
      adSetId: c.ad_set_id ?? undefined,
      cta: c.cta ?? undefined,
      impressions: Number(c.impressions),
      clicks: Number(c.clicks),
      spend: Number(c.spend),
      conversions: Number(c.conversions),
      active: c.active,
    });
    crBy.set(c.campaign_id, list);
  }

  const campaigns: Campaign[] = camps
    .map((c) => {
      const byDate = dailyBy.get(c.id);
      // Campanha sem nenhum dado em 90 dias vai sem a lista de dias (deixa a página bem mais leve)
      const daily: DailyPoint[] = (byDate ? days : []).map((date) => {
        const r = byDate?.get(date);
        return {
          date,
          spend: Number(r?.spend ?? 0),
          impressions: Number(r?.impressions ?? 0),
          clicks: Number(r?.clicks ?? 0),
          conversions: Number(r?.conversions ?? 0),
          revenue: Number(r?.revenue ?? 0),
        };
      });
      return {
        id: c.id,
        clientId: (accById.get(c.ad_account_id)?.client_id as string) ?? "",
        platform: c.platform,
        source: c.source ?? "api",
        name: c.name,
        objective: c.objective,
        status: c.status,
        dailyBudget: Number(c.daily_budget),
        reach: Number(c.reach_30d),
        daily,
        creatives: crBy.get(c.id) ?? [],
        adsets: setsBy.get(c.id) ?? [],
      };
    });

  const syncs = (accounts ?? []).map((a) => a.last_synced_at as string | null).filter(Boolean) as string[];
  return { campaigns, clients, lastSync: syncs.sort().at(-1) ?? null };
}
