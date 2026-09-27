"use server";

import { createHash, randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { sendPing, sendSnapshot, type Destination } from "@/lib/fire/dispatch";
import { normalizeFilters, type DestFilters } from "@/lib/fire/filters";

const newSecret = () => "whsec_" + randomBytes(24).toString("hex");

/** Garante que o destino é da agência do gestor e devolve o registro completo. */
async function own(id: string) {
  const me = await requireManager();
  const db = await createClient();
  const { data } = await db.from("destinations").select("*").eq("id", id).eq("agency_id", me.agencyId).single();
  if (!data) throw new Error("Destino não encontrado");
  return { me, dest: data as Destination };
}

export async function createDestination() {
  const me = await requireManager();
  const db = await createClient();
  const { data, error } = await db
    .from("destinations")
    .insert({ agency_id: me.agencyId, name: "Meu CRM", secret: newSecret(), filters: normalizeFilters({}), active: false })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  redirect(`/destinos/${data.id}`);
}

export async function saveDestination(id: string, input: { name: string; url: string; active: boolean; filters: DestFilters }) {
  await own(id);
  const url = input.url.trim();
  if (url && !/^https:\/\//i.test(url)) return { ok: false as const, error: "O endereço precisa começar com https://" };
  const db = await createClient();
  const { error } = await db
    .from("destinations")
    .update({ name: input.name.trim() || "Meu CRM", url, active: input.active && !!url, filters: normalizeFilters(input.filters) })
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/destinos/${id}`);
  revalidatePath("/integracoes");
  return { ok: true as const };
}

export async function regenerateSecret(id: string) {
  await own(id);
  const secret = newSecret();
  const db = await createClient();
  await db.from("destinations").update({ secret }).eq("id", id);
  revalidatePath(`/destinos/${id}`);
  return secret;
}

/** Gera uma nova chave de API. Ela só é mostrada uma vez; guardamos apenas a impressão digital. */
export async function regenerateApiKey(id: string) {
  await own(id);
  const key = "fire_live_" + randomBytes(24).toString("hex");
  const db = await createClient();
  await db
    .from("destinations")
    .update({ api_key_hash: createHash("sha256").update(key).digest("hex"), api_key_prefix: key.slice(0, 14) })
    .eq("id", id);
  revalidatePath(`/destinos/${id}`);
  return key;
}

export async function deleteDestination(id: string) {
  await own(id);
  const db = await createClient();
  await db.from("destinations").delete().eq("id", id);
  revalidatePath("/integracoes");
  redirect("/integracoes");
}

export async function testDestination(id: string) {
  const { me, dest } = await own(id);
  if (!dest.url) return { ok: false, status: null, error: "Preencha e salve o endereço do webhook primeiro." };
  const r = await sendPing(createAdminClient(), dest, me.agencyName);
  revalidatePath(`/destinos/${id}`);
  return r;
}

export async function sendNow(id: string) {
  const { dest } = await own(id);
  if (!dest.url) return { sent: 0, failed: 0, error: "Preencha e salve o endereço do webhook primeiro." };
  const r = await sendSnapshot(createAdminClient(), dest);
  revalidatePath(`/destinos/${id}`);
  return { ...r, error: null };
}
