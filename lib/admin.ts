import "server-only";
import { createAdminClient } from "./supabase/server";
import type { Manager } from "./types";

function lastSeen(iso: string | null) {
  if (!iso) return "nunca acessou";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `há ${Math.max(1, m)} min`;
  if (m < 1440) return `há ${Math.round(m / 60)} h`;
  const d = Math.round(m / 1440);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

/** Lista de agências/gestores para o Super Admin. */
export async function loadManagers(): Promise<Manager[]> {
  const db = createAdminClient();
  const [{ data: agencies }, { data: profiles }, { data: clients }, { data: spend }] = await Promise.all([
    db.from("agencies").select("id, name, plan, status, created_at").order("created_at"),
    db.from("profiles").select("id, agency_id, full_name, email, role, last_seen_at"),
    db.from("clients").select("agency_id"),
    db.from("agency_spend_30d").select("agency_id, spend"),
  ]);

  return (agencies ?? []).map((a) => {
    const people = (profiles ?? []).filter((p) => p.agency_id === a.id);
    const main = people.find((p) => p.role === "manager") ?? people[0];
    const seen = people.map((p) => p.last_seen_at).filter(Boolean).sort().at(-1) ?? null;
    return {
      id: a.id,
      name: main?.full_name || main?.email || "—",
      agency: a.name,
      email: main?.email ?? "",
      plan: a.plan,
      status: a.status,
      clients: (clients ?? []).filter((c) => c.agency_id === a.id).length,
      spendManaged: Number((spend ?? []).find((s) => s.agency_id === a.id)?.spend ?? 0),
      lastSeen: lastSeen(seen),
      isOwner: people.some((p) => p.role === "super_admin"),
    };
  });
}
