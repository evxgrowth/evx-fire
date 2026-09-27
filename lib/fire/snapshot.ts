import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lastDays } from "@/lib/repo";
import { computeResult, GOAL_LABELS, revenueOf, type Metrics, type Result } from "@/lib/meta/results";
import { applyFilters, normalizeFilters, type DestFilters, type NodeAccount } from "./filters";

export const PAYLOAD_VERSION = "1";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

async function fetchAll(build: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>) {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// ---------- Público (targeting) em linguagem simples ----------
const GENDERS: Record<number, string> = { 1: "Homens", 2: "Mulheres" };

export function audienceOf(t: Row | null | undefined, notes?: string) {
  if (!t && !notes) return null;
  t = t ?? {};
  const geo = t.geo_locations ?? {};
  const locations: string[] = [
    ...(geo.countries ?? []),
    ...(geo.regions ?? []).map((r: Row) => r.name),
    ...(geo.cities ?? []).map((c: Row) => (c.radius ? `${c.name} (+${c.radius} ${c.distance_unit === "mile" ? "mi" : "km"})` : c.name)),
    ...(geo.zips ?? []).map((z: Row) => z.name ?? z.key),
    ...(geo.custom_locations ?? []).map((c: Row) => c.name ?? `${c.latitude},${c.longitude} (+${c.radius}${c.distance_unit === "mile" ? "mi" : "km"})`),
  ].filter(Boolean);
  const interests: string[] = [];
  for (const spec of t.flexible_spec ?? []) {
    for (const key of ["interests", "behaviors", "life_events", "industries", "work_positions", "family_statuses"]) {
      for (const it of spec[key] ?? []) if (it?.name) interests.push(it.name);
    }
  }
  const genders = (t.genders ?? []).map((g: number) => GENDERS[g]).filter(Boolean);
  const custom = (t.custom_audiences ?? []).map((a: Row) => a.name ?? a.id);
  const excluded = (t.excluded_custom_audiences ?? []).map((a: Row) => a.name ?? a.id);
  const advantage = t.targeting_automation?.advantage_audience === 1;
  const placements = [...(t.publisher_platforms ?? []), ...(t.instagram_positions ?? []).map((p: string) => `instagram_${p}`), ...(t.facebook_positions ?? []).map((p: string) => `facebook_${p}`)];

  const parts = [
    `${t.age_min ?? 18}–${t.age_max ?? 65}${(t.age_max ?? 65) >= 65 ? "+" : ""} anos`,
    genders.length ? genders.join(" e ") : "Todos os gêneros",
    locations.length ? locations.slice(0, 6).join(", ") + (locations.length > 6 ? ` e mais ${locations.length - 6}` : "") : null,
    interests.length ? `Interesses: ${interests.slice(0, 6).join(", ")}${interests.length > 6 ? "…" : ""}` : null,
    custom.length ? `Públicos: ${custom.join(", ")}` : null,
    excluded.length ? `Excluídos: ${excluded.join(", ")}` : null,
    advantage ? "Público Advantage+ ativado" : null,
    notes?.trim() ? notes.trim() : null,
  ].filter(Boolean);

  return {
    summary: parts.join(" · "),
    age_min: t.age_min ?? null,
    age_max: t.age_max ?? null,
    genders,
    locations,
    interests,
    custom_audiences: custom,
    excluded_custom_audiences: excluded,
    advantage_audience: advantage,
    placements: placements.length ? placements : ["automáticos (Advantage+)"],
    notes: notes?.trim() || null,
    raw: t,
  };
}

// ---------- Métricas ----------
function metricsBlock(m: Metrics | undefined | null) {
  const x = m ?? ({ spend: 0, impressions: 0, reach: 0, clicks: 0 } as Metrics);
  const revenue = revenueOf(x);
  return {
    spend: +x.spend.toFixed(2),
    impressions: x.impressions,
    reach: x.reach,
    clicks: x.clicks,
    frequency: x.frequency ? +Number(x.frequency).toFixed(2) : x.reach ? +(x.impressions / x.reach).toFixed(2) : 0,
    ctr: x.impressions ? +((x.clicks / x.impressions) * 100).toFixed(2) : 0,
    cpc: x.clicks ? +(x.spend / x.clicks).toFixed(2) : 0,
    cpm: x.impressions ? +((x.spend / x.impressions) * 1000).toFixed(2) : 0,
    revenue: +revenue.toFixed(2),
    roas: x.spend ? +(revenue / x.spend).toFixed(2) : 0,
    actions: (x.actions ?? []).map((a) => ({ type: a.action_type, value: Number(a.value) })),
  };
}

function campaignResult(sets: { result: Result | null; spend: number }[], spend: number): Result | null {
  const byType = new Map<string, Result>();
  for (const s of sets) {
    if (!s.result) continue;
    const cur = byType.get(s.result.type) ?? { ...s.result, value: 0, cost_per_result: null };
    cur.value += s.result.value;
    byType.set(s.result.type, cur);
  }
  const best = [...byType.values()].sort((a, b) => b.value - a.value)[0];
  if (!best) return null;
  return { ...best, cost_per_result: best.value > 0 ? +(spend / best.value).toFixed(2) : null };
}

// ---------- Carga ----------
export interface AgencyTree {
  tree: (NodeAccount & { currency: string; platform: string; client: { id: string; name: string } | null })[];
  campaigns: Map<string, Row>;
  adsets: Map<string, Row>;
  ads: Map<string, Row>;
  daily: Map<string, Row[]>;
  agencyName: string;
}

export async function loadAgencyTree(db: SupabaseClient, agencyId: string): Promise<AgencyTree> {
  const since = lastDays()[0];
  const [{ data: agency }, { data: accounts }, { data: clients }] = await Promise.all([
    db.from("agencies").select("name").eq("id", agencyId).single(),
    db.from("ad_accounts").select("id, external_id, name, currency, client_id, platform").eq("agency_id", agencyId).order("name"),
    db.from("clients").select("id, name, active").eq("agency_id", agencyId),
  ]);
  const [camps, sets, ads, daily] = await Promise.all([
    fetchAll((a, b) => db.from("campaigns").select("*").eq("agency_id", agencyId).range(a, b)),
    fetchAll((a, b) => db.from("ad_sets").select("*").eq("agency_id", agencyId).range(a, b)),
    fetchAll((a, b) => db.from("creatives").select("*").eq("agency_id", agencyId).range(a, b)),
    fetchAll((a, b) => db.from("campaign_daily").select("campaign_id, date, spend, impressions, reach, clicks, conversions, revenue").eq("agency_id", agencyId).gte("date", since).order("date").range(a, b)),
  ]);

  const dailyBy = new Map<string, Row[]>();
  for (const d of daily) (dailyBy.get(d.campaign_id) ?? dailyBy.set(d.campaign_id, []).get(d.campaign_id)!).push(d);
  const clientBy = new Map((clients ?? []).map((c) => [c.id, c]));

  // Clientes desativados não são enviados a nenhum destino
  const inactive = new Set((clients ?? []).filter((c) => !c.active).map((c) => c.id));
  const tree = (accounts ?? []).filter((acc) => !acc.client_id || !inactive.has(acc.client_id)).map((acc) => ({
    id: acc.id,
    external_id: acc.external_id,
    name: acc.name,
    client_id: acc.client_id as string | null,
    platform: acc.platform as string,
    currency: acc.currency,
    client: acc.client_id ? (clientBy.get(acc.client_id) ? { id: acc.client_id, name: clientBy.get(acc.client_id)!.name } : null) : null,
    campaigns: camps
      .filter((c) => c.ad_account_id === acc.id)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({
        id: c.id,
        external_id: c.external_id,
        name: c.name,
        status: c.status,
        source: c.source ?? "api",
        adsets: sets
          .filter((s) => s.campaign_id === c.id)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((s) => ({
            id: s.id,
            external_id: s.external_id,
            name: s.name,
            active: s.effective_status === "ACTIVE",
            ads: ads.filter((a) => a.ad_set_id === s.id).map((a) => ({ id: a.id, external_id: a.external_id, name: a.name, active: !!a.active })),
          })),
      })),
  }));

  return {
    tree,
    campaigns: new Map(camps.map((c) => [c.id, c])),
    adsets: new Map(sets.map((s) => [s.id, s])),
    ads: new Map(ads.map((a) => [a.id, a])),
    daily: dailyBy,
    agencyName: agency?.name ?? "",
  };
}

// ---------- Pacote enviado ao CRM ----------
export function buildAccountPayloads(data: AgencyTree, filters: Partial<DestFilters>) {
  const today = lastDays()[29];
  const f = normalizeFilters(filters);
  const keptBy = new Map(applyFilters(data.tree, f).map((a) => [a.id, a]));
  // Toda conta dentro do escopo gera um pacote, mesmo vazio: assim o CRM sabe o que remover.
  const scope = data.tree.filter((t) => f.mode === "manual" || !f.accounts.length || f.accounts.includes(t.id));

  return scope.map((full) => {
    const acc = keptBy.get(full.id) ?? { ...full, campaigns: [] };
    const campaigns = acc.campaigns.map((cNode) => {
      const c = data.campaigns.get(cNode.id)!;
      const days = data.daily.get(c.id) ?? [];
      const todayRow = days.find((d) => d.date === today);

      const adsets = cNode.adsets.map((sNode) => {
        const s = data.adsets.get(sNode.id)!;
        const sm = s.metrics_30d as Metrics;
        const result = computeResult(sm, s.optimization_goal, s.promoted_object);
        return {
          id: s.id,
          external_id: s.external_id,
          name: s.name,
          status: s.status,
          effective_status: s.effective_status,
          is_active: s.effective_status === "ACTIVE",
          budget: { daily: Number(s.daily_budget), lifetime: Number(s.lifetime_budget) },
          optimization_goal: s.optimization_goal,
          optimization_goal_label: GOAL_LABELS[s.optimization_goal] ?? s.optimization_goal,
          billing_event: s.billing_event,
          bid_strategy: s.bid_strategy,
          conversion_event: s.promoted_object?.custom_event_type ?? null,
          start_time: s.start_time,
          end_time: s.end_time,
          audience: audienceOf(s.targeting, s.audience_notes),
          result: c.source === "manual" ? null : result,
          metrics: { last_30d: metricsBlock(sm) },
          ads: sNode.ads.map((aNode) => {
            const a = data.ads.get(aNode.id)!;
            const am = a.metrics_30d as Metrics;
            return {
              id: a.id,
              external_id: a.external_id,
              name: a.name,
              effective_status: a.effective_status,
              is_active: !!a.active,
              creative: {
                id: a.creative_id,
                format: a.format,
                title: a.headline,
                body: a.body,
                call_to_action: a.cta,
                link_url: a.link_url,
                image_url: a.image_url,
                thumbnail_url: a.thumbnail_url,
                video: a.video_id || a.video_url ? { id: a.video_id, source_url: a.video_url, thumbnail_url: a.thumbnail_url ?? a.image_url } : null,
                media: a.media ?? [],
                preview_url: a.preview_url,
                permalink_url: a.permalink_url,
              },
              result: c.source === "manual" ? null : computeResult(am, s.optimization_goal, s.promoted_object),
              metrics: { last_30d: metricsBlock(am) },
            };
          }),
        };
      });

      const cm = c.metrics_30d as Metrics;
      const fullAdsets = [...data.adsets.values()].filter((s) => s.campaign_id === c.id);
      const manual = c.source === "manual";
      const manualResults = days.reduce((t, d) => t + Number(d.conversions), 0);
      const result = manual
        ? { type: "manual", label: c.result_label || "Resultados", value: manualResults, cost_per_result: manualResults > 0 ? +(Number(cm?.spend ?? 0) / manualResults).toFixed(2) : null }
        : campaignResult(
            fullAdsets.map((s) => ({ result: computeResult(s.metrics_30d, s.optimization_goal, s.promoted_object), spend: Number(s.metrics_30d?.spend ?? 0) })),
            Number(cm?.spend ?? 0),
          );
      const budgetLevel = Number(c.daily_budget) || Number(c.lifetime_budget) ? "campaign" : "adset";

      return {
        id: c.id,
        external_id: c.external_id,
        platform: c.platform,
        source: c.source ?? "api",
        client: full.client,
        name: c.name,
        status: c.status,
        effective_status: c.effective_status,
        is_active: c.status === "active",
        objective: c.objective,
        objective_raw: c.objective_raw,
        bid_strategy: c.bid_strategy,
        budget: {
          level: budgetLevel,
          daily: budgetLevel === "campaign" ? Number(c.daily_budget) : fullAdsets.reduce((t, s) => t + Number(s.daily_budget), 0),
          lifetime: budgetLevel === "campaign" ? Number(c.lifetime_budget) : fullAdsets.reduce((t, s) => t + Number(s.lifetime_budget), 0),
        },
        start_time: c.start_time,
        stop_time: c.stop_time,
        result,
        metrics: {
          last_30d: metricsBlock(cm),
          today: todayRow
            ? { spend: Number(todayRow.spend), impressions: Number(todayRow.impressions), reach: Number(todayRow.reach), clicks: Number(todayRow.clicks), conversions: Number(todayRow.conversions), revenue: Number(todayRow.revenue) }
            : { spend: 0, impressions: 0, reach: 0, clicks: 0, conversions: 0, revenue: 0 },
          daily: days.map((d) => ({ date: d.date, spend: Number(d.spend), impressions: Number(d.impressions), reach: Number(d.reach), clicks: Number(d.clicks), conversions: Number(d.conversions), revenue: Number(d.revenue) })),
        },
        ad_sets: adsets,
      };
    });

    const tot = campaigns.reduce(
      (t, c) => ({ spend: t.spend + c.metrics.last_30d.spend, impressions: t.impressions + c.metrics.last_30d.impressions, clicks: t.clicks + c.metrics.last_30d.clicks, revenue: t.revenue + c.metrics.last_30d.revenue }),
      { spend: 0, impressions: 0, clicks: 0, revenue: 0 },
    );

    return {
      ad_account: { id: full.id, external_id: full.external_id, name: full.name, platform: full.platform, currency: full.currency, client: full.client },
      counts: {
        campaigns: campaigns.length,
        campaigns_active: campaigns.filter((c) => c.is_active).length,
        ad_sets: campaigns.reduce((t, c) => t + c.ad_sets.length, 0),
        ads: campaigns.reduce((t, c) => t + c.ad_sets.reduce((u, s) => u + s.ads.length, 0), 0),
      },
      totals_30d: { ...tot, spend: +tot.spend.toFixed(2), revenue: +tot.revenue.toFixed(2) },
      campaigns,
    };
  });
}
