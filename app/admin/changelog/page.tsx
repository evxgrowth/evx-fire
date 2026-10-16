import Markdown from "@/components/Markdown";
import { PageHeader } from "@/components/ui";
import { readDoc } from "@/lib/docs";

export const metadata = { title: "Changelog — EVX Fire" };

/** Super Admin: histórico técnico completo (docs/CHANGELOG.md), para auditoria. */
export default function ChangelogPage() {
  const source = readDoc("CHANGELOG.md").replace(/^# .*\n/, "");
  return (
    <>
      <PageHeader title="Changelog" subtitle="Histórico técnico de código, banco e configuração, para auditoria. Fonte: docs/CHANGELOG.md no repositório." />
      <article className="glass max-w-5xl p-6 md:p-8">
        <Markdown source={source} />
      </article>
    </>
  );
}
