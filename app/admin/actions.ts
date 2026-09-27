"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

export type CreateResult = { ok: true; email: string; password: string } | { ok: false; error: string } | null;

/** Cadastra um gestor: cria a agência, o login e devolve uma senha provisória. */
export async function createManager(_: CreateResult, form: FormData): Promise<CreateResult> {
  await requireSuperAdmin();
  const db = createAdminClient();
  const name = String(form.get("name") ?? "").trim();
  const agencyName = String(form.get("agency") ?? "").trim() || name;
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const plan = String(form.get("plan") ?? "Pro");
  if (!name || !email) return { ok: false, error: "Preencha nome e e-mail." };

  const password = "Fire-" + randomBytes(5).toString("hex");
  const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
  if (error || !created.user) return { ok: false, error: error?.message.includes("already") ? "Já existe um usuário com este e-mail." : (error?.message ?? "Erro") };

  const { data: agency, error: e1 } = await db.from("agencies").insert({ name: agencyName, plan, status: "active" }).select("id").single();
  if (e1) return { ok: false, error: e1.message };
  const { error: e2 } = await db.from("profiles").insert({ id: created.user.id, agency_id: agency.id, full_name: name, email, role: "manager" });
  if (e2) return { ok: false, error: e2.message };

  revalidatePath("/admin", "layout");
  return { ok: true, email, password };
}

/** Suspende ou reativa uma agência inteira. */
export async function toggleAgency(agencyId: string) {
  await requireSuperAdmin();
  const db = createAdminClient();
  const { data } = await db.from("agencies").select("status").eq("id", agencyId).single();
  await db.from("agencies").update({ status: data?.status === "suspended" ? "active" : "suspended" }).eq("id", agencyId);
  revalidatePath("/admin", "layout");
}

export async function changePlan(agencyId: string, plan: string) {
  await requireSuperAdmin();
  await createAdminClient().from("agencies").update({ plan }).eq("id", agencyId);
  revalidatePath("/admin", "layout");
}
