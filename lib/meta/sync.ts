import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampaignStatus, CreativeFormat } from "@/lib/types";
import { graphList } from "./graph";

const DAYS = 30;

type Action = { action_type: string; value: string };

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

interface MetaCampaign {
  id: string;
  name: string;
  objective?: string;
  effective_status: string;
  daily_budget?: string;
  lifetime_budget?: string;
  stop_time?: string;
}
interface Insight {
  campaign_id?: string;
  ad_id?: string;
  date_start: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  actions?: Action[];
  action_values?: Action[];
}
interface MetaAd {
  id: string;
  name: string;
  effective_status: string;
  campaign_id: string;
  creative?: {
    id: string;
    title?: string;
    body?: string;
    image_url?: string;
    thumbnail_url?: string;
    object_type?: string;
    video_id?: string;
    asset_feed_spec?: { titles?: { text: string }[]; bodies?: { text: string }[] };
    object_story_spec?: { link_data?: { name?: string; message?: string; picture?: string; child_attachments?: unknown[] }; video_data?: { title?: string; message?: string; image_url?: string } };
  };
}

/** Sincroniza UMA conta de anúncios da Meta (campanhas, métricas diárias e criativos). */
export async function syncMetaAccount(
  db: SupabaseClient,
  account: { id: string; agency_id: string; external_id: string },
  token: string,
) {
  const act = account.external_id; // "act_123"
  const range = JSON.stringify({ since: daysAgo(DAYS - 1), until: today() });

  // 1) Campanhas
  const camps = await graphList<MetaCampaign>(`${act}/campaigns`, {
    access_token: token,
    fields: "id,name,objective,effective_status,daily_budget,lifetime_budget,stop_time",
  });

  // 2) Métricas diárias por campanha
  const daily = await graphList<Insight>(`${act}/insights`, {
    access_token: token,
    level: "campaign",
    time_increment: "1",
    time_range: range,
    fields: "campaign_id,spend,impressions,reach,clicks,actions,action_values",
  });

  // 3) Alcance do período (alcance não pode ser somado dia a dia)
  const reachRows = await graphList<Insight>(`${act}/insights`, {
    access_token: token,
    level: "campaign",
    time_range: range,
    fields: "campaign_id,reach",
  });
  const reachBy = new Map(reachRows.map((r) => [r.campaign_id!, Number(r.reach) || 0]));

  // Só guardamos campanhas que tiveram entrega no período ou estão ativas
  const withData = new Set(daily.map((d) => d.campaign_id));
  const relevant = camps.filter((c) => withData.has(c.id) || c.effective_status === "ACTIVE");

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
        status: statusOf(c.effective_status, c.stop_time),
        daily_budget: Number(c.daily_budget ?? 0) / 100,
        reach_30d: reachBy.get(c.id) ?? 0,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "ad_account_id,external_id" },
    )
    .select("id, external_id");
  if (error) throw new Error(error.message);

  const idOf = new Map((saved ?? []).map((s) => [s.external_id as string, s.id as string]));

  const dailyRows = daily
    .filter((d) => idOf.has(d.campaign_id!))
    .map((d) => ({
      campaign_id: idOf.get(d.campaign_id!)!,
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

  // 4) Anúncios / criativos + resultados por anúncio
  const ads = await graphList<MetaAd>(`${act}/ads`, {
    access_token: token,
    fields:
      "id,name,effective_status,campaign_id,creative{id,title,body,image_url,thumbnail_url,object_type,video_id,asset_feed_spec,object_story_spec}",
    effective_status: JSON.stringify(["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "IN_PROCESS", "WITH_ISSUES"]),
  });
  const adStats = await graphList<Insight>(`${act}/insights`, {
    access_token: token,
    level: "ad",
    time_range: range,
    fields: "ad_id,spend,impressions,clicks,actions",
  });
  const statBy = new Map(adStats.map((s) => [s.ad_id!, s]));

  const creatives = ads
    .filter((a) => idOf.has(a.campaign_id))
    .map((a) => {
      const cr = a.creative ?? ({} as NonNullable<MetaAd["creative"]>);
      const story = cr.object_story_spec;
      const isVideo = !!cr.video_id || cr.object_type === "VIDEO" || !!story?.video_data;
      const isCarousel = (story?.link_data?.child_attachments?.length ?? 0) > 0;
      const format: CreativeFormat = isVideo ? "video" : isCarousel ? "carousel" : "image";
      const st = statBy.get(a.id);
      return {
        agency_id: account.agency_id,
        campaign_id: idOf.get(a.campaign_id)!,
        external_id: a.id,
        name: a.name,
        format,
        headline: cr.title ?? story?.link_data?.name ?? story?.video_data?.title ?? cr.asset_feed_spec?.titles?.[0]?.text ?? "",
        body: cr.body ?? story?.link_data?.message ?? story?.video_data?.message ?? cr.asset_feed_spec?.bodies?.[0]?.text ?? "",
        image_url: cr.image_url ?? story?.link_data?.picture ?? story?.video_data?.image_url ?? cr.thumbnail_url ?? null,
        active: a.effective_status === "ACTIVE",
        impressions: Number(st?.impressions) || 0,
        clicks: Number(st?.clicks) || 0,
        spend: Number(st?.spend) || 0,
        conversions: conversionsOf(st?.actions),
        updated_at: new Date().toISOString(),
      };
    });
  for (let i = 0; i < creatives.length; i += 500) {
    const { error: e } = await db.from("creatives").upsert(creatives.slice(i, i + 500), { onConflict: "campaign_id,external_id" });
    if (e) throw new Error(e.message);
  }

  return { campaigns: relevant.length, days: dailyRows.length, creatives: creatives.length };
}

/** Sincroniza todas as contas Meta ativas de uma agência (ou de todas, se agencyId for omitido). */
export async function syncMeta(db: SupabaseClient, agencyId?: string) {
  let q = db
    .from("ad_accounts")
    .select("id, agency_id, external_id, platform_connections(access_token)")
    .eq("platform", "meta")
    .eq("sync_enabled", true);
  if (agencyId) q = q.eq("agency_id", agencyId);
  const { data: accounts, error } = await q;
  if (error) throw new Error(error.message);

  const results: { account: string; ok: boolean; error?: string }[] = [];
  for (const a of accounts ?? []) {
    const conn = (Array.isArray(a.platform_connections) ? a.platform_connections[0] : a.platform_connections) as { access_token: string } | null;
    if (!conn) continue;
    try {
      await syncMetaAccount(db, a, conn.access_token);
      await db.from("ad_accounts").update({ last_synced_at: new Date().toISOString(), last_error: null }).eq("id", a.id);
      results.push({ account: a.external_id, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.from("ad_accounts").update({ last_error: msg.slice(0, 500) }).eq("id", a.id);
      results.push({ account: a.external_id, ok: false, error: msg });
    }
  }
  return results;
}
