import LegalPage, { CONTACT_EMAIL } from "@/components/LegalPage";

export const metadata = { title: "Exclusão de dados — EVX Fire" };

export default function Page() {
  return (
    <LegalPage title="Instruções para exclusão de dados" updated="27 de setembro de 2026">
      <p>Você pode remover o acesso da EVX Fire e excluir seus dados a qualquer momento.</p>
      <h2>1. Remover o acesso na Meta (Facebook)</h2>
      <ul>
        <li>No Facebook, abra Configurações e privacidade → Configurações → Integrações comerciais.</li>
        <li>Encontre o app da EVX Fire e clique em Remover.</li>
      </ul>
      <h2>2. Excluir os dados guardados</h2>
      <p>
        Envie um e-mail para{" "}
        <a href={`mailto:${CONTACT_EMAIL}?subject=Exclus%C3%A3o%20de%20dados%20EVX%20Fire`} className="text-fire-300 underline">
          {CONTACT_EMAIL}
        </a>{" "}
        com o assunto &quot;Exclusão de dados EVX Fire&quot; e o e-mail de acesso. Excluímos a conta, os tokens de acesso e todos os dados de campanhas em até 30 dias e confirmamos por e-mail.
      </p>
    </LegalPage>
  );
}
