import { requireManager } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import IntegracoesClient, { type AccountRow } from "./IntegracoesClient";

export default async function IntegracoesPage({ searchParams }: { searchParams: Promise<{ meta?: string; msg?: string; contas?: string }> }) {
  const me = await requireManager();
  const db = await createClient();
  const sp = await searchParams;

  const [{ data: accounts }, { data: clients }, { data: destinations }] = await Promise.all([
    db.from("ad_accounts").select("id, platform, external_id, name, client_id, sync_enabled, last_synced_at, last_error, account_status").eq("agency_id", me.agencyId).order("name"),
    db.from("clients").select("id, name").eq("agency_id", me.agencyId).eq("active", true).order("name"),
    db.from("destinations").select("id, name, url, active, last_sent_at, last_error").eq("agency_id", me.agencyId).order("created_at"),
  ]);

  // Os tokens nunca vão para o navegador: aqui lemos só nome e validade da conexão.
  const { data: conns } = await createAdminClient()
    .from("platform_connections")
    .select("platform, external_user_name, token_expires_at")
    .eq("agency_id", me.agencyId);

  const metaConn = conns?.find((c) => c.platform === "meta") ?? null;

  let flash: { tone: "good" | "bad" | "warn"; text: string } | null = null;
  if (sp.meta === "ok") flash = { tone: "good", text: `Meta conectada! ${sp.contas ?? ""} conta(s) de anúncio encontradas e sincronizadas.` };
  if (sp.meta === "cancelado") flash = { tone: "warn", text: "Conexão com a Meta cancelada." };
  if (sp.meta === "erro") flash = { tone: "bad", text: `Não foi possível conectar com a Meta: ${sp.msg ?? "erro desconhecido"}` };

  return (
    <>
      <PageHeader title="Integrações & API" subtitle="Conecte suas contas de anúncio e envie os dados para outros sistemas." />
      <IntegracoesClient
        flash={flash}
        meta={metaConn ? { user: metaConn.external_user_name, expiresAt: metaConn.token_expires_at } : null}
        accounts={(accounts ?? []) as AccountRow[]}
        clients={clients ?? []}
        destinations={destinations ?? []}
      />
    </>
  );
}
