import LegalPage, { CONTACT_EMAIL } from "@/components/LegalPage";

export const metadata = { title: "Política de Privacidade — EVX Fire" };

export default function Page() {
  return (
    <LegalPage title="Política de Privacidade" updated="27 de setembro de 2026">
      <p>
        A EVX Fire (fire.evxgrowth.com.br), operada pela EVX Growth Studio, é uma plataforma de acompanhamento de campanhas de tráfego pago usada por gestores de tráfego e agências. Esta política
        explica quais dados tratamos, para quê e como pedir a exclusão, conforme a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).
      </p>
      <h2>1. Dados que coletamos</h2>
      <ul>
        <li>Dados de cadastro dos gestores: nome, e-mail, agência e senha (guardada de forma criptografada).</li>
        <li>
          Dados das contas de anúncio que o gestor autoriza na Meta (Facebook/Instagram) e, quando disponível, no Google Ads: nomes e identificadores de contas, campanhas, conjuntos e anúncios; status;
          orçamentos; segmentação de público configurada; criativos (imagens, vídeos, textos e links); e métricas agregadas de desempenho (gasto, impressões, alcance, cliques, conversões e receita).
        </li>
        <li>Dados inseridos manualmente pelo gestor (clientes, campanhas, resultados e criativos enviados).</li>
      </ul>
      <p>Não coletamos dados pessoais das pessoas que viram ou clicaram nos anúncios. As métricas recebidas das plataformas são sempre agregadas.</p>
      <h2>2. Como usamos os dados</h2>
      <ul>
        <li>Exibir painéis e relatórios de desempenho para o gestor e, quando ele cria um link de compartilhamento, para o cliente dele.</li>
        <li>Enviar esses dados aos sistemas que o próprio gestor configurar (por exemplo, o CRM dele), por webhook ou API.</li>
        <li>O acesso às plataformas de anúncio é somente leitura: a EVX Fire não cria, altera nem pausa campanhas.</li>
      </ul>
      <h2>3. Compartilhamento</h2>
      <p>
        Não vendemos dados. Eles ficam guardados em provedores de infraestrutura (Supabase e Vercel) e só são compartilhados com os destinos configurados pelo próprio gestor, ou quando a lei exigir.
      </p>
      <h2>4. Segurança</h2>
      <p>
        Os dados de cada agência ficam isolados. Os tokens de acesso às plataformas de anúncio ficam no servidor e nunca aparecem no navegador. Os envios a outros sistemas são assinados digitalmente.
      </p>
      <h2>5. Retenção e exclusão</h2>
      <p>
        Mantemos os dados enquanto a conta do gestor estiver ativa. O gestor pode desconectar as contas de anúncio a qualquer momento e pedir a exclusão de todos os dados. Veja as instruções em{" "}
        <a href="/exclusao-de-dados" className="text-fire-300 underline">
          Exclusão de dados
        </a>
        .
      </p>
      <h2>6. Seus direitos</h2>
      <p>Você pode pedir acesso, correção, portabilidade ou exclusão dos seus dados pelo e-mail abaixo.</p>
      <h2>7. Contato</h2>
      <p>
        EVX Growth Studio:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-fire-300 underline">
          {CONTACT_EMAIL}
        </a>
      </p>
    </LegalPage>
  );
}
