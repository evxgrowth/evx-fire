import "server-only";
import { createHash } from "crypto";
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
  last_structure_sync_at?: string | null;
  structure_sig?: string | null;
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

/**
 * Impressão digital de uma linha: igual = o banco não regrava.
 * Fica de fora o link de prévia (a Meta gera um novo a cada consulta).
 */
const rowHash = (row: Record<string, unknown>) => {
  const { preview_url: _p, ...rest } = row; // eslint-disable-line @typescript-eslint/no-unused-vars
  return createHash("sha1").update(JSON.stringify(rest)).digest("base64");
};

export interface SyncOutcome {
  mode: "light" | "metrics" | "full";
  /** algo mudou no banco? (é o "evento" que dispara o envio ao CRM) */
  changed: boolean;
  written: number;
}

type Child = { picture?: string; image_hash?: string; video_id?: string; link?: string; name?: string };
type FeedSpec = NonNullable<NonNullable<MetaAd["creative"]>["asset_feed_spec"]>;
type Row = Record<string, unknown>;
interface Applied {
  campaigns: number;
  adsets: number;
  ads: number;
  daily: number;
}

/**
 * Grava no banco numa única chamada por lote (função sync_apply_account, que só grava o que mudou).
 * Contas muito grandes são divididas em lotes de ~250 campanhas, sempre com conjuntos, anúncios
 * e diário da mesma campanha no mesmo lote. O status da conta vai no último lote.
 */
async function apply(
  db: SupabaseClient,
  accountId: string,
  mode: SyncOutcome["mode"],
  data: { campaigns: Row[]; adsets?: Row[]; ads?: Row[]; daily?: Row[]; adset_metrics?: Row[]; ad_metrics?: Row[] },
  account: Row,
): Promise<number> {
  const exts = data.campaigns.map((c) => c.external_id as string);
  const chunks: string[][] = [];
  for (let i = 0; i < Math.max(exts.length, 1); i += 250) chunks.push(exts.slice(i, i + 250));
  const by = (rows: Row[] | undefined, key: string, set: Set<string>) => (rows ?? []).filter((r) => set.has(r[key] as string));
  let total = 0;
  for (let i = 0; i < chunks.length; i++) {
    const set = new Set(chunks[i]);
    const last = i === chunks.length - 1;
    const payload = {
      mode,
      campaigns: by(data.campaigns, "external_id", set),
      adsets: by(data.adsets, "campaign_ext", set),
      ads: by(data.ads, "campaign_ext", set),
      daily: by(data.daily, "campaign_ext", set),
      // métricas soltas (modo métricas) não dependem do lote: vão no último
      adset_metrics: last ? (data.adset_metrics ?? []) : [],
      ad_metrics: last ? (data.ad_metrics ?? []) : [],
      account: last ? account : {},
    };
    const { data: r, error } = await db.rpc("sync_apply_account", { p_account: accountId, p: payload });
    if (error) throw new Error(error.message);
    const a = r as Applied;
    total += a.campaigns + a.adsets + a.ads + a.daily;
  }
  return total;
}

/**
 * Sincroniza UMA conta de anúncios da Meta, no modo mais econômico possível:
 * - LEVE: nada rodando e a coleta completa foi há < 6h → só status, nomes e orçamentos;
 * - SÓ MÉTRICAS: campanhas rodando, mas a estrutura (campanhas, conjuntos, anúncios) não mudou → só os números;
 * - COMPLETA: estrutura mudou, apareceu anúncio novo, passou 6h, ou botão "Sincronizar agora".
 * Métricas diárias: 3 dias nas rodadas normais, 90 dias 1x por dia, 13 meses uma única vez.
 * Imagens: só busca de novo quando o link salvo está perto de expirar.
 */
export async function syncMetaAccount(db: SupabaseClient, account: SyncAccount, token: string, opts: { force?: boolean; allowBackfill?: boolean } = {}): Promise<SyncOutcome> {
  const act = account.external_id; // "act_123"
  const now = new Date().toISOString();
  const range = JSON.stringify({ since: daysAgo(DAYS - 1), until: today() });

  // 1) Sempre: status da conta e lista de campanhas (2 chamadas à Meta)
  const [info, camps] = await Promise.all([
    graphGet<{ account_status?: number }>(act, { access_token: token, fields: "account_status" }).catch(() => ({}) as { account_status?: number }),
    graphList<MetaCampaign>(`${act}/campaigns`, {
      access_token: token,
      fields: "id,name,objective,effective_status,daily_budget,lifetime_budget,bid_strategy,start_time,stop_time",
    }),
  ]);
  const accountPatch: Row = info.account_status != null ? { account_status: info.account_status } : {};

  const campBase = (c: MetaCampaign) => ({
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
  });
  const visible = camps.filter((c) => c.effective_status !== "ARCHIVED" && c.effective_status !== "DELETED");
  const running = camps.some((c) => c.effective_status === "ACTIVE" && (!c.stop_time || Date.parse(c.stop_time) > Date.now()));
  // Assinatura da estrutura: se nenhuma campanha foi criada, removida ou alterada, ela não muda
  const structureSig = createHash("sha1")
    .update(JSON.stringify([...camps].sort((a, b) => a.id.localeCompare(b.id)).map((c) => [c.id, c.effective_status, c.name, c.daily_budget, c.lifetime_budget, c.stop_time, c.objective])))
    .digest("base64");

  // 2) LEVE: nada rodando e a completa foi há menos de 6h
  if (!opts.force && !running && hoursSince(account.last_full_sync_at) < 6) {
    const written = await apply(db, account.id, "light", { campaigns: visible.map(campBase) }, accountPatch);
    return { mode: "light", changed: written > 0, written };
  }

  const backfill = !account.history_backfilled_at && !!opts.allowBackfill;
  const dailyDays = backfill ? 395 : opts.force || hoursSince(account.last_daily_full_at) >= 20 ? 90 : 3;
  const rangeDaily = JSON.stringify({ since: daysAgo(dailyDays - 1), until: today() });
  const structureFresh = !opts.force && hoursSince(account.last_structure_sync_at) < 6 && account.structure_sig === structureSig;

  // Números (as mesmas 4 consultas nos modos "só métricas" e "completo")
  const [daily, campTotals, adsetTotals, adTotals] = await Promise.all([
    graphList<Insight>(`${act}/insights`, { access_token: token, level: "campaign", time_increment: "1", time_range: rangeDaily, fields: `campaign_id,${METRIC_FIELDS}` }),
    graphList<Insight>(`${act}/insights`, { access_token: token, level: "campaign", time_range: range, fields: `campaign_id,${METRIC_FIELDS}` }),
    graphList<Insight>(`${act}/insights`, { access_token: token, level: "adset", time_range: range, fields: `adset_id,${METRIC_FIELDS}` }),
    graphList<Insight>(`${act}/insights`, { access_token: token, level: "ad", time_range: range, fields: `ad_id,adset_id,${METRIC_FIELDS}` }),
  ]);
  const campTot = new Map(campTotals.map((r) => [r.campaign_id!, metricsFromInsight(r as unknown as Row)]));
  const setTot = new Map(adsetTotals.map((r) => [r.adset_id!, metricsFromInsight(r as unknown as Row)]));
  const adTot = new Map(adTotals.map((r) => [r.ad_id!, metricsFromInsight(r as unknown as Row)]));

  const withData = new Set(daily.map((d) => d.campaign_id));
  const relevant = camps.filter((c) => withData.has(c.id) || (c.effective_status !== "ARCHIVED" && c.effective_status !== "DELETED"));
  const campRows = relevant.map((c) => {
    const row = { ...campBase(c), reach_30d: campTot.get(c.id)?.reach ?? 0, metrics_30d: campTot.get(c.id) ?? {} };
    return { ...row, row_hash: rowHash(row) };
  });
  const dailyRows = daily.map((d) => ({
    campaign_ext: d.campaign_id,
    date: d.date_start,
    spend: Number(d.spend) || 0,
    impressions: Number(d.impressions) || 0,
    reach: Number(d.reach) || 0,
    clicks: Number(d.clicks) || 0,
    conversions: conversionsOf(d.actions),
    revenue: pick(d.action_values, PURCHASE),
  }));
  const datesPatch = {
    ...accountPatch,
    last_full_sync_at: now,
    ...(dailyDays >= 90 ? { last_daily_full_at: now } : {}),
    ...(backfill ? { history_backfilled_at: now } : {}),
  };

  // 3) SÓ MÉTRICAS: estrutura igual à da última coleta completa (há < 6h)
  if (structureFresh) {
    const { data: st, error } = await db.rpc("sync_account_state", { p_account: account.id, p_mode: "metrics" });
    if (error) throw new Error(error.message);
    const state = st as { ad_ids: string[]; adsets: { external_id: string; optimization_goal: string; promoted_object: Record<string, unknown> | null }[] };
    const known = new Set(state.ad_ids);
    // Apareceu anúncio novo com entrega? Então a estrutura mudou de verdade → coleta completa
    const newAd = adTotals.some((r) => r.ad_id && !known.has(r.ad_id));
    if (!newAd) {
      const goals = new Map(state.adsets.map((s) => [s.external_id, s]));
      const written = await apply(
        db,
        account.id,
        "metrics",
        {
          campaigns: campRows,
          daily: dailyRows,
          adset_metrics: [...setTot].map(([external_id, m]) => ({ external_id, metrics_30d: m })),
          ad_metrics: adTotals.map((r) => {
            const m = adTot.get(r.ad_id!)!;
            const g = goals.get(r.adset_id ?? "");
            const result = computeResult(m, g?.optimization_goal, g?.promoted_object as { custom_event_type?: string } | null);
            return {
              external_id: r.ad_id,
              impressions: m.impressions,
              reach: m.reach,
              clicks: m.clicks,
              spend: m.spend,
              conversions: result && result.type !== "reach" && result.type !== "impressions" ? result.value : conversionsOf(m.actions),
              metrics_30d: m,
            };
          }),
        },
        datesPatch,
      );
      return { mode: "metrics", changed: written > 0, written };
    }
  }

  // 4) COMPLETA: conjuntos, anúncios e criativos
  const [adsets, ads] = await Promise.all([
    graphList<MetaAdSet>(`${act}/adsets`, {
      access_token: token,
      fields: "id,name,campaign_id,effective_status,daily_budget,lifetime_budget,optimization_goal,billing_event,bid_strategy,promoted_object,targeting,start_time,end_time",
      effective_status: JSON.stringify(["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "IN_PROCESS", "WITH_ISSUES"]),
    }),
    graphList<MetaAd>(`${act}/ads`, {
      access_token: token,
      fields:
        "id,name,effective_status,campaign_id,adset_id,preview_shareable_link,creative{id,title,body,image_url,image_hash,thumbnail_url,object_type,video_id,call_to_action_type,effective_object_story_id,instagram_permalink_url,asset_feed_spec,object_story_spec}",
      effective_status: JSON.stringify(["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "IN_PROCESS", "WITH_ISSUES"]),
    }),
  ]);
  const relevantIds = new Set(relevant.map((c) => c.id));

  const setRows = adsets
    .filter((s) => relevantIds.has(s.campaign_id))
    .map((s) => {
      const row = {
        external_id: s.id,
        campaign_ext: s.campaign_id,
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
      };
      return { ...row, row_hash: rowHash(row) };
    });
  const setGoal = new Map(adsets.map((s) => [s.id, { goal: s.optimization_goal ?? "", promoted: s.promoted_object ?? null }]));

  // ---------- Imagens: reaproveita as que ainda valem (1 leitura no banco) ----------
  const { data: st, error: stErr } = await db.rpc("sync_account_state", { p_account: account.id, p_mode: "full" });
  if (stErr) throw new Error(stErr.message);
  const existing = new Map(((st as { ads: { external_id: string; image_url: string | null; thumbnail_url: string | null; media: { type: string; url: string }[] | null }[] }).ads ?? []).map((r) => [r.external_id, r]));
  const childrenOf = (a: MetaAd) => (a.creative?.object_story_spec?.link_data?.child_attachments ?? []) as Child[];
  const needsImages = (a: MetaAd) => {
    const old = existing.get(a.id);
    if (!old || !stillValid(old.image_url)) return true;
    if (childrenOf(a).length > 1 && (!(old.media ?? []).length || !(old.media ?? []).every((m) => stillValid(m.url)))) return true;
    return false;
  };
  const adsIn = ads.filter((a) => relevantIds.has(a.campaign_id));
  const refresh = adsIn.filter(needsImages);
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
  const adRows = adsIn.map((a) => {
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

    const row = {
      external_id: a.id,
      campaign_ext: a.campaign_id,
      adset_ext: a.adset_id,
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
    };
    return { ...row, row_hash: rowHash(row) };
  });

  const written = await apply(
    db,
    account.id,
    "full",
    { campaigns: campRows, adsets: setRows, ads: adRows, daily: dailyRows },
    { ...datesPatch, last_structure_sync_at: now, structure_sig: structureSig },
  );
  // Mudou se algo foi gravado, ou se o histórico diário foi recarregado
  return { mode: "full", changed: written > 0 || dailyDays >= 90, written };
}

export interface SyncResult {
  account: string;
  accountId: string;
  agency: string;
  ok: boolean;
  mode?: string;
  changed?: boolean;
  error?: string;
}

/**
 * Sincroniza as contas Meta ativas de uma agência (ou de todas).
 * - `manual` (botão "Sincronizar agora"): faz a completa e respeita a espera de 5 min.
 * - Trava por agência (uma chamada para todas): nunca roda duas sincronizações da mesma agência.
 * - O histórico de 13 meses é baixado para no máximo UMA conta por rodada, para não pesar.
 */
export async function syncMeta(db: SupabaseClient, agencyId?: string, opts: { manual?: boolean; force?: boolean } = {}) {
  let q = db
    .from("ad_accounts")
    .select("id, agency_id, external_id, last_full_sync_at, last_daily_full_at, history_backfilled_at, last_structure_sync_at, structure_sig, last_error, platform_connections(access_token)")
    .eq("platform", "meta")
    .eq("sync_enabled", true);
  if (agencyId) q = q.eq("agency_id", agencyId);
  const { data: accounts, error } = await q;
  if (error) throw new Error(error.message);

  const results: SyncResult[] = [];
  const agencies = [...new Set((accounts ?? []).map((a) => a.agency_id as string))];
  if (!agencies.length) return { results, blocked: [] as { agency: string; reason: string }[] };
  const { data: lockRes, error: lockErr } = await db.rpc("try_sync_locks", { p_agencies: agencies, p_seconds: 280, p_manual: !!opts.manual });
  if (lockErr) throw new Error(lockErr.message);
  const { ok: locked, blocked } = lockRes as { ok: string[]; blocked: { agency: string; reason: string }[] };

  const queue = (accounts ?? []).filter((a) => locked.includes(a.agency_id));
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
      const r = await syncMetaAccount(db, a, conn.access_token, { force: opts.manual || opts.force, allowBackfill });
      results.push({ account: a.external_id, accountId: a.id, agency: a.agency_id, ok: true, mode: r.mode, changed: r.changed });
    } catch (e) {
      // "fetch failed" sozinho não diz nada: inclui a causa (ex.: tempo esgotado, conexão recusada)
      const cause = e instanceof Error && e.cause ? ` (${(e.cause as { code?: string; message?: string }).code ?? ""} ${(e.cause as { message?: string }).message ?? ""})` : "";
      const msg = ((e instanceof Error ? e.message : String(e)) + cause).slice(0, 500);
      if (msg !== a.last_error) await db.from("ad_accounts").update({ last_error: msg }).eq("id", a.id);
      results.push({ account: a.external_id, accountId: a.id, agency: a.agency_id, ok: false, error: msg });
    }
  };
  try {
    await Promise.all(Array.from({ length: 4 }, worker));
  } finally {
    if (locked.length) await db.rpc("release_sync_locks", { p_agencies: locked });
  }
  return { results, blocked };
}
