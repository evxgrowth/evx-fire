import "server-only";
import { createHmac, randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lastDays } from "@/lib/repo";
import { buildAccountPayloads, loadAgencyTree, PAYLOAD_VERSION, type AgencyTree } from "./snapshot";

export interface Destination {
  id: string;
  agency_id: string;
  name: string;
  url: string;
  secret: string;
  filters: Record<string, unknown>;
  active: boolean;
}

export function sign(secret: string, timestamp: string, body: string) {
  return "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

function envelope(event: string, dest: Destination, agencyName: string, data: unknown) {
  const days = lastDays();
  return {
    event,
    version: PAYLOAD_VERSION,
    delivery_id: randomUUID(),
    sent_at: new Date().toISOString(),
    source: "evx-fire",
    destination: { id: dest.id, name: dest.name },
    agency: { id: dest.agency_id, name: agencyName },
    period: { since: days[0], until: days[days.length - 1], timezone: "America/Sao_Paulo" },
    data,
  };
}

const WAITS = [2000, 5000]; // novas tentativas (mesmo delivery_id, nova assinatura)

/** Envia UM pacote assinado. Em falha de rede ou erro 5xx tenta de novo com espera crescente. */
async function post(db: SupabaseClient, dest: Destination, event: string, payload: Record<string, unknown>, meta: { ad_account?: string; items?: number }) {
  const body = JSON.stringify(payload);
  let status: number | null = null;
  let error: string | null = null;
  const started = Date.now();

  for (let attempt = 0; attempt <= WAITS.length; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, WAITS[attempt - 1]));
    const ts = Math.floor(Date.now() / 1000).toString();
    try {
      const res = await fetch(dest.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "EVX-Fire-Webhook/1.0",
          "X-Fire-Event": event,
          "X-Fire-Delivery": String(payload.delivery_id),
          "X-Fire-Timestamp": ts,
          "X-Fire-Signature": sign(dest.secret, ts, body),
        },
        body,
        signal: AbortSignal.timeout(30000),
      });
      status = res.status;
      error = res.ok ? null : (await res.text().catch(() => "")).slice(0, 300) || `HTTP ${res.status}`;
      if (res.ok || res.status < 500) break;
    } catch (e) {
      error = e instanceof Error ? (e.name === "TimeoutError" ? "Tempo esgotado (30s) esperando resposta do CRM" : e.message) : String(e);
    }
  }

  const ok = status !== null && status >= 200 && status < 300;
  if (status === 401) error = `Assinatura recusada pelo CRM: confira se o segredo colado no CRM é o mesmo deste destino. ${error ?? ""}`.trim();
  await db.from("deliveries").insert({
    agency_id: dest.agency_id,
    destination_id: dest.id,
    event,
    ad_account: meta.ad_account ?? null,
    items: meta.items ?? 0,
    status,
    ok,
    duration_ms: Date.now() - started,
    error,
  });
  return { ok, status, error };
}

async function finish(db: SupabaseClient, dest: Destination, results: { ok: boolean; status: number | null; error: string | null }[]) {
  const failed = results.find((r) => !r.ok);
  await db
    .from("destinations")
    .update({ last_sent_at: new Date().toISOString(), last_status: failed?.status ?? results.at(-1)?.status ?? null, last_error: failed?.error ?? null })
    .eq("id", dest.id);
  // Mantém só 7 dias de histórico de entregas
  await db.from("deliveries").delete().eq("destination_id", dest.id).lt("created_at", new Date(Date.now() - 7 * 86400000).toISOString());
}

/** 404 = a integração não existe ou foi desligada no CRM: desliga o envio automático e deixa o aviso. */
async function stopIfGone(db: SupabaseClient, dest: Destination, results: { status: number | null }[]) {
  if (!results.some((r) => r.status === 404)) return;
  await db
    .from("destinations")
    .update({ active: false, last_error: "O CRM respondeu que esta integração não existe ou está desligada. O envio automático foi pausado: confira a URL do webhook e ligue de novo." })
    .eq("id", dest.id);
}

/** Teste de conexão: envia um "fire.ping". */
export async function sendPing(db: SupabaseClient, dest: Destination, agencyName: string) {
  const r = await post(db, dest, "fire.ping", envelope("fire.ping", dest, agencyName, { message: "Teste de conexão da EVX Fire. Se você recebeu isto, está tudo certo!" }), {});
  await finish(db, dest, [r]);
  await stopIfGone(db, dest, [r]);
  return r.status === 404 ? { ...r, error: "O CRM não encontrou esta integração (foi apagada ou desligada lá). Confira a URL do webhook." } : r;
}

/** Envia o retrato atual (uma chamada por conta de anúncio) para um destino. */
export async function sendSnapshot(db: SupabaseClient, dest: Destination, tree?: AgencyTree) {
  const data = tree ?? (await loadAgencyTree(db, dest.agency_id));
  const packs = buildAccountPayloads(data, dest.filters);
  const results = [];
  for (const p of packs) {
    const r = await post(db, dest, "fire.snapshot", envelope("fire.snapshot", dest, data.agencyName, p), { ad_account: p.ad_account.external_id, items: p.counts.campaigns });
    results.push(r);
    if (r.status === 404) break; // integração não existe mais no CRM: não adianta continuar
  }
  if (results.length) await finish(db, dest, results);
  await stopIfGone(db, dest, results);
  return { sent: results.length, failed: results.filter((r) => !r.ok).length };
}

/** Depois de cada sincronização: envia para todos os destinos ativos da agência. */
export async function dispatchAgency(db: SupabaseClient, agencyId: string) {
  const { data: dests } = await db.from("destinations").select("*").eq("agency_id", agencyId).eq("active", true).neq("url", "");
  if (!dests?.length) return [];
  const tree = await loadAgencyTree(db, agencyId);
  const out = [];
  for (const d of dests as Destination[]) out.push({ destination: d.id, ...(await sendSnapshot(db, d, tree)) });
  return out;
}
