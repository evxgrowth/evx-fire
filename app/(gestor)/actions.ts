"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Todas as ações usam a sessão do gestor: o banco só deixa mexer nos dados da agência dele.

function refresh() {
  revalidatePath("/", "layout");
}

export async function createClientRecord(name: string, segment = "") {
  const me = await requireManager();
  const db = await createClient();
  const { data, error } = await db.from("clients").insert({ agency_id: me.agencyId, name: name.trim(), segment: segment.trim() }).select("id").single();
  if (error) throw new Error(error.message);
  refresh();
  return data.id as string;
}

export async function updateClientRecord(id: string, name: string, segment: string) {
  await requireManager();
  const db = await createClient();
  await db.from("clients").update({ name: name.trim(), segment: segment.trim() }).eq("id", id);
  refresh();
}

export async function deleteClientRecord(id: string) {
  await requireManager();
  const db = await createClient();
  await db.from("clients").delete().eq("id", id);
  refresh();
}

export async function assignAccount(accountId: string, clientId: string | null) {
  await requireManager();
  const db = await createClient();
  await db.from("ad_accounts").update({ client_id: clientId }).eq("id", accountId);
  refresh();
}

export async function setAccountSync(accountId: string, enabled: boolean) {
  await requireManager();
  const db = await createClient();
  await db.from("ad_accounts").update({ sync_enabled: enabled }).eq("id", accountId);
  refresh();
}

export async function createShareLink(clientId: string, showRevenue: boolean, showCreatives: boolean) {
  const me = await requireManager();
  const db = await createClient();
  const { data: client } = await db.from("clients").select("name").eq("id", clientId).single();
  if (!client) throw new Error("Cliente não encontrado");
  const slug = client.name
    .normalize("NFD")
    .replace(/[^\w\s]/g, "")
    .trim()
    .split(/\s+/)[0]
    .toLowerCase()
    .slice(0, 10);
  const token = `${slug || "painel"}-${randomBytes(6).toString("base64url")}`;
  await db.from("share_links").insert({
    agency_id: me.agencyId,
    client_id: clientId,
    token,
    label: `Painel — ${client.name}`,
    show_revenue: showRevenue,
    show_creatives: showCreatives,
  });
  revalidatePath("/compartilhar");
}

export async function updateShareLink(id: string, patch: { active?: boolean; show_revenue?: boolean; show_creatives?: boolean }) {
  await requireManager();
  const db = await createClient();
  await db.from("share_links").update(patch).eq("id", id);
  revalidatePath("/compartilhar");
}

export async function deleteShareLink(id: string) {
  await requireManager();
  const db = await createClient();
  await db.from("share_links").delete().eq("id", id);
  revalidatePath("/compartilhar");
}
