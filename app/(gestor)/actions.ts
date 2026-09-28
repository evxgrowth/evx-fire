"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Todas as ações usam a sessão do gestor: o banco só deixa mexer nos dados da agência dele.

function refresh() {
  revalidatePath("/", "layout");
}

export async function createClientRecord(name: string, segment = "", notes = "") {
  const me = await requireManager();
  const db = await createClient();
  const { data, error } = await db.from("clients").insert({ agency_id: me.agencyId, name: name.trim(), segment: segment.trim(), notes: notes.trim() }).select("id").single();
  if (error) throw new Error(error.message);
  refresh();
  return data.id as string;
}

export async function updateClientRecord(id: string, name: string, segment: string, notes = "") {
  await requireManager();
  const db = await createClient();
  await db.from("clients").update({ name: name.trim(), segment: segment.trim(), notes: notes.trim() }).eq("id", id);
  refresh();
}

/** Vários clientes de uma vez (fila de cliques da tela). Sem recarregar tudo: a tela já mudou. */
export async function setClientsActive(changes: [string, boolean][]) {
  await requireManager();
  const db = await createClient();
  const on = changes.filter(([, v]) => v).map(([id]) => id);
  const off = changes.filter(([, v]) => !v).map(([id]) => id);
  if (on.length) {
    const { error } = await db.from("clients").update({ active: true }).in("id", on);
    if (error) throw new Error(error.message);
  }
  if (off.length) {
    const { error } = await db.from("clients").update({ active: false }).in("id", off);
    if (error) throw new Error(error.message);
  }
}

/** Ativa/desativa várias contas de anúncio de uma vez. Conta desativada não sincroniza nem aparece. */
export async function setAccountsEnabled(changes: [string, boolean][]) {
  await requireManager();
  const db = await createClient();
  for (const value of [true, false]) {
    const ids = changes.filter(([, v]) => v === value).map(([id]) => id);
    if (!ids.length) continue;
    const { error } = await db.from("ad_accounts").update({ sync_enabled: value }).in("id", ids);
    if (error) throw new Error(error.message);
  }
}

/** Desativar esconde o cliente e as campanhas dele dos painéis, links e destinos. */
export async function setClientActive(id: string, active: boolean) {
  await requireManager();
  const db = await createClient();
  await db.from("clients").update({ active }).eq("id", id);
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
  const { error } = await db.from("ad_accounts").update({ client_id: clientId }).eq("id", accountId);
  if (error) throw new Error(error.message);
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
