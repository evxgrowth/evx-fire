"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useData } from "./DataProvider";

/** Aviso exibido enquanto o gestor ainda não conectou nenhuma conta. */
export default function DemoBanner() {
  const { demo } = useData();
  if (!demo) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-fire-500/30 bg-fire-500/10 px-4 py-3 text-sm text-fire-200">
      <Sparkles size={18} className="shrink-0 text-fire-400" />
      <span className="flex-1">
        Você está vendo <b>dados de demonstração</b>. Conecte sua conta da Meta para ver suas campanhas reais.
      </span>
      <Link href="/integracoes" className="btn-fire !py-2 !text-xs">
        Conectar agora
      </Link>
    </div>
  );
}
