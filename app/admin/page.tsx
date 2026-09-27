import Link from "next/link";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { loadManagers } from "@/lib/admin";
import AdminOverview from "./AdminOverview";

export default async function AdminPage() {
  const managers = await loadManagers();
  return (
    <>
      <PageHeader title="Painel do Super Admin" subtitle="Visão de toda a plataforma: gestores, clientes e volume gerenciado.">
        <Link href="/admin/gestores" className="btn-fire">
          <Users size={16} /> Gerenciar gestores
        </Link>
      </PageHeader>
      <AdminOverview managers={managers} />
    </>
  );
}
