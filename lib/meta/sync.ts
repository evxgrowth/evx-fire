import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampaignStatus, CreativeFormat } from "@/lib/types";
import { graphGet, graphList } from "./graph";
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
    asset_feed_spec?: { titles?: { text: string }[]; bodies?: { text: string }[]; link_urls?: { website_url?: string }[]; videos?: { video_id?: string; thumbnail_url?: string }[]; images?: { url?: string }[] };
    object_story_spec?: {
      link_data?: { name?: string; message?: string; picture?: string; link?: string; call_to_action?: { type?: string }; child_attachments?: unknown[] };
      video_data?: { title?: string; message?: string; image_url?: string; video_id?: string; call_to_action?: { type?: string; value?: { link?: string } } };
    };
  };
}

const METRIC_FIELDS = "spend,impressions,reach,clicks,frequency,actions,action_values";

/** Sincroniza UMA conta de anúncios da Meta (campanhas, conjuntos, anúncios e métricas). */
export async function syncMetaAccount(db: SupabaseClient, account: { id: string; agency_id: string; external_id: string }, token: string) {
  const act = account.external_id; // "act_123"
  const range = JSON.stringify({ since: daysAgo(DAYS - 1), until: today() });
  const now = new Date().toISOString();

  const [info, camps, daily, campTotals, adsets, adsetTotals, ads, adTotals] = await Promise.all([
    graphGet<{ account_status?: number; name?: string }>(act, { access_token: token, fields: "account_status,name" }).catch(() => ({}) as { account_status?: number; name?: string }),
    graphList<MetaCampaign>(`${act}/campaigns`, {
      access_token: token,
      fields: "id,name,objective,effective_status,daily_budget,lifetime_budget,bid_strategy,start_time,stop_time",
    }),
    graphList<Insight>(`${act}/insights`, {
      access_token: token,
      level: "campaign",
      time_increment: "1",
      time_range: range,
      fields: `campaign_id,${METRIC_FIELDS}`,
    }),
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
        "id,name,effective_status,campaign_id,adset_id,preview_shareable_link,creative{id,title,body,image_url,thumbnail_url,object_type,video_id,call_to_action_type,effective_object_story_id,instagram_permalink_url,asset_feed_spec,object_story_spec}",
      effective_status: JSON.stringify(["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "IN_PROCESS", "WITH_ISSUES"]),
    }),
    graphList<Insight>(`${act}/insights`, { access_token: token, level: "ad", time_range: range, fields: `ad_id,${METRIC_FIELDS}` }),
  ]);

  const campTot = new Map(campTotals.map((r) => [r.campaign_id!, metricsFromInsight(r as unknown as Record<string, unknown>)]));
  const setTot = new Map(adsetTotals.map((r) => [r.adset_id!, metricsFromInsight(r as unknown as Record<string, unknown>)]));
  const adTot = new Map(adTotals.map((r) => [r.ad_id!, metricsFromInsight(r as unknown as Record<string, unknown>)]));

  // ---------- Campanhas ----------
  // Todas, ativas e inativas. Arquivadas/excluídas só se tiveram gasto no período.
  const withData = new Set(daily.map((d) => d.campaign_id));
  const relevant = camps.filter((c) => withData.has(c.id) || (c.effective_status !== "ARCHIVED" && c.effective_status !== "DELETED"));

  const { data: saved, error } = await db
    .from("campaigns")
    .upsert(
      relevant.map((c) => ({
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
        reach_30d: campTot.get(c.id)?.reach ?? 0,
        metrics_30d: campTot.get(c.id) ?? {},
        updated_at: now,
      })),
      { onConflict: "ad_account_id,external_id" },
    )
    .select("id, external_id");
  if (error) throw new Error(error.message);
  const campId = new Map((saved ?? []).map((s) => [s.external_id as string, s.id as string]));

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
  const setGoal = new Map<string, { goal: string; promoted: Record<string, unknown> | null }>();
  for (let i = 0; i < setRows.length; i += 300) {
    const { data, error: e } = await db.from("ad_sets").upsert(setRows.slice(i, i + 300), { onConflict: "campaign_id,external_id" }).select("id, external_id");
    if (e) throw new Error(e.message);
    for (const r of data ?? []) setId.set(r.external_id, r.id);
  }
  for (const s of adsets) setGoal.set(s.id, { goal: s.optimization_goal ?? "", promoted: s.promoted_object ?? null });

  // ---------- Vídeos: tenta obter o link do arquivo e a capa ----------
  const videoIds = [...new Set(ads.map((a) => a.creative?.video_id ?? a.creative?.object_story_spec?.video_data?.video_id ?? a.creative?.asset_feed_spec?.videos?.[0]?.video_id).filter(Boolean) as string[])];
  const videos = new Map<string, { source?: string; picture?: string }>();
  for (let i = 0; i < videoIds.length; i += 50) {
    try {
      const res = await graphGet<Record<string, { source?: string; picture?: string }>>("", {
        access_token: token,
        ids: videoIds.slice(i, i + 50).join(","),
        fields: "source,picture",
      });
      for (const [id, v] of Object.entries(res)) videos.set(id, v);
    } catch {
      // sem permissão para algum vídeo: seguimos só com a capa do criativo
    }
  }

  // ---------- Anúncios / criativos ----------
  const creatives = ads
    .filter((a) => campId.has(a.campaign_id))
    .map((a) => {
      const cr = a.creative ?? ({} as NonNullable<MetaAd["creative"]>);
      const story = cr.object_story_spec;
      const feed = cr.asset_feed_spec;
      const videoId = cr.video_id ?? story?.video_data?.video_id ?? feed?.videos?.[0]?.video_id;
      const isVideo = !!videoId || cr.object_type === "VIDEO";
      const isCarousel = (story?.link_data?.child_attachments?.length ?? 0) > 0;
      const format: CreativeFormat = isVideo ? "video" : isCarousel ? "carousel" : "image";
      const m = adTot.get(a.id);
      const g = setGoal.get(a.adset_id);
      const result = computeResult(m, g?.goal, g?.promoted as { custom_event_type?: string } | null);
      const video = videoId ? videos.get(videoId) : undefined;
      return {
        agency_id: account.agency_id,
        campaign_id: campId.get(a.campaign_id)!,
        ad_set_id: setId.get(a.adset_id) ?? null,
        external_id: a.id,
        creative_id: cr.id ?? null,
        name: a.name,
        format,
        headline: cr.title ?? story?.link_data?.name ?? story?.video_data?.title ?? feed?.titles?.[0]?.text ?? "",
        body: cr.body ?? story?.link_data?.message ?? story?.video_data?.message ?? feed?.bodies?.[0]?.text ?? "",
        image_url: cr.image_url ?? story?.link_data?.picture ?? story?.video_data?.image_url ?? feed?.images?.[0]?.url ?? video?.picture ?? cr.thumbnail_url ?? null,
        thumbnail_url: cr.thumbnail_url ?? video?.picture ?? null,
        video_id: videoId ?? null,
        video_url: video?.source ?? null,
        cta: cr.call_to_action_type ?? story?.link_data?.call_to_action?.type ?? story?.video_data?.call_to_action?.type ?? null,
        link_url: story?.link_data?.link ?? story?.video_data?.call_to_action?.value?.link ?? feed?.link_urls?.[0]?.website_url ?? null,
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

  if (info.account_status != null) await db.from("ad_accounts").update({ account_status: info.account_status }).eq("id", account.id);
  return { campaigns: relevant.length, adsets: setRows.length, ads: creatives.length, days: dailyRows.length };
}

/** Sincroniza todas as contas Meta ativas de uma agência (ou de todas, se agencyId for omitido). */
export async function syncMeta(db: SupabaseClient, agencyId?: string) {
  let q = db.from("ad_accounts").select("id, agency_id, external_id, platform_connections(access_token)").eq("platform", "meta").eq("sync_enabled", true);
  if (agencyId) q = q.eq("agency_id", agencyId);
  const { data: accounts, error } = await q;
  if (error) throw new Error(error.message);

  const results: { account: string; agency: string; ok: boolean; error?: string }[] = [];
  const queue = [...(accounts ?? [])];
  // 4 contas em paralelo para caber no tempo máximo do servidor
  const worker = async () => {
    for (let a = queue.shift(); a; a = queue.shift()) await syncOne(a);
  };
  const syncOne = async (a: NonNullable<typeof accounts>[number]) => {
    const conn = (Array.isArray(a.platform_connections) ? a.platform_connections[0] : a.platform_connections) as { access_token: string } | null;
    if (!conn) return;
    try {
      await syncMetaAccount(db, a, conn.access_token);
      await db.from("ad_accounts").update({ last_synced_at: new Date().toISOString(), last_error: null }).eq("id", a.id);
      results.push({ account: a.external_id, agency: a.agency_id, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.from("ad_accounts").update({ last_error: msg.slice(0, 500) }).eq("id", a.id);
      results.push({ account: a.external_id, agency: a.agency_id, ok: false, error: msg });
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return results;
}
