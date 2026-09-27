"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import CampaignForm from "@/components/manual/CampaignForm";
import { useData } from "@/components/DataProvider";
import { Panel, PageHeader } from "@/components/ui";
import { createManualCampaign } from "../manual-actions";

export default function NovaCampanhaPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { clients } = useData();
  const active = clients.filter((c) => c.active);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Link href="/campanhas" className="mb-4 inline-flex items-center gap-2 text-sm text-ash-400 hover:text-fire-300">
        <ArrowLeft size={16} /> Voltar para campanhas
      </Link>
      <PageHeader
        title="Nova campanha manual"
        subtitle="Para campanhas que rodam em contas não conectadas. Depois de criar, você lança os resultados, os públicos e os criativos."
      />
      <Panel className="max-w-3xl">
        {active.length ? (
          <CampaignForm
            clients={active}
            submitLabel="Criar campanha"
            initial={{
              clientId: params.get("cliente") ?? "",
              platform: "meta",
              name: "",
              objective: "Leads",
              status: "active",
              dailyBudget: 0,
              lifetimeBudget: 0,
              startDate: today,
              endDate: "",
              resultLabel: "Leads",
              notes: "",
            }}
            onSubmit={async (v) => {
              const r = await createManualCampaign(v);
              if (r.ok) router.push(`/campanhas/${r.id}`);
              return r;
            }}
          />
        ) : (
          <p className="text-sm text-ash-400">
            Cadastre um cliente primeiro em{" "}
            <Link href="/clientes" className="text-fire-300 underline">
              Clientes
            </Link>
            .
          </p>
        )}
      </Panel>
    </>
  );
}
