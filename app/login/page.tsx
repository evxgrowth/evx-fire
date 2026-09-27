import { redirect } from "next/navigation";
import { Flame } from "@/components/FlameLogo";
import { FadeIn } from "@/components/Motion";
import { getMe } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  suspenso: "Seu acesso está suspenso. Fale com o administrador da plataforma.",
  "sem-agencia": "Sua conta ainda não está vinculada a uma agência.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const me = await getMe();
  if (me) redirect(me.role === "super_admin" ? "/admin" : "/dashboard");

  // Primeira vez: ainda não existe Super Admin → vai para a configuração inicial
  const { count } = await createAdminClient().from("profiles").select("id", { count: "exact", head: true }).eq("role", "super_admin");
  if (!count) redirect("/setup");

  const { erro } = await searchParams;

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_40%_110%,rgba(255,92,0,.35),transparent_70%)]" />
        <div className="relative font-display text-sm font-semibold uppercase tracking-[0.3em] text-ash-400">EVX Growth Studio</div>
        <div className="relative">
          <FadeIn scale>
            <Flame size={140} />
          </FadeIn>
          <FadeIn delay={0.3}>
            <h1 className="mt-6 font-display text-6xl font-extrabold leading-[0.95] tracking-tight">
              <span className="text-white">EVX</span>
              <br />
              <span className="text-fire neon-text">FIRE</span>
            </h1>
          </FadeIn>
          <FadeIn delay={0.6}>
            <p className="mt-5 max-w-md text-lg text-ash-300">Meta Ads e Google Ads em um só painel. Resultados em tempo real, do investimento à venda.</p>
          </FadeIn>
        </div>
        <div className="relative flex gap-8 text-sm text-ash-400">
          <div>
            <div className="font-display text-2xl font-bold text-white">2</div>plataformas
          </div>
          <div>
            <div className="font-display text-2xl font-bold text-white">24/7</div>monitoramento
          </div>
          <div>
            <div className="font-display text-2xl font-bold text-white">1</div>link por cliente
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <FadeIn className="glass neon-ring w-full max-w-md rounded-3xl p-8">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Flame size={44} />
            <span className="font-display text-2xl font-extrabold">
              EVX <span className="text-fire">FIRE</span>
            </span>
          </div>
          <h2 className="font-display text-2xl font-bold text-white">Entrar</h2>
          <p className="mt-1 text-sm text-ash-400">Acesse o painel das suas campanhas.</p>
          <LoginForm notice={erro ? NOTICES[erro] : undefined} />
          <p className="mt-6 text-center text-xs text-ash-500">Ainda não tem acesso? Fale com a EVX Growth Studio.</p>
        </FadeIn>
      </div>
    </div>
  );
}
