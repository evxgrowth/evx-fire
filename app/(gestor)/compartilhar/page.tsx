import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import CompartilharClient, { type LinkRow } from "./CompartilharClient";

export default async function CompartilharPage() {
  const me = await requireManager();
  const db = await createClient();
  const [{ data: links }, { data: clients }] = await Promise.all([
    db.from("share_links").select("id, token, client_id, label, show_revenue, show_creatives, active, views, created_at").eq("agency_id", me.agencyId).order("created_at", { ascending: false }),
    db.from("clients").select("id, name").eq("agency_id", me.agencyId).order("name"),
  ]);
  return (
    <>
      <PageHeader title="Links para clientes" subtitle="Crie um link de visualização para cada cliente acompanhar os resultados — sem login e sem acesso às suas contas." />
      <CompartilharClient links={(links ?? []) as LinkRow[]} clients={clients ?? []} />
    </>
  );
}
