// Regras que definem O QUE cada destino (CRM / webhook) recebe.
// Arquivo puro: usado na prévia da tela e no envio real.

import type { CampaignStatus, Source } from "@/lib/types";

export type Detail = "campaign" | "adset" | "ad";
export type Scope = "campaign" | "adset" | "ad";

export interface DestFilters {
  /** all = tudo | rules = por regras | manual = escolhidos um a um */
  mode: "all" | "rules" | "manual";
  /** contas de anúncio (ids internos). Vazio = todas */
  accounts: string[];
  /** clientes (ids internos). Vazio = todos */
  clients: string[];
  /** campanhas conectadas (api) e/ou manuais. Vazio = ambas */
  sources: Source[];
  /** status das campanhas. Vazio = todos */
  campaignStatuses: CampaignStatus[];
  /** status de conjuntos e anúncios. Vazio = todos */
  childStatuses: ("active" | "inactive")[];
  /** nome ou ID CONTÉM qualquer um destes termos */
  includeTerms: string[];
  /** nome ou ID NÃO pode conter nenhum destes termos */
  excludeTerms: string[];
  /** em qual nível os termos são procurados */
  termScope: Scope;
  /** seleção manual (ids internos). Campanha/conjunto marcado = inteiro, inclusive o que for criado depois */
  manual: { campaigns: string[]; adsets: string[]; ads: string[] };
  /** até que nível de detalhe enviar */
  detail: Detail;
}

export const defaultFilters: DestFilters = {
  mode: "all",
  accounts: [],
  clients: [],
  sources: [],
  campaignStatuses: [],
  childStatuses: [],
  includeTerms: [],
  excludeTerms: [],
  termScope: "campaign",
  manual: { campaigns: [], adsets: [], ads: [] },
  detail: "ad",
};

export function normalizeFilters(f: Partial<DestFilters> | null | undefined): DestFilters {
  return { ...defaultFilters, ...(f ?? {}), manual: { ...defaultFilters.manual, ...(f?.manual ?? {}) } };
}

// Estrutura mínima que o filtro precisa conhecer
export interface NodeAd {
  id: string;
  external_id: string;
  name: string;
  active: boolean;
}
export interface NodeAdSet {
  id: string;
  external_id: string;
  name: string;
  active: boolean;
  ads: NodeAd[];
}
export interface NodeCampaign {
  id: string;
  external_id: string;
  name: string;
  status: CampaignStatus;
  source?: Source;
  adsets: NodeAdSet[];
}
export interface NodeAccount {
  id: string;
  external_id: string;
  name: string;
  client_id?: string | null;
  campaigns: NodeCampaign[];
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function matches(node: { name: string; external_id: string }, terms: string[]) {
  const hay = norm(node.name) + " " + node.external_id;
  return terms.some((t) => t.trim() && hay.includes(norm(t.trim())));
}

function childOk(active: boolean, f: DestFilters) {
  if (!f.childStatuses.length || f.childStatuses.length === 2) return true;
  return f.childStatuses.includes(active ? "active" : "inactive");
}

/** Aplica as regras e devolve só o que deve ser enviado (mesma estrutura, podada). */
export function applyFilters<A extends NodeAccount>(accounts: A[], raw: Partial<DestFilters>): A[] {
  const f = normalizeFilters(raw);
  const out: A[] = [];

  for (const acc of accounts) {
    if (f.mode === "rules" && f.accounts.length && !f.accounts.includes(acc.id)) continue;
    if (f.mode === "rules" && f.clients.length && !(acc.client_id && f.clients.includes(acc.client_id))) continue;
    const campaigns: NodeCampaign[] = [];

    for (const c of acc.campaigns) {
      let kept: NodeCampaign | null = null;

      if (f.mode === "all") {
        kept = c;
      } else if (f.mode === "manual") {
        const m = f.manual;
        if (m.campaigns.includes(c.id)) kept = c;
        else {
          const sets = c.adsets
            .map((s) => (m.adsets.includes(s.id) ? s : { ...s, ads: s.ads.filter((a) => m.ads.includes(a.id)) }))
            .filter((s) => m.adsets.includes(s.id) || s.ads.length);
          if (sets.length) kept = { ...c, adsets: sets };
        }
      } else {
        if (f.campaignStatuses.length && !f.campaignStatuses.includes(c.status)) continue;
        if (f.sources.length && !f.sources.includes(c.source ?? "api")) continue;
        const inc = f.includeTerms.filter((t) => t.trim());
        const exc = f.excludeTerms.filter((t) => t.trim());

        const adsetsFiltered = c.adsets
          .filter((s) => childOk(s.active, f))
          .map((s) => ({ ...s, ads: s.ads.filter((a) => childOk(a.active, f)) }));

        if (f.termScope === "campaign") {
          if (inc.length && !matches(c, inc)) continue;
          if (exc.length && matches(c, exc)) continue;
          kept = { ...c, adsets: adsetsFiltered };
        } else if (f.termScope === "adset") {
          const sets = adsetsFiltered.filter((s) => (!inc.length || matches(s, inc)) && !(exc.length && matches(s, exc)));
          if (sets.length) kept = { ...c, adsets: sets };
        } else {
          const sets = adsetsFiltered
            .map((s) => ({ ...s, ads: s.ads.filter((a) => (!inc.length || matches(a, inc)) && !(exc.length && matches(a, exc))) }))
            .filter((s) => s.ads.length);
          if (sets.length) kept = { ...c, adsets: sets };
        }
      }

      if (!kept) continue;
      if (f.detail === "campaign") kept = { ...kept, adsets: [] };
      else if (f.detail === "adset") kept = { ...kept, adsets: kept.adsets.map((s) => ({ ...s, ads: [] })) };
      campaigns.push(kept);
    }

    if (campaigns.length) out.push({ ...acc, campaigns });
  }
  return out;
}

export function countTree(accounts: NodeAccount[]) {
  let campaigns = 0,
    adsets = 0,
    ads = 0;
  for (const a of accounts)
    for (const c of a.campaigns) {
      campaigns++;
      for (const s of c.adsets) {
        adsets++;
        ads += s.ads.length;
      }
    }
  return { campaigns, adsets, ads };
}
