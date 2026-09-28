import DashboardView from "@/components/DashboardView";
import { PageHeader } from "@/components/ui";
import { requireManager } from "@/lib/auth";

export default async function DashboardPage() {
  const me = await requireManager();
  const first = (me.fullName || me.email).split(/[\s@]/)[0];
  return (
    <>
      <PageHeader
        title={
          <>
            Olá, {first} <span className="inline-block origin-bottom animate-[flame-dance_1.2s_ease-in-out_infinite_alternate]">🔥</span>
          </>
        }
        subtitle="Aqui está o desempenho de todas as suas contas de anúncio."
      />
      <DashboardView campaignLinkBase="/campanhas" reportHref="/relatorio" />
    </>
  );
}
