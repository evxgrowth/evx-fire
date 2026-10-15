import "server-only";
import { createHash, createHmac, randomUUID } from "crypto";
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

function envelope(event: string, dest: Destination, agencyName: string, data: unknown, range?: { since: string; until: string }) {
  const d30 = lastDays(30);
  const d90 = lastDays(90);
  return {
    event,
    version: PAYLOAD_VERSION,
    delivery_id: randomUUID(),
    sent_at: new Date().toISOString(),
    source: "evx-fire",
    destination: { id: dest.id, name: dest.name },
    agency: { id: dest.agency_id, name: agencyName },
    // since/until = período de metrics.daily; last_30d = período de metrics.last_30d
    period: {
      since: range?.since ?? d90[0],
      until: range?.until ?? d90[d90.length - 1],
      timezone: "America/Sao_Paulo",
      last_30d: { since: d30[0], until: d30[d30.length - 1] },
    },
    data,
  };
}

const WAITS = [2000, 5000]; // novas tentativas (mesmo delivery_id, nova assinatura)

/** Envia UM pacote assinado. Em falha de rede ou erro 5xx tenta de novo com espera crescente. */
async function post(
  db: SupabaseClient,
  dest: Destination,
  event: string,
  payload: Record<string, unknown>,
  meta: { ad_account?: string; items?: number; state?: { account: string; hash: string } },
) {
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
      if (e instanceof Error && e.name === "TimeoutError") {
        // O CRM pode estar processando: repetir só aumentaria a carga dos dois lados.
        // O pacote volta na próxima rodada (não foi marcado como entregue).
        error = "O CRM demorou mais de 30s para responder. Ele deve responder na hora e processar em segundo plano.";
        break;
      }
      error = e instanceof Error ? e.message : String(e);
    }
  }

  const ok = status !== null && status >= 200 && status < 300;
  if (status === 401) error = `Assinatura recusada pelo CRM: confira se o segredo colado no CRM é o mesmo deste destino. ${error ?? ""}`.trim();
  // Uma chamada: registra o envio e, se deu certo, marca a conta como "já enviada" com a impressão digital
  await db.rpc("record_delivery", {
    p: {
      agency_id: dest.agency_id,
      destination_id: dest.id,
      event,
      ad_account: meta.ad_account ?? null,
      items: meta.items ?? 0,
      status,
      ok,
      duration_ms: Date.now() - started,
      error,
      ...(meta.state ? { state_account: meta.state.account, hash: meta.state.hash } : {}),
    },
  });
  return { ok, status, error };
}

/**
 * Atualiza o destino uma vez no fim (último envio, status, erro).
 * 404 = a integração não existe ou foi desligada no CRM: pausa o envio automático e deixa o aviso.
 */
async function finish(db: SupabaseClient, dest: Destination, results: { ok: boolean; status: number | null; error: string | null }[]) {
  if (!results.length) return;
  const failed = results.find((r) => !r.ok);
  const gone = results.some((r) => r.status === 404);
  await db
    .from("destinations")
    .update({
      last_sent_at: new Date().toISOString(),
      last_status: failed?.status ?? results.at(-1)?.status ?? null,
      last_error: gone
        ? "O CRM respondeu que esta integração não existe ou está desligada. O envio automático foi pausado: confira a URL do webhook e ligue de novo."
        : (failed?.error ?? null),
      ...(gone ? { active: false } : {}),
    })
    .eq("id", dest.id);
}

/** Teste de conexão: envia um "fire.ping". */
export async function sendPing(db: SupabaseClient, dest: Destination, agencyName: string) {
  const r = await post(db, dest, "fire.ping", envelope("fire.ping", dest, agencyName, { message: "Teste de conexão da EVX Fire. Se você recebeu isto, está tudo certo!" }), {});
  await finish(db, dest, [r]);
  return r.status === 404 ? { ...r, error: "O CRM não encontrou esta integração (foi apagada ou desligada lá). Confira a URL do webhook." } : r;
}

/**
 * Envia o retrato atual (uma chamada por conta de anúncio) para um destino.
 * Para não sobrecarregar o CRM, pula a conta cujo pacote não mudou desde o último envio com sucesso
 * (mesmo assim reenvia pelo menos 1x por dia). `force` (Enviar agora) envia tudo.
 */
export async function sendSnapshot(
  db: SupabaseClient,
  dest: Destination,
  tree?: AgencyTree,
  opts: { force?: boolean; accounts?: Set<string>; states?: Map<string, { hash: string; sent_at: string }> } = {},
) {
  const data = tree ?? (await loadAgencyTree(db, dest.agency_id));
  const packs = buildAccountPayloads(data, dest.filters).filter((p) => !opts.accounts || opts.accounts.has(p.ad_account.id));
  let stateBy = opts.states;
  if (!stateBy) {
    const { data: states } = await db.from("destination_state").select("ad_account_id, hash, sent_at").eq("destination_id", dest.id);
    stateBy = new Map((states ?? []).map((s) => [s.ad_account_id as string, s]));
  }
  const results = [];
  let skipped = 0;
  for (const p of packs) {
    const hash = createHash("sha256").update(JSON.stringify(p)).digest("hex");
    const prev = stateBy.get(p.ad_account.id);
    const fresh = prev && Date.now() - Date.parse(prev.sent_at) < 24 * 3.6e6;
    if (!opts.force && prev?.hash === hash && fresh) {
      skipped++;
      continue;
    }
    const r = await post(db, dest, "fire.snapshot", envelope("fire.snapshot", dest, data.agencyName, p, data.range), {
      ad_account: p.ad_account.external_id,
      items: p.counts.campaigns,
      state: { account: p.ad_account.id, hash },
    });
    results.push(r);
    if (r.status === 404) break; // integração não existe mais no CRM: não adianta continuar
  }
  await finish(db, dest, results);
  return { sent: results.length, failed: results.filter((r) => !r.ok).length, skipped };
}

const DAY = 24 * 3.6e6;

/**
 * Depois de cada sincronização: envia aos destinos ativos da agência SÓ as contas que mudaram
 * (evento vindo da sincronização) ou que estão há mais de 24h sem envio para aquele destino.
 * Contas sem mudança nem são lidas do banco.
 */
export async function dispatchAgency(db: SupabaseClient, agencyId: string, opts: { changed?: Set<string> } = {}) {
  // Uma chamada: destinos ativos, contas que podem ser enviadas e o que já foi enviado
  const { data: plan, error } = await db.rpc("dispatch_plan", { p_agency: agencyId });
  if (error) throw new Error(error.message);
  const { dests, sendable, states } = plan as {
    dests: (Destination & { last_sent_at: string | null })[];
    sendable: string[];
    states: { destination_id: string; ad_account_id: string; sent_at: string; hash: string }[];
  };
  if (!dests.length) return [];
  // Nada mudou e todos os destinos receberam algo nas últimas 23h → para aqui
  const recent = (d: { last_sent_at: string | null }) => !!d.last_sent_at && Date.now() - Date.parse(d.last_sent_at) < DAY - 3.6e6;
  if (!opts.changed?.size && dests.every(recent)) return [];
  const sentAt = new Map(states.map((s) => [`${s.destination_id}:${s.ad_account_id}`, Date.parse(s.sent_at)]));

  const need = new Map<string, Set<string>>();
  for (const d of dests as Destination[]) {
    const ids = sendable.filter((acc) => opts.changed?.has(acc) || !(Date.now() - (sentAt.get(`${d.id}:${acc}`) ?? 0) < DAY));
    if (ids.length) need.set(d.id, new Set(ids));
  }
  if (!need.size) return [];

  const union = [...new Set([...need.values()].flatMap((s) => [...s]))];
  const tree = await loadAgencyTree(db, agencyId, { onlyAccounts: union });
  const out = [];
  for (const d of dests as Destination[]) {
    const accounts = need.get(d.id);
    const mine = new Map(states.filter((st) => st.destination_id === d.id).map((st) => [st.ad_account_id, st]));
    if (accounts) out.push({ destination: d.id, ...(await sendSnapshot(db, d, tree, { accounts, states: mine })) });
  }
  return out;
}

/** Limpeza diária (chamada pelo ciclo da madrugada): histórico de envios com mais de 7 dias. */
export async function dailyMaintenance(db: SupabaseClient) {
  await db.from("deliveries").delete().lt("created_at", new Date(Date.now() - 7 * DAY).toISOString());
}
