import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadAgencyTree } from "@/lib/fire/snapshot";
import { normalizeFilters, type NodeAccount } from "@/lib/fire/filters";
import { PageHeader } from "@/components/ui";
import DestinoEditor from "../[id]/DestinoEditor";

/** Novo destino: formulário em branco. Nada é gravado até o gestor clicar em Salvar. */
export default async function NovoDestinoPage() {
  const me = await requireManager();
  const db = await createClient();
  const { tree } = await loadAgencyTree(db, me.agencyId, { withDaily: false });
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
      <PageHeader title="Novo destino" subtitle="Preencha e clique em Salvar. Nada é criado antes disso." />
      <DestinoEditor
        isNew
        dest={{ id: "", name: "Meu CRM", url: "", active: true, secret: "", apiKeyPrefix: null, lastSentAt: null, lastStatus: null, lastError: null, filters: normalizeFilters({}) }}
        tree={light}
        deliveries={[]}
      />
    </>
  );
}
