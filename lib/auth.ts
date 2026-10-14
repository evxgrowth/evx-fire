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

interface AppClaims {
  agency_id: string | null;
  role: Me["role"];
  name: string | null;
  email: string | null;
  agency_name: string | null;
  agency_status: Me["agencyStatus"] | null;
}

/**
 * Usuário logado + perfil. Retorna null se não houver sessão.
 * O perfil vem DENTRO do token (gancho de login), validado localmente: nenhuma ida ao banco.
 */
export const getMe = cache(async (): Promise<Me | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as (Record<string, unknown> & { sub?: string; email?: string; app?: AppClaims }) | undefined;
  if (!claims?.sub) return null;
  const app = claims.app;
  if (app) {
    return {
      id: claims.sub,
      email: app.email || claims.email || "",
      fullName: app.name ?? "",
      role: app.role,
      agencyId: app.agency_id,
      agencyName: app.agency_name ?? "",
      agencyStatus: app.agency_status ?? "active",
    };
  }
  // Token antigo (emitido antes do gancho): consulta o perfil uma vez
  const user = { id: claims.sub, email: claims.email };
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
