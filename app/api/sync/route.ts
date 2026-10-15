import { NextResponse } from "next/server";
import { getMe } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { syncMeta } from "@/lib/meta/sync";
import { dispatchAgency } from "@/lib/fire/dispatch";
import { invalidateAgency } from "@/lib/repo";

export const maxDuration = 300;

/** Botão "Sincronizar agora": atualiza as contas da agência e envia ao CRM o que mudou. */
export async function POST() {
  const me = await getMe();
  if (!me?.agencyId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createAdminClient();
  const { results, blocked } = await syncMeta(db, me.agencyId, { manual: true });
  if (blocked.length) {
    const reason = blocked[0].reason;
    return NextResponse.json({ ok: false, reason, message: reason === "busy" ? "Já existe uma atualização em andamento." : "Atualizado há pouco. Tente de novo em alguns minutos." }, { status: 429 });
  }
  const changed = new Set(results.filter((r) => r.changed).map((r) => r.accountId));
  invalidateAgency(me.agencyId);
  await dispatchAgency(db, me.agencyId, { changed }).catch(() => []);
  return NextResponse.json({ ok: results.every((r) => r.ok), changed: changed.size });
}
