import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampaignStatus, CreativeFormat } from "@/lib/types";
import { graphBatch, graphGet, graphList } from "./graph";
import { computeResult, metricsFromInsight, type Action } from "./results";

const DAYS = 30;

// Em ordem de prioridade: se houver compra, conta compra; senão, lead.
const PURCHASE = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase", "onsite_web_purchase"];
const LEAD = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "onsite_conversion.messaging_conversation_started_7d"];

function pick(list: Action[] | undefined, types: string[]) {
  if (!list) return 0;
  for (const t of types) {
    const hit = list.find((a) => a.action_type === t);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
}

function conversionsOf(actions?: Action[]) {
  const p = pick(actions, PURCHASE);
  return p > 0 ? p : pick(actions, LEAD);
}

const OBJECTIVES: Record<string, string> = {
  OUTCOME_SALES: "Vendas",
  OUTCOME_LEADS: "Leads",
  OUTCOME_TRAFFIC: "Tráfego",
  OUTCOME_ENGAGEMENT: "Engajamento",
  OUTCOME_AWARENESS: "Reconhecimento",
  OUTCOME_APP_PROMOTION: "App",
  CONVERSIONS: "Conversões",
  LEAD_GENERATION: "Leads",
  LINK_CLICKS: "Tráfego",
  MESSAGES: "Mensagens",
  REACH: "Alcance",
  BRAND_AWARENESS: "Reconhecimento",
  VIDEO_VIEWS: "Visualizações de vídeo",
  POST_ENGAGEMENT: "Engajamento",
  PRODUCT_CATALOG_SALES: "Vendas do catálogo",
};

function statusOf(effective: string, stopTime?: string): CampaignStatus {
  if (stopTime && new Date(stopTime) < new Date()) return "ended";
  if (effective === "ACTIVE") return "active";
  if (effective === "DELETED" || effective === "ARCHIVED") return "ended";
  if (effective.includes("PAUSED")) return "paused";
  return "learning"; // em análise / com problemas / pendente
}

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
function daysAgo(n: number) {
  const d = new Date(today() + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
const money = (v?: string) => Number(v ?? 0) / 100;

interface MetaCampaign {
  id: string;
  name: string;
  objective?: string;
  effective_status: string;
  daily_budget?: string;
  lifetime_budget?: string;
  bid_strategy?: string;
  start_time?: string;
  stop_time?: string;
}
interface MetaAdSet {
  id: string;
  name: string;
  campaign_id: string;
  effective_status: string;
  daily_budget?: string;
  lifetime_budget?: string;
  optimization_goal?: string;
  billing_event?: string;
  bid_strategy?: string;
  promoted_object?: Record<string, unknown>;
  targeting?: Record<string, unknown>;
  start_time?: string;
  end_time?: string;
}
interface Insight {
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  date_start: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  frequency?: string;
  actions?: Action[];
  action_values?: Action[];
}
interface MetaAd {
  id: string;
  name: string;
  effective_status: string;
  campaign_id: string;
  adset_id: string;
  preview_shareable_link?: string;
  creative?: {
    id: string;
    title?: string;
    body?: string;
    image_url?: string;
    thumbnail_url?: string;
    object_type?: string;
    video_id?: string;
    call_to_action_type?: string;
    effective_object_story_id?: string;
    instagram_permalink_url?: string;
    asset_feed_spec?: { titles?: { text: string }[]; bodies?: { text: string }[]; link_urls?: { website_url?: string }[]; videos?: { video_id?: string; thumbnail_url?: string }[]; images?: { hash?: string; url?: string }[] };
    object_story_spec?: {
      link_data?: { name?: string; message?: string; picture?: string; link?: string; call_to_action?: { type?: string }; child_attachments?: unknown[] };
      video_data?: { title?: string; message?: string; image_url?: string; image_hash?: string; video_id?: string; call_to_action?: { type?: string; value?: { link?: string } } };
    };
  };
}

const METRIC_FIELDS = "spend,impressions,reach,clicks,frequency,actions,action_values";

export interface SyncAccount {
  id: string;
  agency_id: string;
  external_id: string;
  last_full_sync_at?: string | null;
  last_daily_full_at?: string | null;
  history_backfilled_at?: string | null;
}

const hoursSince = (iso?: string | null) => (iso ? (Date.now() - Date.parse(iso)) / 3.6e6 : Infinity);
const badImage = (u?: string | null) => !u || u.includes("facebook.com/ads/image");

/** Link de imagem ainda bom por pelo menos 36h? (links da Meta trazem a validade no parâmetro "oe") */
function stillValid(u?: string | null) {
  if (badImage(u)) return false;
  if (!u!.includes("fbcdn.net")) return true; // ex.: Storage próprio (manuais)
  try {
    const oe = new URL(u!).searchParams.get("oe");
    return !!oe && parseInt(oe, 16) * 1000 > Date.now() + 36 * 3.6e6;
  } catch {
    return false;
  }
}

type Child = { picture?: string; image_hash?: string; video_id?: string; link?: string; name?: string };
type FeedSpec = NonNullable<NonNullable<MetaAd["creative"]>["asset_feed_spec"]>;

/**
 * Sincroniza UMA conta de anúncios da Meta, no modo mais econômico possível:
 * - conta sem campanha rodando: só confere status (a completa roda a cada 6h, ou assim que algo é ativado);
 * - métricas diárias: 3 dias nas rodadas normais, 90 dias uma vez por dia, 13 meses uma única vez;
 * - imagens: só busca de novo quando o link salvo está perto de expirar.
 */
export async function syncMetaAccount(db: SupabaseClient, account: SyncAccount, token: string, opts: { force?: boolean; allowBackfill?: boolean } = {}) {
  const act = account.external_id; // "act_123"
  const now = new Date().toISOString();
  const range = JSON.stringify({ since: daysAgo(DAYS - 1), until: today() });

  // 1) Sempre: status da conta e lista de campanhas (2 chamadas)
  const [info, camps] = await Promise.all([
    graphGet<{ account_status?: number }>(act, { access_token: token, fields: "account_status" }).catch(() => ({}) as { account_status?: number }),
    graphList<MetaCampaign>(`${act}/campaigns`, {
      access_token: token,
      fields: "id,name,objective,effective_status,daily_budget,lifetime_budget,bid_strategy,start_time,stop_time",
    }),
  ]);
  if (info.account_status != null) await db.from("ad_accounts").update({ account_status: info.account_status }).eq("id", account.id);

  const campBase = (c: MetaCampaign) => ({
    agency_id: account.agency_id,
    ad_account_id: account.id,
    platform: "meta",
    external_id: c.id,
    name: c.name,
    objective: OBJECTIVES[c.objective ?? ""] ?? c.objective ?? "",
    objective_raw: c.objective ?? "",
    status: statusOf(c.effective_status, c.stop_time),
    effective_status: c.effective_status,
    bid_strategy: c.bid_strategy ?? "",
    daily_budget: money(c.daily_budget),
    lifetime_budget: money(c.lifetime_budget),
    start_time: c.start_time ?? null,
    stop_time: c.stop_time ?? null,
    updated_at: now,
  });
  const visible = camps.filter((c) => c.effective_status !== "ARCHIVED" && c.effective_status !== "DELETED");
  const running = camps.some((c) => c.effective_status === "ACTIVE" && (!c.stop_time || Date.parse(c.stop_time) > Date.now()));

  // 2) Modo leve: nada rodando e a completa foi há menos de 6h → só status, nomes e orçamentos
  if (!opts.force && !running && hoursSince(account.last_full_sync_at) < 6) {
    for (let i = 0; i < visible.length; i += 300) {
      const { error } = await db.from("campaigns").upsert(visible.slice(i, i + 300).map(campBase), { onConflict: "ad_account_id,external_id" });
      if (error) throw new Error(error.message);
    }
    return { mode: "light" as const, campaigns: visible.length };
  }

  // 3) Completa
  const backfill = !account.history_backfilled_at && !!opts.allowBackfill;
  const dailyDays = backfill ? 395 : opts.force || hoursSince(account.last_daily_full_at) >= 20 ? 90 : 3;
  const rangeDaily = JSON.stringify({ since: daysAgo(dailyDays - 1), until: today() });

  const [daily, campTotals, adsets, adsetTotals, ads, adTotals] = await Promise.all([
    graphList<Insight>(`${act}/insights`, { access_token: token, level: "campaign", time_increment: "1", time_range: rangeDaily, fields: `campaign_id,${METRIC_FIELDS}` }),
    graphList<Insight>(`${act}/insights`, { access_token: token, level: "campaign", time_range: range, fields: `campaign_id,${METRIC_FIELDS}` }),
    graphList<MetaAdSet>(`${act}/adsets`, {
      access_token: token,
      fields: "id,name,campaign_id,effective_status,daily_budget,lifetime_budget,optimization_goal,billing_event,bid_strategy,promoted_object,targeting,start_time,end_time",
      effective_status: JSON.stringify(["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "IN_PROCESS", "WITH_ISSUES"]),
    }),
    graphList<Insight>(`${act}/insights`, { access_token: token, level: "adset", time_range: range, fields: `adset_id,${METRIC_FIELDS}` }),
    graphList<MetaAd>(`${act}/ads`, {
      access_token: token,
      fields:
        "id,name,effective_status,campaign_id,adset_id,preview_shareable_link,creative{id,title,body,image_url,image_hash,thumbnail_url,object_type,video_id,call_to_action_type,effective_object_story_id,instagram_permalink_url,asset_feed_spec,object_story_spec}",
      effective_status: JSON.stringify(["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "IN_PROCESS", "WITH_ISSUES"]),
    }),
    graphList<Insight>(`${act}/insights`, { access_token: token, level: "ad", time_range: range, fields: `ad_id,${METRIC_FIELDS}` }),
  ]);

  const campTot = new Map(campTotals.map((r) => [r.campaign_id!, metricsFromInsight(r as unknown as Record<string, unknown>)]));
  const setTot = new Map(adsetTotals.map((r) => [r.adset_id!, metricsFromInsight(r as unknown as Record<string, unknown>)]));
  const adTot = new Map(adTotals.map((r) => [r.ad_id!, metricsFromInsight(r as unknown as Record<string, unknown>)]));

  // ---------- Campanhas ----------
  const withData = new Set(daily.map((d) => d.campaign_id));
  const relevant = camps.filter((c) => withData.has(c.id) || (c.effective_status !== "ARCHIVED" && c.effective_status !== "DELETED"));
  const campId = new Map<string, string>();
  for (let i = 0; i < relevant.length; i += 300) {
    const { data, error } = await db
      .from("campaigns")
      .upsert(
        relevant.slice(i, i + 300).map((c) => ({ ...campBase(c), reach_30d: campTot.get(c.id)?.reach ?? 0, metrics_30d: campTot.get(c.id) ?? {} })),
        { onConflict: "ad_account_id,external_id" },
      )
      .select("id, external_id");
    if (error) throw new Error(error.message);
    for (const r of data ?? []) campId.set(r.external_id as string, r.id as string);
  }

  const dailyRows = daily
    .filter((d) => campId.has(d.campaign_id!))
    .map((d) => ({
      campaign_id: campId.get(d.campaign_id!)!,
      agency_id: account.agency_id,
      date: d.date_start,
      spend: Number(d.spend) || 0,
      impressions: Number(d.impressions) || 0,
      reach: Number(d.reach) || 0,
      clicks: Number(d.clicks) || 0,
      conversions: conversionsOf(d.actions),
      revenue: pick(d.action_values, PURCHASE),
    }));
  for (let i = 0; i < dailyRows.length; i += 500) {
    const { error: e } = await db.from("campaign_daily").upsert(dailyRows.slice(i, i + 500), { onConflict: "campaign_id,date" });
    if (e) throw new Error(e.message);
  }

  // ---------- Conjuntos de anúncios ----------
  const setRows = adsets
    .filter((s) => campId.has(s.campaign_id))
    .map((s) => ({
      agency_id: account.agency_id,
      campaign_id: campId.get(s.campaign_id)!,
      external_id: s.id,
      name: s.name,
      status: statusOf(s.effective_status, s.end_time),
      effective_status: s.effective_status,
      daily_budget: money(s.daily_budget),
      lifetime_budget: money(s.lifetime_budget),
      optimization_goal: s.optimization_goal ?? "",
      billing_event: s.billing_event ?? "",
      bid_strategy: s.bid_strategy ?? "",
      promoted_object: s.promoted_object ?? null,
      targeting: s.targeting ?? null,
      start_time: s.start_time ?? null,
      end_time: s.end_time ?? null,
      metrics_30d: setTot.get(s.id) ?? {},
      updated_at: now,
    }));
  const setId = new Map<string, string>();
  for (let i = 0; i < setRows.length; i += 300) {
    const { data, error: e } = await db.from("ad_sets").upsert(setRows.slice(i, i + 300), { onConflict: "campaign_id,external_id" }).select("id, external_id");
    if (e) throw new Error(e.message);
    for (const r of data ?? []) setId.set(r.external_id, r.id);
  }
  const setGoal = new Map(adsets.map((s) => [s.id, { goal: s.optimization_goal ?? "", promoted: s.promoted_object ?? null }]));

  // ---------- Imagens: reaproveita as que ainda valem ----------
  const campIds = [...campId.values()];
  const existing = new Map<string, { image_url: string | null; thumbnail_url: string | null; media: { type: string; url: string }[] | null }>();
  for (let i = 0; i < campIds.length; i += 150) {
    const { data } = await db.from("creatives").select("external_id, image_url, thumbnail_url, media").in("campaign_id", campIds.slice(i, i + 150));
    for (const r of data ?? []) existing.set(r.external_id, r);
  }
  const childrenOf = (a: MetaAd) => (a.creative?.object_story_spec?.link_data?.child_attachments ?? []) as Child[];
  const needsImages = (a: MetaAd) => {
    const old = existing.get(a.id);
    if (!old || !stillValid(old.image_url)) return true;
    if (childrenOf(a).length > 1 && (!(old.media ?? []).length || !(old.media ?? []).every((m) => stillValid(m.url)))) return true;
    return false;
  };
  const refresh = ads.filter((a) => campId.has(a.campaign_id) && needsImages(a));
  const refreshIds = new Set(refresh.map((a) => a.id));

  // Capas e imagens enviadas (image_hash) → endereço real, numa chamada a cada 50 imagens
  const hashes = new Set<string>();
  for (const a of refresh) {
    const cr = a.creative;
    const h = cr?.object_story_spec?.video_data?.image_hash;
    if (h) hashes.add(h);
    for (const ch of childrenOf(a)) if (ch.image_hash) hashes.add(ch.image_hash);
    for (const im of (cr?.asset_feed_spec as FeedSpec | undefined)?.images ?? []) if (im.hash) hashes.add(im.hash);
  }
  const byHash = new Map<string, string>();
  const hashList = [...hashes];
  for (let i = 0; i < hashList.length; i += 50) {
    try {
      const imgs = await graphList<{ hash: string; url?: string }>(`${act}/adimages`, { access_token: token, hashes: JSON.stringify(hashList.slice(i, i + 50)), fields: "hash,url" });
      for (const im of imgs) if (im.url) byHash.set(im.hash, im.url);
    } catch {
      // sem a imagem enviada: fica a miniatura
    }
  }
  // Miniatura grande só para quem não tem imagem própria
  const thumbPath = (id: string) => `${id}?fields=thumbnail_url&thumbnail_width=640&thumbnail_height=640`;
  const needThumb = [
    ...new Set(
      refresh
        .filter((a) => a.creative?.id && !a.creative.object_story_spec?.video_data?.image_hash)
        .filter((a) => a.creative!.video_id || a.creative!.object_story_spec?.video_data || badImage(a.creative!.image_url ?? a.creative!.object_story_spec?.link_data?.picture))
        .map((a) => a.creative!.id),
    ),
  ];
  const thumbs = await graphBatch<{ thumbnail_url?: string }>(token, needThumb.map(thumbPath));

  // ---------- Anúncios / criativos ----------
  const creatives = ads
    .filter((a) => campId.has(a.campaign_id))
    .map((a) => {
      const cr = a.creative ?? ({} as NonNullable<MetaAd["creative"]>);
      const story = cr.object_story_spec;
      const feed = cr.asset_feed_spec as FeedSpec | undefined;
      const children = childrenOf(a);
      const videoId = cr.video_id ?? story?.video_data?.video_id ?? feed?.videos?.[0]?.video_id;
      const isVideo = !!videoId || cr.object_type === "VIDEO";
      const isCarousel = children.length > 1;
      const format: CreativeFormat = isCarousel ? "carousel" : isVideo ? "video" : "image";
      const m = adTot.get(a.id);
      const g = setGoal.get(a.adset_id);
      const result = computeResult(m, g?.goal, g?.promoted as { custom_event_type?: string } | null);

      let image_url: string | null;
      let thumbnail_url: string | null;
      let media: { type: "image" | "video"; url: string }[];
      const old = existing.get(a.id);
      if (old && !refreshIds.has(a.id)) {
        image_url = old.image_url;
        thumbnail_url = old.thumbnail_url;
        media = (old.media ?? []) as typeof media;
      } else {
        const cover = story?.video_data?.image_hash ? byHash.get(story.video_data.image_hash) : undefined;
        const big = cover ?? (cr.id ? thumbs.get(thumbPath(cr.id))?.thumbnail_url : undefined);
        const firstImage = [cr.image_url, story?.link_data?.picture, feed?.images?.[0]?.url].find((u) => !badImage(u));
        // Carrossel (ou criativo dinâmico com várias imagens): todas as imagens em media[]
        const childImgs = children.map((ch) => (ch.image_hash ? byHash.get(ch.image_hash) : undefined) ?? (badImage(ch.picture) ? undefined : ch.picture)).filter(Boolean) as string[];
        const feedImgs = (feed?.images ?? []).map((im) => (im.hash ? byHash.get(im.hash) : undefined) ?? im.url).filter((u) => !badImage(u)) as string[];
        const all = childImgs.length ? childImgs : feedImgs.length > 1 ? feedImgs : [];
        media = all.map((url) => ({ type: "image" as const, url }));
        image_url = (isVideo ? big : (all[0] ?? firstImage)) ?? firstImage ?? big ?? cr.thumbnail_url ?? null;
        thumbnail_url = big ?? all[0] ?? cr.thumbnail_url ?? null;
      }

      return {
        agency_id: account.agency_id,
        campaign_id: campId.get(a.campaign_id)!,
        ad_set_id: setId.get(a.adset_id) ?? null,
        external_id: a.id,
        creative_id: cr.id ?? null,
        name: a.name,
        format,
        headline: cr.title ?? story?.link_data?.name ?? story?.video_data?.title ?? feed?.titles?.[0]?.text ?? children[0]?.name ?? "",
        body: cr.body ?? story?.link_data?.message ?? story?.video_data?.message ?? feed?.bodies?.[0]?.text ?? "",
        image_url,
        thumbnail_url,
        media,
        video_id: videoId ?? null,
        // O arquivo do vídeo exige permissões de Página que o app não tem: vai a capa + link de prévia
        video_url: null,
        cta: cr.call_to_action_type ?? story?.link_data?.call_to_action?.type ?? story?.video_data?.call_to_action?.type ?? null,
        link_url: story?.link_data?.link ?? story?.video_data?.call_to_action?.value?.link ?? feed?.link_urls?.[0]?.website_url ?? children[0]?.link ?? null,
        preview_url: a.preview_shareable_link ?? null,
        permalink_url: cr.instagram_permalink_url ?? (cr.effective_object_story_id ? `https://www.facebook.com/${cr.effective_object_story_id}` : null),
        active: a.effective_status === "ACTIVE",
        effective_status: a.effective_status,
        impressions: m?.impressions ?? 0,
        reach: m?.reach ?? 0,
        clicks: m?.clicks ?? 0,
        spend: m?.spend ?? 0,
        conversions: result && result.type !== "reach" && result.type !== "impressions" ? result.value : conversionsOf(m?.actions),
        metrics_30d: m ?? {},
        updated_at: now,
      };
    });
  for (let i = 0; i < creatives.length; i += 300) {
    const { error: e } = await db.from("creatives").upsert(creatives.slice(i, i + 300), { onConflict: "campaign_id,external_id" });
    if (e) throw new Error(e.message);
  }

  await db
    .from("ad_accounts")
    .update({
      last_full_sync_at: now,
      ...(dailyDays >= 90 ? { last_daily_full_at: now } : {}),
      ...(backfill ? { history_backfilled_at: now } : {}),
    })
    .eq("id", account.id);
  return { mode: "full" as const, campaigns: relevant.length, adsets: setRows.length, ads: creatives.length, days: dailyDays, imagesFetched: refresh.length };
}

/**
 * Sincroniza as contas Meta ativas de uma agência (ou de todas).
 * `force`: botão "Sincronizar agora" — faz a completa mesmo sem campanha rodando.
 * O histórico de 13 meses é baixado para no máximo UMA conta por rodada, para não pesar.
 */
export async function syncMeta(db: SupabaseClient, agencyId?: string, opts: { force?: boolean } = {}) {
  let q = db
    .from("ad_accounts")
    .select("id, agency_id, external_id, last_full_sync_at, last_daily_full_at, history_backfilled_at, platform_connections(access_token)")
    .eq("platform", "meta")
    .eq("sync_enabled", true);
  if (agencyId) q = q.eq("agency_id", agencyId);
  const { data: accounts, error } = await q;
  if (error) throw new Error(error.message);

  const results: { account: string; agency: string; ok: boolean; mode?: string; error?: string }[] = [];
  const queue = [...(accounts ?? [])];
  let backfillSlot = true;
  // 4 contas em paralelo para caber no tempo máximo do servidor
  const worker = async () => {
    for (let a = queue.shift(); a; a = queue.shift()) await syncOne(a);
  };
  const syncOne = async (a: NonNullable<typeof accounts>[number]) => {
    const conn = (Array.isArray(a.platform_connections) ? a.platform_connections[0] : a.platform_connections) as { access_token: string } | null;
    if (!conn) return;
    const allowBackfill = backfillSlot && !a.history_backfilled_at;
    if (allowBackfill) backfillSlot = false;
    try {
      const r = await syncMetaAccount(db, a, conn.access_token, { force: opts.force, allowBackfill });
      await db.from("ad_accounts").update({ last_synced_at: new Date().toISOString(), last_error: null }).eq("id", a.id);
      results.push({ account: a.external_id, agency: a.agency_id, ok: true, mode: r.mode });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.from("ad_accounts").update({ last_error: msg.slice(0, 500) }).eq("id", a.id);
      results.push({ account: a.external_id, agency: a.agency_id, ok: false, error: msg });
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return results;
}
