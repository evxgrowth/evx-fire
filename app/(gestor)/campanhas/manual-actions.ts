"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { lastDays } from "@/lib/repo";
import type { CampaignStatus, Platform } from "@/lib/types";

// Campanhas manuais: vivem numa conta "manual" do cliente e se comportam
// como qualquer outra campanha (painéis, links do cliente e destinos/CRM).

export interface CampaignInput {
  clientId: string;
  platform: Platform;
  name: string;
  objective: string;
  status: CampaignStatus;
  dailyBudget: number;
  lifetimeBudget: number;
  startDate: string;
  endDate: string;
  resultLabel: string;
  notes: string;
}

export interface EntryInput {
  period: "day" | "week" | "month";
  date: string; // yyyy-mm-dd (semana: dia inicial; mês: qualquer dia do mês)
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  results: number;
  revenue: number;
  notes: string;
}

export interface AdSetInput {
  id?: string;
  name: string;
  active: boolean;
  optimizationGoal: string;
  dailyBudget: number;
  ageMin: number;
  ageMax: number;
  genders: number[]; // 1 = homens, 2 = mulheres; vazio = todos
  locations: string[];
  interests: string[];
  customAudiences: string[];
  excludedAudiences: string[];
  placements: string[];
  notes: string;
}

export interface AdInput {
  id?: string;
  adSetId: string;
  name: string;
  active: boolean;
  headline: string;
  body: string;
  cta: string;
  link: string;
  media: { type: "image" | "video"; url: string; path?: string }[];
}

function refresh(campaignId?: string) {
  revalidatePath("/", "layout");
  if (campaignId) revalidatePath(`/campanhas/${campaignId}`);
}

async function ctx() {
  const me = await requireManager();
  const db = await createClient();
  return { me, db };
}

async function manualAccount(db: SupabaseClient, agencyId: string, clientId: string) {
  const { data: found } = await db.from("ad_accounts").select("id").eq("agency_id", agencyId).eq("platform", "manual").eq("client_id", clientId).maybeSingle();
  if (found) return found.id as string;
  const { data: client } = await db.from("clients").select("name").eq("id", clientId).single();
  const { data, error } = await db
    .from("ad_accounts")
    .insert({ agency_id: agencyId, client_id: clientId, platform: "manual", external_id: `manual-${clientId}`, name: `Manual · ${client?.name ?? "cliente"}`, sync_enabled: false })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

function campaignRow(i: CampaignInput) {
  return {
    platform: i.platform,
    name: i.name.trim(),
    objective: i.objective.trim(),
    status: i.status,
    effective_status: i.status === "active" ? "ACTIVE" : i.status === "paused" ? "PAUSED" : "ARCHIVED",
    daily_budget: i.dailyBudget || 0,
    lifetime_budget: i.lifetimeBudget || 0,
    start_time: i.startDate ? new Date(i.startDate + "T00:00:00-03:00").toISOString() : null,
    stop_time: i.endDate ? new Date(i.endDate + "T23:59:59-03:00").toISOString() : null,
    result_label: i.resultLabel.trim(),
    notes: i.notes.trim(),
    updated_at: new Date().toISOString(),
  };
}

// ---------- Campanha ----------
export async function createManualCampaign(i: CampaignInput) {
  const { me, db } = await ctx();
  if (!i.name.trim() || !i.clientId) return { ok: false as const, error: "Preencha o nome e o cliente." };
  const accountId = await manualAccount(db, me.agencyId, i.clientId);
  const { data, error } = await db
    .from("campaigns")
    .insert({ ...campaignRow(i), agency_id: me.agencyId, ad_account_id: accountId, source: "manual", external_id: `manual-${randomUUID()}` })
    .select("id")
    .single();
  if (error) return { ok: false as const, error: error.message };
  refresh();
  return { ok: true as const, id: data.id as string };
}

export async function updateManualCampaign(id: string, i: CampaignInput) {
  const { me, db } = await ctx();
  const accountId = await manualAccount(db, me.agencyId, i.clientId);
  const { error } = await db.from("campaigns").update({ ...campaignRow(i), ad_account_id: accountId }).eq("id", id).eq("source", "manual");
  if (error) return { ok: false as const, error: error.message };
  refresh(id);
  return { ok: true as const };
}

export async function deleteManualCampaign(id: string) {
  const { db } = await ctx();
  await db.from("campaigns").delete().eq("id", id).eq("source", "manual");
  refresh();
}

// ---------- Lançamentos de resultados ----------
const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (s: string) => new Date(s + "T12:00:00Z");

function periodRange(period: EntryInput["period"], date: string) {
  const d = utc(date);
  if (period === "day") return { start: date, end: date };
  if (period === "week") {
    const e = new Date(d);
    e.setUTCDate(e.getUTCDate() + 6);
    return { start: date, end: iso(e) };
  }
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12));
  return { start: iso(start), end: iso(end) };
}

/** Reconstrói as métricas diárias da campanha a partir dos lançamentos (semana/mês são divididos igualmente pelos dias). */
async function recompute(db: SupabaseClient, agencyId: string, campaignId: string) {
  const { data: entries } = await db.from("manual_entries").select("*").eq("campaign_id", campaignId);
  const byDay = new Map<string, { spend: number; impressions: number; reach: number; clicks: number; conversions: number; revenue: number }>();
  for (const e of entries ?? []) {
    const days: string[] = [];
    for (let d = utc(e.start_date); iso(d) <= e.end_date; d.setUTCDate(d.getUTCDate() + 1)) days.push(iso(d));
    const n = days.length || 1;
    for (const day of days) {
      const r = byDay.get(day) ?? { spend: 0, impressions: 0, reach: 0, clicks: 0, conversions: 0, revenue: 0 };
      r.spend += Number(e.spend) / n;
      r.impressions += Number(e.impressions) / n;
      r.reach += Number(e.reach) / n;
      r.clicks += Number(e.clicks) / n;
      r.conversions += Number(e.results) / n;
      r.revenue += Number(e.revenue) / n;
      byDay.set(day, r);
    }
  }

  await db.from("campaign_daily").delete().eq("campaign_id", campaignId);
  const rows = [...byDay].map(([date, r]) => ({
    campaign_id: campaignId,
    agency_id: agencyId,
    date,
    spend: +r.spend.toFixed(2),
    impressions: Math.round(r.impressions),
    reach: Math.round(r.reach),
    clicks: Math.round(r.clicks),
    conversions: +r.conversions.toFixed(2),
    revenue: +r.revenue.toFixed(2),
  }));
  for (let i = 0; i < rows.length; i += 500) await db.from("campaign_daily").insert(rows.slice(i, i + 500));

  const since = lastDays()[0];
  const recent = rows.filter((r) => r.date >= since);
  const sum = (k: "spend" | "impressions" | "reach" | "clicks") => recent.reduce((t, r) => t + r[k], 0);
  await db
    .from("campaigns")
    .update({
      reach_30d: Math.round(sum("reach")),
      metrics_30d: { spend: +sum("spend").toFixed(2), impressions: sum("impressions"), reach: sum("reach"), clicks: sum("clicks"), actions: [], action_values: [] },
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId);
}

export async function addEntry(campaignId: string, i: EntryInput) {
  const { me, db } = await ctx();
  if (!i.date) return { ok: false as const, error: "Escolha a data." };
  const { start, end } = periodRange(i.period, i.date);
  const { error } = await db.from("manual_entries").insert({
    agency_id: me.agencyId,
    campaign_id: campaignId,
    period: i.period,
    start_date: start,
    end_date: end,
    spend: i.spend || 0,
    impressions: i.impressions || 0,
    reach: i.reach || 0,
    clicks: i.clicks || 0,
    results: i.results || 0,
    revenue: i.revenue || 0,
    notes: i.notes.trim(),
  });
  if (error) return { ok: false as const, error: error.message };
  await recompute(db, me.agencyId, campaignId);
  refresh(campaignId);
  return { ok: true as const };
}

export async function deleteEntry(campaignId: string, entryId: string) {
  const { me, db } = await ctx();
  await db.from("manual_entries").delete().eq("id", entryId);
  await recompute(db, me.agencyId, campaignId);
  refresh(campaignId);
}

// ---------- Conjuntos (público) ----------
export async function saveAdSet(campaignId: string, i: AdSetInput) {
  const { me, db } = await ctx();
  const targeting = {
    age_min: i.ageMin || 18,
    age_max: i.ageMax || 65,
    ...(i.genders.length === 1 ? { genders: i.genders } : {}),
    geo_locations: { cities: i.locations.map((name) => ({ name })) },
    flexible_spec: i.interests.length ? [{ interests: i.interests.map((name) => ({ name })) }] : [],
    custom_audiences: i.customAudiences.map((name) => ({ name })),
    excluded_custom_audiences: i.excludedAudiences.map((name) => ({ name })),
    publisher_platforms: i.placements,
  };
  const row = {
    name: i.name.trim() || "Conjunto",
    status: i.active ? "active" : "paused",
    effective_status: i.active ? "ACTIVE" : "PAUSED",
    optimization_goal: i.optimizationGoal,
    daily_budget: i.dailyBudget || 0,
    targeting,
    audience_notes: i.notes.trim(),
    updated_at: new Date().toISOString(),
  };
  const { error } = i.id
    ? await db.from("ad_sets").update(row).eq("id", i.id)
    : await db.from("ad_sets").insert({ ...row, agency_id: me.agencyId, campaign_id: campaignId, external_id: `manual-${randomUUID()}` });
  if (error) return { ok: false as const, error: error.message };
  refresh(campaignId);
  return { ok: true as const };
}

export async function deleteAdSet(campaignId: string, id: string) {
  const { db } = await ctx();
  await db.from("ad_sets").delete().eq("id", id);
  refresh(campaignId);
}

// ---------- Anúncios (criativos) ----------
export async function saveAd(campaignId: string, i: AdInput) {
  const { me, db } = await ctx();
  const images = i.media.filter((m) => m.type === "image");
  const video = i.media.find((m) => m.type === "video");
  const row = {
    ad_set_id: i.adSetId || null,
    name: i.name.trim() || "Anúncio",
    format: video ? "video" : images.length > 1 ? "carousel" : "image",
    headline: i.headline.trim(),
    body: i.body.trim(),
    cta: i.cta || null,
    link_url: i.link.trim() || null,
    image_url: images[0]?.url ?? null,
    thumbnail_url: images[0]?.url ?? null,
    video_url: video?.url ?? null,
    media: i.media,
    active: i.active,
    effective_status: i.active ? "ACTIVE" : "PAUSED",
    updated_at: new Date().toISOString(),
  };
  const { error } = i.id
    ? await db.from("creatives").update(row).eq("id", i.id)
    : await db.from("creatives").insert({ ...row, agency_id: me.agencyId, campaign_id: campaignId, external_id: `manual-${randomUUID()}` });
  if (error) return { ok: false as const, error: error.message };
  refresh(campaignId);
  return { ok: true as const };
}

export async function deleteAd(campaignId: string, id: string) {
  const { db } = await ctx();
  const { data } = await db.from("creatives").select("media").eq("id", id).single();
  const paths = ((data?.media ?? []) as { path?: string }[]).map((m) => m.path).filter(Boolean) as string[];
  if (paths.length) await db.storage.from("creatives").remove(paths);
  await db.from("creatives").delete().eq("id", id);
  refresh(campaignId);
}
