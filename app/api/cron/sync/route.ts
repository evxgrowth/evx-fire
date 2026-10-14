import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { syncMeta } from "@/lib/meta/sync";
import { dailyMaintenance, dispatchAgency } from "@/lib/fire/dispatch";

export const maxDuration = 300;

/**
 * Ciclo automático (pg_cron, a cada 30 min): sincroniza a Meta e envia ao CRM só o que mudou.
 * A resposta é mínima de propósito: o Supabase guarda a resposta de cada chamada do agendador.
 */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = createAdminClient();
  const { results } = await syncMeta(db);

  // Evento: contas que mudaram neste ciclo, por agência
  const changed = new Map<string, Set<string>>();
  for (const r of results) {
    if (!changed.has(r.agency)) changed.set(r.agency, new Set());
    if (r.changed) changed.get(r.agency)!.add(r.accountId);
  }
  // Agências com destino ativo também entram (envio diário de garantia, campanhas manuais)
  const { data: withDest } = await db.from("destinations").select("agency_id").eq("active", true).neq("url", "");
  for (const d of withDest ?? []) if (!changed.has(d.agency_id)) changed.set(d.agency_id, new Set());

  let failed = results.filter((r) => !r.ok).length;
  for (const [agency, set] of changed) {
    try {
      await dispatchAgency(db, agency, { changed: set });
    } catch {
      failed++;
    }
  }

  // Uma vez por dia, de madrugada (primeiro ciclo depois das 3h em São Paulo)
  const hourSP = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }).format(new Date()));
  if (hourSP === 3 && new Date().getMinutes() < 30) await dailyMaintenance(db);

  return NextResponse.json({ ok: failed === 0 });
}

export const POST = GET;
