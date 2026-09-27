"use server";

import { getMe } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Mescla as preferências novas com as já salvas do usuário logado. */
export async function savePrefs(patch: Record<string, unknown>) {
  const me = await getMe();
  if (!me) return;
  const db = await createClient();
  const { data } = await db.from("user_preferences").select("prefs").eq("user_id", me.id).maybeSingle();
  await db.from("user_preferences").upsert({ user_id: me.id, prefs: { ...(data?.prefs ?? {}), ...patch }, updated_at: new Date().toISOString() });
}
