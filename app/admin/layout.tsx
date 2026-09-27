import AppShell from "@/components/AppShell";
import { requireSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireSuperAdmin();
  return (
    <AppShell mode="admin" user={{ name: me.fullName || me.email, role: "Super Admin", isSuperAdmin: true }}>
      {children}
    </AppShell>
  );
}
