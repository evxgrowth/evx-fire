import { NextResponse } from "next/server";
import { getMe } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { syncMeta } from "@/lib/meta/sync";
import { dispatchAgency } from "@/lib/fire/dispatch";

export const maxDuration = 300;

/** Botão "Sincronizar agora" do gestor: atualiza as contas da agência dele e envia aos destinos. */
export async function POST() {
  const me = await getMe();
  if (!me?.agencyId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createAdminClient();
  const results = await syncMeta(db, me.agencyId);
  const dispatched = await dispatchAgency(db, me.agencyId).catch(() => []);
  return NextResponse.json({ ok: results.every((r) => r.ok), results, dispatched });
}
