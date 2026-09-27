import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { syncMeta } from "@/lib/meta/sync";
import { dispatchAgency } from "@/lib/fire/dispatch";

export const maxDuration = 300;

/** Sincronização automática de todas as agências + envio aos destinos (CRM). */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = createAdminClient();
  const results = await syncMeta(db);
  const dispatched = [];
  for (const agency of new Set(results.map((r) => r.agency))) {
    try {
      dispatched.push(...(await dispatchAgency(db, agency)));
    } catch (e) {
      dispatched.push({ agency, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ ok: results.every((r) => r.ok), results, dispatched });
}

export const POST = GET;
