// "Resultado" de uma campanha / conjunto / anúncio, como na coluna
// "Resultados" do Gerenciador de Anúncios: depende da meta de otimização.

export type Action = { action_type: string; value: string | number };

export interface Metrics {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  frequency?: number;
  actions?: Action[];
  action_values?: Action[];
}

export interface Result {
  type: string;
  label: string;
  value: number;
  cost_per_result: number | null;
}

const PURCHASE = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase", "onsite_web_purchase"];
const LEAD = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "onsite_web_lead"];
const MESSAGES = ["onsite_conversion.messaging_conversation_started_7d"];

const EVENT_TYPES: Record<string, { types: string[]; label: string }> = {
  PURCHASE: { types: PURCHASE, label: "Compras" },
  LEAD: { types: LEAD, label: "Leads" },
  COMPLETE_REGISTRATION: { types: ["complete_registration", "offsite_conversion.fb_pixel_complete_registration"], label: "Cadastros" },
  ADD_TO_CART: { types: ["add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"], label: "Adições ao carrinho" },
  INITIATED_CHECKOUT: { types: ["initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"], label: "Finalizações de compra iniciadas" },
  CONTACT: { types: ["contact_total", "offsite_conversion.fb_pixel_custom", "contact"], label: "Contatos" },
  SCHEDULE: { types: ["schedule_total", "schedule"], label: "Agendamentos" },
  SUBSCRIBE: { types: ["subscribe_total", "subscribe"], label: "Assinaturas" },
};

const GOALS: Record<string, { types?: string[]; metric?: "reach" | "impressions"; label: string }> = {
  LEAD_GENERATION: { types: LEAD, label: "Leads" },
  QUALITY_LEAD: { types: LEAD, label: "Leads" },
  LINK_CLICKS: { types: ["link_click"], label: "Cliques no link" },
  LANDING_PAGE_VIEWS: { types: ["landing_page_view"], label: "Visualizações da página de destino" },
  CONVERSATIONS: { types: MESSAGES, label: "Conversas por mensagem iniciadas" },
  REACH: { metric: "reach", label: "Alcance" },
  IMPRESSIONS: { metric: "impressions", label: "Impressões" },
  AD_RECALL_LIFT: { metric: "reach", label: "Alcance" },
  THRUPLAY: { types: ["video_view"], label: "Visualizações de vídeo" },
  TWO_SECOND_CONTINUOUS_VIDEO_VIEWS: { types: ["video_view"], label: "Visualizações de vídeo" },
  POST_ENGAGEMENT: { types: ["post_engagement"], label: "Engajamentos com a publicação" },
  PAGE_LIKES: { types: ["like"], label: "Curtidas na página" },
  APP_INSTALLS: { types: ["mobile_app_install", "app_install"], label: "Instalações do app" },
  PROFILE_VISIT: { types: ["link_click"], label: "Visitas ao perfil" },
};

export const GOAL_LABELS: Record<string, string> = {
  OFFSITE_CONVERSIONS: "Conversões no site",
  VALUE: "Valor das conversões",
  ...Object.fromEntries(Object.entries(GOALS).map(([k, v]) => [k, v.label])),
};

function sumTypes(list: Action[] | undefined, types: string[]) {
  if (!list) return 0;
  for (const t of types) {
    const hit = list.find((a) => a.action_type === t);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
}

/** Descobre qual ação conta como "resultado" para esta meta de otimização. */
export function resultSpec(goal?: string, promoted?: { custom_event_type?: string } | null): { types?: string[]; metric?: "reach" | "impressions"; label: string; type: string } {
  if (goal === "OFFSITE_CONVERSIONS" || goal === "VALUE") {
    const ev = promoted?.custom_event_type ?? "PURCHASE";
    const spec = EVENT_TYPES[ev] ?? EVENT_TYPES.PURCHASE;
    return { ...spec, type: spec.types[0] };
  }
  const g = goal ? GOALS[goal] : undefined;
  if (g) return { ...g, type: g.metric ?? g.types![0] };
  return { types: [...PURCHASE, ...LEAD], label: "Conversões", type: "conversions" };
}

export function computeResult(m: Metrics | undefined, goal?: string, promoted?: { custom_event_type?: string } | null): Result | null {
  if (!m) return null;
  const spec = resultSpec(goal, promoted);
  const value = spec.metric ? Number(m[spec.metric]) || 0 : sumTypes(m.actions, spec.types!);
  return { type: spec.type, label: spec.label, value, cost_per_result: value > 0 ? +(m.spend / value).toFixed(2) : null };
}

/** Receita (valor de compras) quando houver. */
export function revenueOf(m: Metrics | undefined) {
  return sumTypes(m?.action_values, PURCHASE);
}

/** Converte uma linha de insights da Meta no formato guardado no banco. */
export function metricsFromInsight(row: Record<string, unknown> | undefined): Metrics {
  return {
    spend: Number(row?.spend) || 0,
    impressions: Number(row?.impressions) || 0,
    reach: Number(row?.reach) || 0,
    clicks: Number(row?.clicks) || 0,
    frequency: Number(row?.frequency) || 0,
    actions: (row?.actions as Action[]) ?? [],
    action_values: (row?.action_values as Action[]) ?? [],
  };
}
