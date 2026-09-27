import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { syncMeta } from "@/lib/meta/sync";

export const maxDuration = 300;

/** Sincronização automática de todas as agências (chamada pelo agendador). */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const results = await syncMeta(createAdminClient());
  return NextResponse.json({ ok: true, results });
}

export const POST = GET;
