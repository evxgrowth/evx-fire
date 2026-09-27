import { redirect } from "next/navigation";
import { Flame } from "@/components/FlameLogo";
import { FadeIn } from "@/components/Motion";
import { createAdminClient } from "@/lib/supabase/server";
import SetupForm from "./SetupForm";

export const dynamic = "force-dynamic";

/** Configuração inicial: cria o Super Admin. Só funciona enquanto não existir nenhum. */
export default async function SetupPage() {
  const db = createAdminClient();
  const { count, error } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("role", "super_admin");

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="glass max-w-lg p-8">
          <h1 className="font-display text-xl font-bold text-white">Banco de dados ainda não preparado</h1>
          <p className="mt-2 text-sm text-ash-300">
            Rode o arquivo <code className="text-fire-300">supabase/schema.sql</code> no SQL Editor do Supabase e recarregue esta página.
          </p>
          <p className="mt-4 rounded-lg bg-black/40 p-3 font-mono text-xs text-ash-400">{error.message}</p>
        </div>
      </div>
    );
  }
  if (count) redirect("/login");

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <FadeIn className="glass neon-ring w-full max-w-md rounded-3xl p-8">
        <Flame size={56} />
        <h1 className="mt-4 font-display text-2xl font-bold text-white">Bem-vindo à EVX Fire</h1>
        <p className="mt-1 text-sm text-ash-400">Crie a conta do Super Admin. Esta tela aparece só uma vez.</p>
        <SetupForm />
      </FadeIn>
    </div>
  );
}
