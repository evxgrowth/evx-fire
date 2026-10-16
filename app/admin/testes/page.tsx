import Markdown from "@/components/Markdown";
import { CheckProgress } from "@/components/CheckItem";
import { PageHeader } from "@/components/ui";
import { readDoc } from "@/lib/docs";

export const metadata = { title: "Checklist de testes — EVX Fire" };

const PREFIX = "fire-checklist-v1";

/** Super Admin: checklist de testes manuais (docs/CHECKLIST-TESTES.md); a marcação fica salva no navegador. */
export default function TestesPage() {
  const source = readDoc("CHECKLIST-TESTES.md").replace(/^# .*\n/, "");
  const keys = [...source.matchAll(/^\s*- \[[ xX]\]\s+(.*)$/gm)].map((m) => m[1].trim());
  return (
    <>
      <PageHeader title="Checklist de testes" subtitle="O que conferir no sistema, com o resultado esperado. Fonte: docs/CHECKLIST-TESTES.md.">
        <CheckProgress prefix={PREFIX} keys={keys} />
      </PageHeader>
      <article className="glass max-w-5xl p-6 md:p-8">
        <Markdown source={source} checklistKey={PREFIX} />
      </article>
    </>
  );
}
