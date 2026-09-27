import { NextResponse } from "next/server";
import { getMe } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { syncMeta } from "@/lib/meta/sync";

export const maxDuration = 300;

/** Botão "Sincronizar agora" do gestor: atualiza só as contas da agência dele. */
export async function POST() {
  const me = await getMe();
  if (!me?.agencyId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const results = await syncMeta(createAdminClient(), me.agencyId);
  return NextResponse.json({ ok: results.every((r) => r.ok), results });
}
