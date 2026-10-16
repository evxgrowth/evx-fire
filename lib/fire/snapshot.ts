import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lastDays } from "@/lib/repo";
import { computeResult, GOAL_LABELS, revenueOf, type Metrics, type Result } from "@/lib/meta/results";
import { applyFilters, normalizeFilters, type DestFilters, type NodeAccount } from "./filters";

export const PAYLOAD_VERSION = "1";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;


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

interface Snap {
  agency_name: string | null;
  accounts: Row[];
  clients: Row[];
  campaigns: Row[];
  adsets: Row[];
  ads: Row[];
  /** { campanha: [[data, gasto, impressões, alcance, cliques, conversões, receita], ...] } */
  daily_by: Record<string, [string, number, number, number, number, number, number][]>;
}

// Uma conta por chamada (cada uma fica bem abaixo do limite de 8 s do banco), até 3 ao mesmo tempo
const ACCOUNTS_PER_CALL = 1;
const PARALLEL_CALLS = 3;

/** Contas que entram no pacote: conectadas e ligadas (ou manuais), de clientes ativos (mesma regra do banco). */
async function visibleAccounts(db: SupabaseClient, agencyId: string): Promise<string[]> {
  const { data, error } = await db.from("ad_accounts").select("id, platform, sync_enabled, client_id, clients(active)").eq("agency_id", agencyId).order("id");
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((a) => a.platform === "manual" || a.sync_enabled)
    .filter((a) => {
      const c = (Array.isArray(a.clients) ? a.clients[0] : a.clients) as { active: boolean } | null;
      return !a.client_id || c?.active === true;
    })
    .map((a) => a.id as string);
}

/**
 * Carrega a árvore da agência numa única chamada ao banco (função snapshot_data).
 * O histórico diário vai de `since` a `until` (padrão: últimos 90 dias).
 * Com o cliente do gestor, as regras de segurança valem; com a chave do servidor, vê tudo.
 */
export async function loadAgencyTree(db: SupabaseClient, agencyId: string, opts: { since?: string; until?: string; withDaily?: boolean; onlyAccounts?: string[] } = {}): Promise<AgencyTree> {
  const d90 = lastDays(90);
  const since = opts.since ?? d90[0];
  const until = opts.until ?? d90[d90.length - 1];
  // Conta por conta: cada chamada ao banco fica curta, mesmo com milhares de campanhas
  // (a agência inteira numa chamada só estoura tempo e memória do banco a partir de ~5.000 campanhas).
  const ids = opts.onlyAccounts ?? (await visibleAccounts(db, agencyId));
  const chunks: (string[] | null)[] = [];
  for (let i = 0; i < ids.length; i += ACCOUNTS_PER_CALL) chunks.push(ids.slice(i, i + ACCOUNTS_PER_CALL));
  if (!chunks.length) chunks.push([]);
  const parts: Snap[] = [];
  for (let i = 0; i < chunks.length; i += PARALLEL_CALLS) {
    const batch = await Promise.all(
      chunks.slice(i, i + PARALLEL_CALLS).map(async (chunk) => {
        const { data, error } = await db.rpc("snapshot_data2", {
          p_agency: agencyId,
          p_accounts: chunk,
          p_since: since,
          p_until: until,
          p_with_daily: opts.withDaily !== false,
        });
        if (error) throw new Error(error.message);
        return data as Snap;
      }),
    );
    parts.push(...batch);
  }
  const snap: Snap = {
    agency_name: parts[0].agency_name,
    clients: parts[0].clients,
    accounts: parts.flatMap((x) => x.accounts),
    campaigns: parts.flatMap((x) => x.campaigns),
    adsets: parts.flatMap((x) => x.adsets),
    ads: parts.flatMap((x) => x.ads),
    daily_by: Object.assign({}, ...parts.map((x) => x.daily_by)),
  };

  const tree = buildTree(snap);
  // Histórico diário: vem compacto do banco e é aberto aqui nos mesmos objetos de antes
  const dailyBy = new Map<string, Row[]>();
  for (const [campaignId, rows] of Object.entries(snap.daily_by ?? {}))
    dailyBy.set(
      campaignId,
      rows.map(([date, spend, impressions, reach, clicks, conversions, revenue]) => ({ campaign_id: campaignId, date, spend, impressions, reach, clicks, conversions, revenue })),
    );

  return {
    tree,
    campaigns: new Map(snap.campaigns.map((c) => [c.id as string, c])),
    adsets: new Map(snap.adsets.map((st) => [st.id as string, st])),
    ads: new Map(snap.ads.map((a) => [a.id as string, a])),
    daily: dailyBy,
    agencyName: snap.agency_name ?? "",
    range: { since, until },
  };
}

// ---------- Pacote enviado ao CRM ----------
export function buildAccountPayloads(data: AgencyTree, filters: Partial<DestFilters>) {
  // conjuntos agrupados por campanha (uma vez, em vez de procurar na lista toda a cada campanha)
  const setsByCampaign = new Map<string, Row[]>();
  for (const st of data.adsets.values()) {
    const k = st.campaign_id as string;
    if (!setsByCampaign.has(k)) setsByCampaign.set(k, []);
    setsByCampaign.get(k)!.push(st);
  }
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
      const dayBy = new Map(days.map((d) => [d.date as string, d]));
      const todayRow = dayBy.get(today);

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
      const fullAdsets = setsByCampaign.get(c.id) ?? [];
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
            const d = dayBy.get(date);
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

/** Monta a árvore conta → campanha → conjunto → anúncio (ordenada por nome). */
function buildTree(snap: Pick<Snap, "accounts" | "clients" | "campaigns" | "adsets" | "ads">) {
  // Índices em memória (em vez de procurar na lista toda a cada item)
  const group = (rows: Row[], key: string) => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const k = r[key] as string;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return m;
  };
  const campsBy = group(snap.campaigns, "ad_account_id");
  const setsBy = group(snap.adsets, "campaign_id");
  const adsBy = group(snap.ads, "ad_set_id");
  const clientBy = new Map(snap.clients.map((c) => [c.id as string, c]));
  const byName = (x: Row, y: Row) => String(x.name).localeCompare(String(y.name));

  return [...snap.accounts].sort(byName).map((acc) => ({
    id: acc.id as string,
    external_id: acc.external_id as string,
    name: acc.name as string,
    client_id: (acc.client_id as string | null) ?? null,
    platform: acc.platform as string,
    currency: acc.currency as string,
    client: acc.client_id && clientBy.get(acc.client_id as string) ? { id: acc.client_id as string, name: clientBy.get(acc.client_id as string)!.name as string } : null,
    campaigns: (campsBy.get(acc.id as string) ?? []).sort(byName).map((c) => ({
      id: c.id as string,
      external_id: c.external_id as string,
      name: c.name as string,
      status: c.status as NodeAccount["campaigns"][number]["status"],
      source: ((c.source as string) ?? "api") as "api" | "manual",
      adsets: (setsBy.get(c.id as string) ?? []).sort(byName).map((st) => ({
        id: st.id as string,
        external_id: st.external_id as string,
        name: st.name as string,
        active: st.effective_status === "ACTIVE",
        ads: (adsBy.get(st.id as string) ?? []).map((a) => ({ id: a.id as string, external_id: a.external_id as string, name: a.name as string, active: !!a.active })),
      })),
    })),
  }));
}

/**
 * Só os nomes da agência (para a prévia de filtros na tela do destino): mesma árvore de loadAgencyTree,
 * sem textos, imagens nem números. Uma chamada leve (função fire_names).
 */
export async function loadAgencyNames(db: SupabaseClient, agencyId: string) {
  const { data, error } = await db.rpc("fire_names", { p_agency: agencyId });
  if (error) throw new Error(error.message);
  const d = data as { accounts: Row[]; clients: Row[]; campaigns: unknown[][]; adsets: unknown[][]; ads: unknown[][] };
  return buildTree({
    accounts: d.accounts,
    clients: d.clients,
    campaigns: d.campaigns.map(([id, ad_account_id, external_id, name, status, source]) => ({ id, ad_account_id, external_id, name, status, source })),
    adsets: d.adsets.map(([id, campaign_id, external_id, name, effective_status]) => ({ id, campaign_id, external_id, name, effective_status })),
    ads: d.ads.map(([id, ad_set_id, external_id, name, active]) => ({ id, ad_set_id, external_id, name, active })),
  });
}
