"use server";

import { getMe } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Mescla as preferências novas com as já salvas, numa única chamada ao banco. */
export async function savePrefs(patch: Record<string, unknown>) {
  const me = await getMe();
  if (!me) return;
  const db = await createClient();
  await db.rpc("prefs_merge", { p_patch: patch });
}
