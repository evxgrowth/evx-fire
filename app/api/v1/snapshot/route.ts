import { createHash } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { buildAccountPayloads, loadAgencyTree, PAYLOAD_VERSION } from "@/lib/fire/snapshot";
import { lastDays } from "@/lib/repo";

export const maxDuration = 60;

/**
 * API de consulta (o CRM busca quando quiser).
 * GET /api/v1/snapshot            → todas as contas do destino
 * GET /api/v1/snapshot?ad_account=act_123 → só uma conta
 * Cabeçalho: Authorization: Bearer <chave de API do destino>
 */
export async function GET(req: NextRequest) {
  try {
    return await handle(req);
  } catch (e) {
    return NextResponse.json({ error: "internal_error", message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

async function handle(req: NextRequest) {
  const key = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!key) return NextResponse.json({ error: "missing_api_key" }, { status: 401 });

  const db = createAdminClient();
  const hash = createHash("sha256").update(key).digest("hex");
  const { data: dest } = await db.from("destinations").select("id, agency_id, name, filters, active, agencies(name, status)").eq("api_key_hash", hash).maybeSingle();
  const agency = (Array.isArray(dest?.agencies) ? dest?.agencies[0] : dest?.agencies) as { name: string; status: string } | null;
  if (!dest || !dest.active || agency?.status === "suspended") return NextResponse.json({ error: "invalid_api_key" }, { status: 401 });

  const tree = await loadAgencyTree(db, dest.agency_id);
  let accounts = buildAccountPayloads(tree, dest.filters);
  const only = req.nextUrl.searchParams.get("ad_account");
  if (only) accounts = accounts.filter((a) => a.ad_account.external_id === only || a.ad_account.id === only);

  const days = lastDays();
  return NextResponse.json({
    event: "fire.snapshot.bulk",
    version: PAYLOAD_VERSION,
    sent_at: new Date().toISOString(),
    source: "evx-fire",
    destination: { id: dest.id, name: dest.name },
    agency: { id: dest.agency_id, name: agency?.name ?? "" },
    period: { since: days[0], until: days[days.length - 1], timezone: "America/Sao_Paulo" },
    data: { accounts },
  });
}
