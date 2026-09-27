import { PageHeader } from "@/components/ui";
import { loadManagers } from "@/lib/admin";
import GestoresClient from "./GestoresClient";

export default async function GestoresPage() {
  const managers = await loadManagers();
  return (
    <>
      <PageHeader title="Gestores" subtitle="Cadastre, suspenda ou reative os gestores de tráfego que usam a plataforma." />
      <GestoresClient managers={managers} />
    </>
  );
}
