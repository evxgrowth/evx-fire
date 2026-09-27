import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadAgencyTree } from "@/lib/fire/snapshot";
import { normalizeFilters, type NodeAccount } from "@/lib/fire/filters";
import { PageHeader } from "@/components/ui";
import DestinoEditor, { type DeliveryRow } from "./DestinoEditor";

export default async function DestinoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireManager();
  const db = await createClient();
  const { data: dest } = await db.from("destinations").select("*").eq("id", id).eq("agency_id", me.agencyId).maybeSingle();
  if (!dest) notFound();

  const [{ tree }, { data: deliveries }] = await Promise.all([
    loadAgencyTree(db, me.agencyId),
    db.from("deliveries").select("id, event, ad_account, items, status, ok, duration_ms, error, created_at").eq("destination_id", id).order("created_at", { ascending: false }).limit(25),
  ]);

  // Só o necessário para a prévia (nomes, status e ids)
  const light: (NodeAccount & { client: string | null })[] = tree.map((a) => ({
    id: a.id,
    external_id: a.external_id,
    name: a.name,
    client_id: a.client_id ?? null,
    client: a.client?.name ?? null,
    campaigns: a.campaigns,
  }));

  return (
    <>
      <Link href="/integracoes" className="mb-4 inline-flex items-center gap-2 text-sm text-ash-400 hover:text-fire-300">
        <ArrowLeft size={16} /> Voltar para Integrações
      </Link>
      <PageHeader title={dest.name} subtitle="Destino de dados: escolha o que será enviado para o seu CRM (ou outro sistema) e como." />
      <DestinoEditor
        dest={{
          id: dest.id,
          name: dest.name,
          url: dest.url,
          active: dest.active,
          secret: dest.secret,
          apiKeyPrefix: dest.api_key_prefix,
          lastSentAt: dest.last_sent_at,
          lastStatus: dest.last_status,
          lastError: dest.last_error,
          filters: normalizeFilters(dest.filters),
        }}
        tree={light}
        deliveries={(deliveries ?? []) as DeliveryRow[]}
      />
    </>
  );
}
