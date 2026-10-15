import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { createAdminClient } from "./supabase/server";
import { HISTORY_DAYS, unpack, type Packed } from "./packed";
import type { Campaign, Client } from "./types";

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

export interface AgencyData {
  campaigns: Campaign[];
  clients: Client[];
  lastSync: string | null;
  /** a agência tem alguma conta (conectada ou manual)? */
  hasAccounts: boolean;
}

/** Etiqueta do cache da agência: limpa quando algo muda (sincronização ou ação do gestor). */
export const agencyTag = (agencyId: string) => `agency:${agencyId}`;

/** Avisa que os dados da agência mudaram: a próxima tela aberta busca de novo (uma vez). */
export function invalidateAgency(agencyId: string) {
  revalidateTag(agencyTag(agencyId));
}

/**
 * Dados das telas da agência (ou só de um cliente, no link compartilhado), no formato compacto.
 * Uma chamada ao banco (função gestor_data), guardada em cache no servidor até algo mudar:
 * abrir e navegar pelas telas entre uma sincronização e outra não consulta o banco.
 * `agencyId` sempre vem do login verificado ou do link validado; nunca do navegador.
 */
export function loadPacked(agencyId: string, onlyClientId?: string): Promise<Packed> {
  const since = lastDays(HISTORY_DAYS)[0];
  return unstable_cache(
    async () => {
      const { data, error } = await createAdminClient().rpc("gestor_data", { p_agency: agencyId, p_client: onlyClientId ?? null, p_since: since });
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Agência indisponível");
      return data as Packed;
    },
    ["gestor-data-v1", agencyId, onlyClientId ?? "", since],
    { tags: [agencyTag(agencyId)], revalidate: 3600 },
  )();
}

/** Mesmos dados, já abertos nas listas que as telas usam (relatórios em PDF). */
export async function loadAgencyData(agencyId: string, onlyClientId?: string): Promise<AgencyData> {
  return unpack(await loadPacked(agencyId, onlyClientId));
}
