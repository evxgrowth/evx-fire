import LegalPage, { CONTACT_EMAIL } from "@/components/LegalPage";

export const metadata = { title: "Termos de Uso — EVX Fire" };

export default function Page() {
  return (
    <LegalPage title="Termos de Uso" updated="27 de setembro de 2026">
      <p>Ao usar a EVX Fire, você concorda com estes termos.</p>
      <h2>1. O serviço</h2>
      <p>
        A EVX Fire exibe, organiza e envia a outros sistemas os dados de campanhas de tráfego pago que o gestor autoriza, com acesso somente leitura às plataformas de anúncio. Os dados vêm da Meta e do
        Google e podem ter atrasos ou pequenas diferenças em relação às próprias plataformas.
      </p>
      <h2>2. Contas</h2>
      <p>
        O acesso é pessoal. O gestor é responsável por manter a senha em segurança e por ter autorização dos clientes para acessar e compartilhar os dados das contas de anúncio conectadas.
      </p>
      <h2>3. Uso adequado</h2>
      <p>É proibido usar a plataforma para fins ilegais, tentar acessar dados de outras agências ou violar as políticas da Meta e do Google.</p>
      <h2>4. Integrações e links</h2>
      <p>O gestor decide quais dados envia a outros sistemas e quais links compartilha, e é responsável por esses destinos.</p>
      <h2>5. Suspensão</h2>
      <p>Podemos suspender acessos em caso de uso indevido ou falta de pagamento.</p>
      <h2>6. Contato</h2>
      <p>
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-fire-300 underline">
          {CONTACT_EMAIL}
        </a>
      </p>
    </LegalPage>
  );
}
