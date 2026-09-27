import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

export interface Me {
  id: string;
  email: string;
  fullName: string;
  role: "super_admin" | "manager";
  agencyId: string | null;
  agencyName: string;
  agencyStatus: "active" | "trial" | "suspended";
}

/** Usuário logado + perfil. Retorna null se não houver sessão. */
export const getMe = cache(async (): Promise<Me | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: p } = await supabase
    .from("profiles")
    .select("full_name, email, role, agency_id, agencies(name, status)")
    .eq("id", user.id)
    .single();
  if (!p) return null;
  const agency = (Array.isArray(p.agencies) ? p.agencies[0] : p.agencies) as { name: string; status: Me["agencyStatus"] } | null;
  return {
    id: user.id,
    email: p.email || user.email || "",
    fullName: p.full_name,
    role: p.role,
    agencyId: p.agency_id,
    agencyName: agency?.name ?? "",
    agencyStatus: agency?.status ?? "active",
  };
});

export async function requireManager() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (!me.agencyId) redirect(me.role === "super_admin" ? "/admin" : "/login?erro=sem-agencia");
  if (me.agencyStatus === "suspended" && me.role !== "super_admin") redirect("/login?erro=suspenso");
  return me as Me & { agencyId: string };
}

export async function requireSuperAdmin() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "super_admin") redirect("/dashboard");
  return me;
}
