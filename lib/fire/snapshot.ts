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
    ...(geo.cities ?? []).map((c: Row) => (c.radius ? `até ${c.radius} ${c.distance_unit === "mile" ? "milhas" : "km"} de ${c.name}` : c.name)),
    ...(geo.zips ?? []).map((z: Row) => z.name ?? z.key),
    ...(geo.custom_locations ?? []).map((c: Row) => `até ${c.radius} ${c.distance_unit === "mile" ? "milhas" : "km"} de ${c.name ?? c.address_string ?? `${c.latitude}, ${c.longitude}`}`),
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

  const COUNTRY: Record<string, string> = { BR: "Brasil", PT: "Portugal", US: "Estados Unidos" };
  const places = locations.map((l) => COUNTRY[l] ?? l);
  const who = genders.length === 1 ? genders[0] : "Homens e mulheres";
  const age = `${t.age_min ?? 18} a ${t.age_max ?? 65}${(t.age_max ?? 65) >= 65 ? " anos ou mais" : " anos"}`;
  const parts = [
    `${who}, ${age}${places.length ? ", " + (places.slice(0, 5).join(", ") + (places.length > 5 ? ` e mais ${places.length - 5} locais` : "")) : ""}`,
    interests.length ? `Interesses: ${interests.slice(0, 6).join(", ")}${interests.length > 6 ? "…" : ""}` : null,
    custom.length ? `Públicos: ${custom.join(", ")}` : null,
    excluded.length ? `Excluídos: ${excluded.join(", ")}` : null,
    advantage ? "Público Advantage+ ativado" : null,
    notes?.trim() ? notes.trim() : null,
  ].filter(Boolean);

  return {
    summary: parts.join(". ") + ".",
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
function metricsBlock(m: Partial<Metrics> | undefined | null) {
  // Campanhas sem veiculação no período chegam com métricas vazias
  const x: Metrics = {
    spend: Number(m?.spend ?? 0),
    impressions: Number(m?.impressions ?? 0),
    reach: Number(m?.reach ?? 0),
    clicks: Number(m?.clicks ?? 0),
    frequency: Number(m?.frequency ?? 0),
    actions: m?.actions ?? [],
    action_values: m?.action_values ?? [],
  };
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
  range: { since: string; until: string };
}

/** Todos os dias entre duas datas (AAAA-MM-DD), inclusive. */
export function dateRange(since: string, until: string) {
  const out: string[] = [];
  for (let d = new Date(since + "T12:00:00Z"); d.toISOString().slice(0, 10) <= until; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}

/** Carrega a árvore da agência. O histórico diário vai de `since` a `until` (padrão: últimos 90 dias). */
export async function loadAgencyTree(db: SupabaseClient, agencyId: string, opts: { since?: string; until?: string; withDaily?: boolean } = {}): Promise<AgencyTree> {
  const d90 = lastDays(90);
  const since = opts.since ?? d90[0];
  const until = opts.until ?? d90[d90.length - 1];
  const [{ data: agency }, { data: accounts }, { data: clients }] = await Promise.all([
    db.from("agencies").select("name").eq("id", agencyId).single(),
    db.from("ad_accounts").select("id, external_id, name, currency, client_id, platform, sync_enabled").eq("agency_id", agencyId).order("name"),
    db.from("clients").select("id, name, active").eq("agency_id", agencyId),
  ]);
  // Só busca o que pode ser enviado: contas ativas de clientes ativos
  const inactiveClients = new Set((clients ?? []).filter((c) => !c.active).map((c) => c.id));
  const okAccounts = (accounts ?? []).filter((acc) => (acc.platform === "manual" || acc.sync_enabled) && (!acc.client_id || !inactiveClients.has(acc.client_id))).map((acc) => acc.id as string);
  const chunks = (ids: string[]) => Array.from({ length: Math.ceil(ids.length / 150) }, (_, i) => ids.slice(i * 150, i * 150 + 150));
  const camps = (await Promise.all(chunks(okAccounts).map((ids) => fetchAll((a, b) => db.from("campaigns").select("*").in("ad_account_id", ids).range(a, b))))).flat();
  const campIds = camps.map((c) => c.id as string);
  const [sets, ads, daily] = await Promise.all([
    Promise.all(chunks(campIds).map((ids) => fetchAll((a, b) => db.from("ad_sets").select("*").in("campaign_id", ids).range(a, b)))).then((x) => x.flat()),
    Promise.all(chunks(campIds).map((ids) => fetchAll((a, b) => db.from("creatives").select("*").in("campaign_id", ids).range(a, b)))).then((x) => x.flat()),
    Promise.all(
      (opts.withDaily === false ? [] : chunks(campIds)).map((ids) =>
        fetchAll((a, b) => db.from("campaign_daily").select("campaign_id, date, spend, impressions, reach, clicks, conversions, revenue").in("campaign_id", ids).gte("date", since).lte("date", until).order("date").range(a, b)),
      ),
    ).then((x) => x.flat()),
  ]);

  const dailyBy = new Map<string, Row[]>();
  for (const d of daily) (dailyBy.get(d.campaign_id) ?? dailyBy.set(d.campaign_id, []).get(d.campaign_id)!).push(d);
  const clientBy = new Map((clients ?? []).map((c) => [c.id, c]));

  // Clientes desativados não são enviados a nenhum destino
  const inactive = new Set((clients ?? []).filter((c) => !c.active).map((c) => c.id));
  // Contas desativadas e clientes inativos não são enviados
  const tree = (accounts ?? []).filter((acc) => (acc.platform === "manual" || acc.sync_enabled) && (!acc.client_id || !inactive.has(acc.client_id))).map((acc) => ({
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
    range: { since, until },
  };
}

// ---------- Pacote enviado ao CRM ----------
export function buildAccountPayloads(data: AgencyTree, filters: Partial<DestFilters>) {
  const allDays = dateRange(data.range.since, data.range.until);
  const today = lastDays(1)[0];
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
          // Todos os dias do período, com zero onde não houve veiculação.
          // Campanha sem nenhuma veiculação no período vem com a lista vazia (economiza envio).
          daily: (days.length ? allDays : []).map((date) => {
            const d = days.find((x) => x.date === date);
            return { date, spend: Number(d?.spend ?? 0), impressions: Number(d?.impressions ?? 0), reach: Number(d?.reach ?? 0), clicks: Number(d?.clicks ?? 0), conversions: Number(d?.conversions ?? 0), revenue: Number(d?.revenue ?? 0) };
          }),
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
