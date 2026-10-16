import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { createAdminClient } from "./supabase/server";
import type { Packed } from "./packed";
import { normalizeView, type ResolvedView, type ViewData } from "./views";

const DAYS = 30;

function spToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
export function lastDays(n = DAYS) {
  const end = new Date(spToday() + "T12:00:00Z");
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - (n - 1 - i));
    return d.toISOString().slice(0, 10);
  });
}

/** Etiqueta do cache da agência: limpa quando algo muda (sincronização ou ação do gestor). */
export const agencyTag = (agencyId: string) => `agency:${agencyId}`;

/** Avisa que os dados da agência mudaram: a próxima tela aberta busca de novo (uma vez). */
export function invalidateAgency(agencyId: string) {
  revalidateTag(agencyTag(agencyId));
}

/** Links de cliente mudaram (link, cliente ativo/inativo ou agência suspensa): revalida os links em cache. */
export function invalidateShareLinks() {
  revalidateTag("share-links");
}

// ---------------- Telas em escala: base leve + visões prontas ----------------

export interface BaseData {
  has_accounts: boolean;
  last_sync: string | null;
  clients: Packed["clients"];
  /** muda sempre que os dados da agência mudam (o navegador usa para saber que precisa buscar de novo) */
  v: number;
}

/** Base do layout: só clientes, última sincronização e se há contas. Em cache até algo mudar. */
export function loadBase(agencyId: string, onlyClientId?: string): Promise<BaseData> {
  return unstable_cache(
    async () => {
      const { data, error } = await createAdminClient().rpc("gestor_base", { p_agency: agencyId, p_client: onlyClientId ?? null });
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Agência indisponível");
      return { ...(data as Omit<BaseData, "v">), v: Date.now() };
    },
    ["gestor-base-v1", agencyId, onlyClientId ?? ""],
    { tags: [agencyTag(agencyId)], revalidate: 3600 },
  )();
}

/**
 * Dados prontos de uma tela (função fire_view no banco), em cache por agência + pedido.
 * O pedido já vem com as datas resolvidas; filtros diferentes = entradas diferentes no cache.
 */
export async function loadView(agencyId: string, onlyClientId: string | null, req: ResolvedView): Promise<ViewData> {
  const raw = await unstable_cache(
    async () => {
      const { data, error } = await createAdminClient().rpc("fire_view", { p_agency: agencyId, p_client: onlyClientId, a: req });
      if (error) throw new Error(error.message);
      return data as unknown;
    },
    ["fire-view-v1", agencyId, onlyClientId ?? "", JSON.stringify(req)],
    { tags: [agencyTag(agencyId)], revalidate: 3600 },
  )();
  return normalizeView(req.view, raw);
}
