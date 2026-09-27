"use server";

import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export async function signIn(_: string | null, form: FormData): Promise<string | null> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return "Preencha e-mail e senha.";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return "E-mail ou senha incorretos.";

  const { data: p } = await supabase.from("profiles").select("role, agencies(status)").eq("id", data.user.id).single();
  const agency = (Array.isArray(p?.agencies) ? p?.agencies[0] : p?.agencies) as { status: string } | null;
  if (p?.role !== "super_admin" && agency?.status === "suspended") {
    await supabase.auth.signOut();
    return "Seu acesso está suspenso. Fale com o administrador da plataforma.";
  }
  await createAdminClient().from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", data.user.id);
  redirect(p?.role === "super_admin" ? "/admin" : "/dashboard");
}
