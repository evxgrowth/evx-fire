# Checklist de testes do EVX Fire

Marque cada item conforme testar (a marcação fica salva neste navegador).
Tudo abaixo já passou nos testes automáticos; este checklist é a conferência humana, com o seu olho de usuário.
Em cada item: **o que fazer** → *o que deve acontecer*.

## 1. Entrar e sair

- [ ] Entrar com seu e-mail e senha → *abre o Painel com "Olá, seu nome"*.
- [ ] Recarregar a página (F5) → *continua logado, sem voltar ao login*.
- [ ] Sair pelo botão do canto inferior esquerdo → *volta ao login; ao abrir /dashboard de novo, pede login*.
- [ ] Abrir o site numa aba anônima em /dashboard → *vai para o login*.

## 2. Painel (Dashboard)

- [ ] Abrir o Painel → *números aparecem em até 2 segundos (na primeira vez pode aparecer um esqueleto cinza rapidamente)*.
- [ ] Conferir Investimento, Vendas/Leads, Cliques e CTR de "Este mês" com o Gerenciador de Anúncios da Meta → *valores iguais ou muito próximos (a Meta pode ter até 30 min de diferença)*.
- [ ] Trocar o período para Hoje, Ontem, Esta semana, Últimos 7, 14, 30, 60 e 90 dias → *números e gráfico mudam a cada troca; a tela não pisca nem recarrega inteira*.
- [ ] Ver as setas "vs anterior" em "Este mês" e "Últimos 7 dias" → *aparecem com a porcentagem*.
- [ ] Ver "Últimos 60" e "90 dias" → *as setas "vs anterior" não aparecem (o período anterior passa do histórico carregado; comportamento de antes)*.
- [ ] Clicar em Meta / Google / Todas → *números mudam conforme a plataforma*.
- [ ] Abrir o filtro (funil) e escolher um cliente → *só os números desse cliente*.
- [ ] Filtro por status (Ativa, Em análise, Pausada, Encerrada) → *números mudam*.
- [ ] Filtro "Conectadas" / "Manuais" → *números mudam*.
- [ ] "Contém" com um pedaço do nome de uma campanha, em "Qualquer nível" → *só as campanhas com esse nome*.
- [ ] O mesmo termo com acento e sem acento (ex.: "saúde" e "saude") → *mesmo resultado*.
- [ ] "Não contém" com um termo → *as campanhas com esse termo somem*.
- [ ] Trocar o nível do termo para Campanha, Conjunto e Anúncio → *o resultado muda conforme o nível*.
- [ ] Limpar filtros → *volta tudo*.
- [ ] Sair e entrar de novo → *período e filtros continuam como você deixou*.
- [ ] Tabela "Campanhas" do painel → *mostra até 50, ordenadas por investimento; se houver mais, aparece "Mostrando as 50 de maior investimento, de N" com o link "Ver todas em Campanhas"*.
- [ ] Clicar na seta de uma campanha → *abre o detalhe dela*.
- [ ] "Criativos com melhor resultado" → *4 cartões com imagem*.

## 3. Campanhas

- [ ] Abrir Campanhas → *título "N campanha(s)" e a lista, ordenada por investimento no período*.
- [ ] Clicar em "Mostrar mais" → *mais 50 linhas aparecem embaixo; o botão mostra quantas faltam*.
- [ ] Buscar por nome de campanha → *a lista filtra depois de você parar de digitar*.
- [ ] Buscar por nome de conjunto e por nome de anúncio → *aparece a campanha que contém esse conjunto ou anúncio*.
- [ ] Trocar o período aqui → *o mesmo período passa a valer no Painel e em Criativos*.
- [ ] Filtros desta página (cliente, status etc.) → *funcionam e ficam salvos só para esta página*.

## 4. Detalhe da campanha

- [ ] Abrir uma campanha conectada → *nome, cliente, objetivo, orçamento, números de 90 dias, gráficos, conjuntos com público e os criativos*.
- [ ] Voltar para campanhas → *volta para a lista*.

## 5. Campanha manual

- [ ] Criar uma campanha manual para um cliente → *aparece na lista com o selo "Manual"*.
- [ ] Editar nome e orçamento → *salva e a lista mostra o novo nome*.
- [ ] Lançar resultados de um dia, de uma semana e de um mês → *os números aparecem no detalhe e no Painel (pode levar alguns segundos)*.
- [ ] Criar um conjunto com público → *aparece no detalhe*.
- [ ] Criar anúncios com imagem, com carrossel e com vídeo (upload) → *aparecem no detalhe e em Criativos*.
- [ ] Apagar um lançamento, um anúncio, um conjunto → *pede confirmação e some*.
- [ ] Apagar a campanha manual → *pede confirmação e some de todas as telas*.
- [ ] No CRM, confirmar que a campanha manual chegou → *chega em poucos segundos depois de salvar*.

## 6. Criativos

- [ ] Abrir Criativos → *cartões com imagem, ordenados por resultado; imagens carregam conforme você rola*.
- [ ] "Mostrar mais" → *mais 40 cartões*.
- [ ] Filtro "Rodando" / "Parados" (dentro do funil) → *mostra só os escolhidos*.
- [ ] Buscar por nome de anúncio, por título ou pelo nome da campanha → *filtra*.

## 7. Clientes

- [ ] Abrir Clientes → *cartões com conta Meta, Google, campanhas ativas, investido, resultados e ROAS do mês*.
- [ ] Criar um cliente novo → *aparece na lista*.
- [ ] Editar nome, segmento e observações → *salva*.
- [ ] Desativar um cliente → *ele some da lista ativa (fica em "Clientes inativos"), e as campanhas dele somem do Painel, de Campanhas e de Criativos*.
- [ ] Clicar rápido em ativar/desativar vários clientes → *todos ficam como você clicou, sem perder nenhum clique*.
- [ ] Reativar o cliente → *volta, com as campanhas*.
- [ ] Filtros "Com conta conectada" / "Com campanhas manuais" e a busca → *funcionam*.

## 8. Integrações & API

- [ ] Abrir Integrações → *mostra a conexão com a Meta, as contas e os destinos*.
- [ ] Desligar uma conta de anúncio → *ela para de aparecer no Painel; ligar de novo → volta*.
- [ ] Vincular uma conta a outro cliente → *os números passam a aparecer nesse cliente*.
- [ ] (Opcional) Reconectar a Meta → *volta para Integrações com a mensagem de sucesso e as contas atualizadas*.

## 9. Sincronização

- [ ] Clicar no botão de sincronizar (canto superior direito) → *mensagem "Dados atualizados" ou "Tudo em dia"*.
- [ ] Clicar de novo em seguida → *mensagem dizendo para aguardar alguns minutos (proteção contra cliques repetidos)*.
- [ ] Ver o "atualizado há X min" no topo → *não passa de ~30 minutos*.

## 10. Destinos (envio ao CRM)

- [ ] Abrir o destino "[CRM EVX] STYLO" → *abre com nome, URL, filtros, prévia e histórico de envios*.
- [ ] Mudar os filtros (tudo / regras / manual) → *a prévia mostra o que seria enviado*.
- [ ] Clicar em "Testar" → *mostra o resultado do teste*.
- [ ] Clicar em "Enviar agora" → *envia e aparece no histórico como OK*.
- [ ] No CRM, conferir que as campanhas, conjuntos, anúncios e números chegaram como antes → *iguais (o pacote não mudou)*.
- [ ] "Novo destino" → *abre em branco; nada é criado até clicar em Salvar*.
- [ ] Salvar o novo destino e depois apagá-lo → *cria e apaga com confirmação*.

## 11. Links para clientes

- [ ] Criar um link para um cliente → *aparece na lista*.
- [ ] Abrir o link numa aba anônima → *painel só daquele cliente, sem menu, sem login*.
- [ ] Trocar o período dentro do link → *números mudam*.
- [ ] Desligar "mostrar receita" no link e recarregar o link → *receita e ROAS não aparecem*.
- [ ] Desligar "mostrar criativos" e recarregar → *a seção de criativos some*.
- [ ] Desativar o link e recarregar → *mostra "Link desativado"*.
- [ ] Reativar → *volta a funcionar*.
- [ ] "Relatório PDF" dentro do link → *abre o relatório só daquele cliente*.

## 12. Relatório PDF (gestor)

- [ ] No Painel, aplicar filtros e clicar em "Relatório PDF" → *abre o relatório com o mesmo período e filtros*.
- [ ] Editar o título e as observações clicando neles → *edita*.
- [ ] "Salvar como PDF" → *gera o PDF com gráficos, tabela (até 22 campanhas) e criativos*.

## 13. Super Admin

- [ ] Abrir o Super Admin → *Visão geral com agências e investimento*.
- [ ] Gestores: cadastrar, suspender e reativar um gestor de teste → *o gestor suspenso não consegue entrar, e o link dos clientes dele mostra "Link desativado"*.
- [ ] Saúde do sistema → *"Tudo funcionando", agendador rodou há menos de 30 min, contas e destino verdes*.
- [ ] Changelog → *abre o histórico técnico completo*.

## 14. Celular

- [ ] Abrir o Painel no celular → *menu recolhido, cartões em uma coluna, sem rolagem lateral*.
- [ ] Campanhas e Criativos no celular → *a tabela rola para o lado dentro do quadro; os cartões ficam em uma coluna*.
- [ ] Link do cliente no celular → *legível e sem cortar números*.

## 15. Depois de 24 horas

- [ ] Saúde do sistema → *todos os ciclos das últimas horas com HTTP 200 e "ok":true*.
- [ ] Uso do Supabase (painel do Supabase → Usage) → *egress, egress REST e log ingestion bem abaixo do que estava antes da otimização*.
- [ ] CRM → *recebeu os envios ao longo do dia, sem erros no histórico do destino*.
