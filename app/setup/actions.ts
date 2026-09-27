"use server";

import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export async function createSuperAdmin(_: string | null, form: FormData): Promise<string | null> {
  const db = createAdminClient();
  const { count } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("role", "super_admin");
  if (count) return "O Super Admin já foi criado. Use a tela de login.";

  const name = String(form.get("name") ?? "").trim();
  const agencyName = String(form.get("agency") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";

  const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
  if (error || !created.user) return `Não foi possível criar o usuário: ${error?.message}`;

  const { data: agency, error: e1 } = await db.from("agencies").insert({ name: agencyName, plan: "Agency" }).select("id").single();
  if (e1) return e1.message;
  const { error: e2 } = await db.from("profiles").insert({ id: created.user.id, agency_id: agency.id, full_name: name, email, role: "super_admin" });
  if (e2) return e2.message;

  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email, password });
  redirect("/admin");
}
