import Link from "next/link";
import FlameLogo from "./FlameLogo";

export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "contato@evxgrowth.com.br";

/** Moldura simples para as páginas legais (públicas). */
export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/login">
        <FlameLogo />
      </Link>
      <article className="glass mt-8 p-8 text-sm leading-relaxed text-ash-200 [&_h2]:mb-2 [&_h2]:mt-7 [&_h2]:font-display [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-white [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:space-y-1">
        <h1 className="font-display text-2xl font-bold text-white">{title}</h1>
        <p className="!mb-6 text-xs text-ash-500">Última atualização: {updated}</p>
        {children}
      </article>
      <nav className="mt-6 flex flex-wrap gap-4 text-xs text-ash-500">
        <Link href="/politica-de-privacidade" className="hover:text-fire-300">
          Política de Privacidade
        </Link>
        <Link href="/termos-de-uso" className="hover:text-fire-300">
          Termos de Uso
        </Link>
        <Link href="/exclusao-de-dados" className="hover:text-fire-300">
          Exclusão de dados
        </Link>
      </nav>
    </div>
  );
}
