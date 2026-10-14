# EVX Fire — Plano de otimização (banco, integrações e telas)

> **Objetivo:** reduzir em **90% ou mais** o consumo do Supabase (egress, egress REST, log ingestion, CPU e escritas) e as chamadas à Meta e ao CRM, mantendo a experiência imediata.
>
> **Meta de capacidade:** **20 clientes com 2.000 campanhas ativas** (e ~8.000 inativas), usando **menos da metade** do plano atual do Supabase.
>
> **Status:** PLANO em 5 fases. Nada foi alterado ainda. Cada fase começa só com aprovação.

---

## 1. Diagnóstico atual (medido em 14/10/2026)

### 1.1 Volume de dados hoje

| Tabela | Linhas | Peso médio por linha (`select *`) |
|---|---|---|
| campaigns | 467 | ~700 B |
| ad_sets | 540 | ~1,6 KB (segmentação completa) |
| creatives | 700 | — |
| campaign_daily | 726 | — |
| deliveries (log de envios) | 326 | — |
| destinations | **9** (8 vazios: "Meu CRM" sem URL) | — |

Contas sincronizando: **2 de 23**.

**Conclusão:** o volume de dados ainda é pequeno. A sobrecarga de agora vem do **número de requisições** e de **trabalho repetido**, não do tamanho das tabelas. Com 2.000 campanhas ativas, o desenho atual não escalaria: alguns custos crescem em proporção direta ao número de campanhas a cada página aberta.

### 1.2 Onde está o excesso (análise rotina por rotina)

| # | Rotina | O que acontece hoje | Por que pesa |
|---|---|---|---|
| E1 | **Middleware** (toda requisição) | `supabase.auth.getUser()`: uma chamada de rede ao Auth em **toda** requisição, inclusive pré-carregamento de links e chamadas internas do Next | Uma chamada a mais ao Auth e uma linha de log por clique ou pré-carga |
| E2 | **getMe** (toda página) | Outra chamada ao `auth.getUser()` + consulta a `profiles` com join em `agencies` | Duplica a E1 e consulta o perfil sempre |
| E3 | **Layout do gestor** | `loadAgencyData`: carrega **todas** as campanhas, 90 dias de métricas diárias, todos os conjuntos e todos os criativos da agência, além de `count: exact` e das preferências. Aproximadamente **10 a 14 requisições** por renderização | Com 2.000 campanhas ativas: cerca de 180 mil linhas diárias e 8 mil criativos (**dezenas de MB de egress por página**) |
| E4 | **Recarregamentos globais** | 5 × `revalidatePath("/", "layout")` e 9 × `router.refresh()`, após ações, sincronizações e cliques em fila | Cada um refaz toda a E3 |
| E5 | **Filtragem no navegador** | Filtros, períodos, busca e totais são calculados no navegador sobre a base inteira | Obriga a mandar a base inteira para o navegador (E3) |
| E6 | **Sincronização (a cada 30 min)** | Modo leve: regrava **todas** as campanhas visíveis mesmo sem mudança. Modo completo: regrava campanhas, conjuntos e criativos inteiros (JSON de segmentação e métricas) e lê os criativos existentes. Atualiza `account_status` e `last_synced_at` sempre | Escritas, WAL, I/O e logs mesmo quando nada mudou |
| E7 | **Envio ao CRM** | `loadAgencyTree` faz `select *` de campanhas, conjuntos, criativos e 90 dias de métricas de **todas** as contas, e só depois compara o hash para decidir se envia | Lê o banco inteiro a cada 30 minutos, mesmo quando nada mudou |
| E8 | **API pública `/api/v1/snapshot`** | Cada "Sincronizar agora" do CRM recarrega tudo do banco, sem cache e sem limite de frequência | O CRM pode gerar picos |
| E9 | **Agendadores** | pg_cron a cada 30 min **mais** o cron diário da Vercel. O pg_net guarda a resposta de cada chamada (`net._http_response`) e o pg_cron guarda o histórico (`cron.job_run_details`) | Tabelas internas crescendo e log extra |
| E10 | **Sincronizações simultâneas** | Nada impede o botão "Sincronizar" e o agendador de rodarem ao mesmo tempo para a mesma agência | Trabalho e chamadas à Meta em dobro |
| E11 | **Preferências** | `select` + `upsert` a cada alteração de filtro (800 ms) | Duas requisições por mudança |
| E12 | **RLS** | As regras de segurança chamam `my_agency_id()` / `is_super_admin()` **por linha** | CPU do Postgres cresce com o tamanho das listas |
| E13 | **Destinos fantasmas** | "Novo destino" grava no banco a cada clique, antes de preencher | 8 linhas lixo, que entram nas consultas de envio |
| E14 | **Logs de envio** | Insert por envio + delete de limpeza **a cada** envio | Duas escritas por pacote |
| E15 | **Chamadas à Meta** | Conta com campanha ativa faz a coleta completa a cada 30 min (8 a 9 chamadas, com paginação), mesmo sem gasto novo | Consome a cota da Meta e escreve no banco |

### 1.3 De onde vem cada custo no Supabase

- **Egress / Egress REST:** bytes que saem do banco pela API. Vêm principalmente da E3, E7 e E8.
- **Log ingestion:** cada requisição à API REST ou ao Auth gera log. Vem da E1, E2, das muitas requisições pequenas (paginação e consultas em lotes) e da E6.
- **CPU / IO do banco:** E6 (regravações), E12 (RLS por linha) e upserts com JSON grande.
- **Auth:** E1 e E2.
- **Realtime:** não é usado. Será confirmado que nenhuma tabela está publicada.

---

## 2. Metas mensuráveis (orçamento por operação)

| Operação | Hoje | Meta |
|---|---|---|
| Abrir ou navegar no painel | ~12 requisições, base inteira (cresce com campanhas) | **≤ 2 requisições** e **≤ 40 KB**, independente de quantas campanhas |
| Trocar filtro ou período | 0 req (mas exige a base inteira no navegador) | **1 requisição** com cache e **≤ 30 KB** |
| Verificar login | 2 chamadas ao Auth + 1 consulta | **0 chamadas de rede** (validação local do token) |
| Ciclo de 30 min, conta **sem** mudança | 2 a 9 chamadas à Meta + regravação | **1 chamada** à Meta + **0 escritas** |
| Ciclo de 30 min, conta **com** mudança | Dezenas de requisições ao banco | **1 chamada RPC** de escrita, só das linhas alteradas |
| Envio ao CRM, conta sem mudança | Lê tudo do banco | **0 leituras** |
| "Sincronizar agora" do CRM (API) | Lê tudo, sem limite | Cache por versão (**304 / 0 leituras** se nada mudou) e limite de frequência |

**Regra de verificação:** cada fase só termina quando os números medidos atingirem a meta.

---

## 3. Princípios (válidos em todas as fases)

1. **Um único agendador.** A Meta não avisa quando as métricas mudam, então a consulta periódica é inevitável. Fica **só o pg_cron**, que vira o gatilho de uma fila. O resto é **orientado a eventos**: sincronização que mudou dados → invalida o cache e dispara o envio ao CRM.
2. **O banco agrega; o navegador recebe pronto.** Nada de mandar dados brutos para filtrar na tela.
3. **Gravar só o que mudou.** Hash por linha e `ON CONFLICT … WHERE hash mudou`.
4. **Uma requisição gorda em vez de vinte magras.** RPCs (funções no Postgres) para leitura e escrita em lote.
5. **Cache com invalidação por evento**, sem atualização por tempo fixo. O TTL é só uma rede de segurança.
6. **Selecionar só as colunas exibidas.** `select *` fica proibido nas rotas quentes.
7. **O contrato com o CRM (v1) não muda.** Comparação automática do pacote antigo com o novo.

---

## 4. Fases

> **5 fases.** Todas as mudanças no Supabase (SQL, índices, regras de segurança, configurações de login) são feitas **por mim, automaticamente**, pela API de gerenciamento do Supabase. Você não clica em nada no painel.
> Ao fim de **cada** fase rodo a validação de regressões da Fase 5 (parte A) antes de publicar.

### FASE 1 — Medir e estancar o sangramento

#### Parte A — Linha de base e laboratório de carga (sem mudar comportamento)

**Objetivo:** medir antes de mexer e criar um cenário de 2.000 campanhas para validar todas as fases.

1. **Coleta no Supabase** (executada por mim):
   - `pg_stat_statements`: top 20 por tempo total, chamadas e linhas retornadas.
   - Tamanho de tabelas e índices; índices nunca usados (`pg_stat_user_indexes`).
   - Tamanho de `cron.job_run_details` e `net._http_response`.
   - `pg_publication_tables`: confirmar que o Realtime não publica nenhuma tabela.
   - Prints de **Usage** (egress, egress REST, Auth, log ingestion, CPU) dos últimos 7 dias.
2. **Instrumentação temporária** (ligada só por variável de ambiente):
   - um contador que registra, por rota, quantas requisições foram ao Supabase, quantos bytes voltaram e quantas chamadas foram à Meta;
   - uma linha de resumo por página ou ciclo, nos logs da Vercel.
3. **Agência sintética de carga** ("LAB — não usar"), isolada por RLS:
   - 20 clientes, 2.000 campanhas ativas e 8.000 inativas, 4.000 conjuntos e 10.000 anúncios;
   - 13 meses de métricas diárias para as ativas (cerca de 790 mil linhas);
   - script de criar e apagar, com tudo removido ao final do projeto.
4. **Relatório de linha de base:** a tabela da seção 2 preenchida com os números reais, nos dados atuais e no laboratório.

#### Parte B — Correções rápidas, de baixo risco

1. **Autenticação sem rede (E1, E2)**
   - Ativar as **chaves JWT assimétricas** do Supabase (*JWT Signing Keys*; eu ativo pela API) e trocar `getUser()` por `getClaims()`, que valida o token localmente.
   - **Auth Hook** (*custom access token*) colocando `agency_id`, `role` e `agency_status` dentro do token. Resultado: zero consultas de perfil por página.
   - O middleware só renova a sessão quando o token está perto de expirar e deixa de rodar em rotas públicas, API pública, pré-carregamentos e arquivos.
   - **Ações críticas** (suspensão, troca de agência) continuam conferindo no banco, para não depender de um token desatualizado por até 1 hora.
2. **Um agendador só (E9):** remover o cron da Vercel. A resposta do `/api/cron/sync` passa a ser mínima (`{"ok":true}`), para o pg_net não guardar JSON grande. Limpeza de `cron.job_run_details` e `net._http_response` passa a acontecer **dentro** do próprio ciclo, uma vez por dia (sem criar outra rotina).
3. **Trava de sincronização (E10):** um *lease* por agência (tabela `sync_locks` ou *advisory lock*). O botão "Sincronizar agora" passa a ter espera mínima de 5 minutos e mostra "já sincronizando" em vez de iniciar outra.
4. **Parar escritas inúteis (E6):**
   - `account_status`, `last_synced_at` e `last_error` só são gravados quando o valor muda;
   - o modo leve só grava campanhas cujo status, nome ou orçamento mudaram (comparação com o que já está no banco).
5. **Preferências (E11):** uma RPC `prefs_merge(jsonb)` (1 requisição) e espera de 1,5 s.
6. **Destinos fantasmas (E13):** "Novo destino" abre o formulário em branco e só grava ao **Salvar**. Os 8 destinos vazios são removidos com o seu ok.
7. **Logs de envio (E14):** limpeza em lote uma vez por dia, dentro do ciclo, em vez de a cada envio.
8. **Remover `count: exact`** do layout e do login (usar `limit 1`).

**Pronto quando:** tivermos os números "antes", o laboratório reproduzir a carga-alvo e as correções da Parte B estiverem no ar.
**Ganho esperado:** −60% a −70% de requisições ao Auth e à API REST; log ingestion despencando. Esta fase sozinha já deve resolver a sobrecarga atual.
**Risco:** baixo.

---

### FASE 2 — Banco de dados: RLS, índices, hashes e RPCs

1. **RLS performático (E12)**
   - Políticas reescritas com `(select …)`, para o Postgres calcular uma vez por consulta e não uma vez por linha.
   - Usar `auth.jwt() ->> 'agency_id'` (vindo do Auth Hook), dispensando a consulta a `profiles` em cada verificação.
2. **Índices sob medida para as consultas reais**
   - `campaign_daily (agency_id, date) INCLUDE (campaign_id, spend, impressions, clicks, conversions, revenue)`, para o painel agregar lendo só o índice.
   - `campaigns (agency_id, status)`, `campaigns (ad_account_id)`, `creatives (campaign_id)`, `ad_sets (campaign_id)`.
   - **pg_trgm + unaccent** em `campaigns.name`, `ad_sets.name` e `creatives.name`, para a busca "contém @STY" sem varrer a tabela.
   - Remover índices sem uso (medidos na Fase 1).
3. **Hash por linha:** coluna `row_hash` em campaigns, ad_sets, creatives e campaign_daily. Upsert com `ON CONFLICT … DO UPDATE … WHERE row_hash IS DISTINCT FROM excluded.row_hash`, ou seja, **linha igual não é regravada**.
4. **RPC de escrita em lote:** `sync_apply_account(account_id, payload jsonb)` grava campanhas, conjuntos, anúncios e diário **numa transação e numa requisição**, e devolve quantas linhas mudaram.
5. **Versão por conta:** `ad_accounts.data_version`, incrementada pela RPC **só quando algo mudou**. É o "evento" usado pelo cache (Fase 3) e pelos envios (Fase 5).
6. **RPCs de leitura agregada** (calculadas no Postgres, no fuso de São Paulo):
   - `dashboard_data(since, until, filtros)`: indicadores, comparação com o período anterior, série diária, divisão por plataforma, top campanhas e top criativos (com limite);
   - `list_campaigns(filtros, busca, ordem, cursor)`: paginada (50 por vez), com totais do período;
   - `list_creatives(filtros, cursor)`: paginada (24 por vez);
   - `clients_summary(since, until)`;
   - `campaign_detail(id, since, until)`.
   - **Os filtros devem ter a mesma semântica de hoje:** contém / não contém, nível (qualquer, campanha, conjunto ou anúncio), sem diferenciar acentos nem maiúsculas, status, conectadas ou manuais, plataforma e clientes.
7. **JSON enxuto:**
   - `metrics_30d` guarda só as ações relevantes (compras, leads, cliques no link, conversas, etc.) e não a lista inteira da Meta;
   - `targeting` bruto fica só em `ad_sets` e **nunca** entra em listagens.
8. **Manutenção:** `fillfactor` 90 nas tabelas que recebem update frequente (campaigns, campaign_daily) e conferência do autovacuum.

**Ganho esperado:** CPU e IO do banco −80% ou mais; leitura de dados viável para 2.000 campanhas ativas.
**Risco:** médio, porque mexe em segurança (RLS). Mitigação: testes de isolamento entre agências (Fase 5).

---

### FASE 3 — Telas leves: o servidor agrega, o navegador recebe pouco

1. **O layout para de carregar a base inteira (E3).** Ele busca só o cabeçalho (nome, última sincronização, preferências), em 1 requisição.
2. **Cada página chama a sua RPC da Fase 2:**
   - Painel → `dashboard_data` (1 requisição);
   - Campanhas → `list_campaigns`, com "carregar mais" e busca no servidor (espera de 300 ms);
   - Criativos → `list_creatives`, com rolagem infinita e imagens carregando só quando aparecem;
   - Clientes → `clients_summary`;
   - Detalhe da campanha → `campaign_detail`.
3. **Cache no servidor com etiqueta (tag) por agência e por filtro.** Invalidado **por evento**: fim de sincronização com `data_version` alterada e ações do gestor (renomear cliente, desativar conta, lançamento manual). Entre uma sincronização e outra, abrir o painel 100 vezes custa **0 leituras** no banco.
4. **Troca de filtro ou período sem recarregar a página:** a chamada é feita direto ao endpoint cacheado. O período continua compartilhado entre as páginas e os filtros continuam salvos (comportamento atual).
5. **Fim dos recarregamentos globais (E4):** `revalidatePath("/", "layout")` e `router.refresh()` trocados por invalidação da etiqueta afetada + atualização otimista local (que já existe nas filas de ativar e desativar).
6. **Link do cliente e relatório PDF** usam as mesmas RPCs e o mesmo cache (chave = link + filtros).
7. **Super Admin:** resumo por agência via view agregada, com cache.
8. **Pré-carregamento de links:** controlado (`prefetch={false}` nos itens pesados) para não gerar renderizações que ninguém vê.

**Ganho esperado:** egress por página de dezenas de MB (na carga-alvo) para **≤ 40 KB** (−99%); requisições por página de ~12 para **1 a 2**.
**Risco:** médio-alto, porque reescreve a forma como as telas recebem dados. Mitigação: testes ponta a ponta de cada tela (Fase 5) e implantação por *feature flag*, tela por tela.

---

### FASE 4 — Meta e CRM orientados a eventos

#### Parte A — Sincronização com a Meta orientada a mudanças

1. **Ritmos separados:**

   | O quê | Quando |
   |---|---|
   | Métricas de hoje e ontem | A cada 30 min, **só** contas com campanha ativa ou gasto nas últimas 24h |
   | Estrutura (campanhas, conjuntos, anúncios, criativos) | A cada 6h, **ou** na hora se a verificação barata detectar mudança |
   | Últimos 90 dias (ajuste de atribuição da Meta) | 1x por dia, de madrugada |
   | 13 meses de histórico | 1x por conta, na conexão |

2. **Verificação barata antes da coleta pesada:** uma chamada leve (gasto e impressões de hoje no nível da conta, mais a lista de campanhas com `updated_time` e status). Se nada mudou desde o último ciclo, **não faz mais nada**.
3. **Busca só do que mudou:** conjuntos e anúncios apenas das campanhas com `updated_time` posterior à última coleta. A viabilidade do filtro por `updated_time` em cada objeto da Meta será validada na prática; se não houver, entra a alternativa por contagem e status.
4. **Menos chamadas à Meta:**
   - API de lote (50 consultas por chamada) e `fields` mínimos;
   - relatórios **assíncronos** de insights para contas grandes (2.000 campanhas × 90 dias), em vez de paginação síncrona;
   - leitura dos cabeçalhos de uso da Meta (`x-business-use-case-usage`, `x-fb-ads-insights-throttle`) para **desacelerar sozinho** antes do bloqueio.
5. **Fila de trabalho (`sync_jobs`):**
   - o pg_cron só enfileira;
   - cada execução na Vercel processa as contas até ~60 a 90 s e, se sobrar trabalho, **encadeia** a próxima execução (evento, não um novo cron);
   - prioridade para contas com campanha ativa;
   - paralelismo de 4.
6. **Uma escrita por conta**, usando a RPC `sync_apply_account` com hash da Fase 2.
7. **Token inválido ou expirado** (erro 190): pausa a conta e avisa o gestor, em vez de tentar de novo a cada 30 min.
8. **(Avaliar) Webhooks da Meta** para mudanças de status e reprovação de anúncios, quando o app sair do modo desenvolvedor. As métricas continuam por consulta, porque a Meta não envia métricas por webhook.

#### Parte B — Envios ao CRM e API pública orientados a eventos

1. **Só envia conta cuja `data_version` mudou** desde o último envio daquele destino (`destination_state.version`). As contas sem mudança **não são lidas do banco**.
2. **Pacote montado lendo só a conta alterada**, com colunas selecionadas (sem `select *`).
3. **Envio pelo menos 1x por dia** (mantido), para o CRM nunca ficar desatualizado.
4. **Compressão gzip do corpo**, de ~1,5 MB para ~150 KB. Precisa de **ajuste combinado com o CRM**; eu escrevo o texto para o Lovable. Só liga depois que o CRM confirmar suporte.
5. **API `/api/v1/snapshot`:**
   - cache por (destino, conta, versão, intervalo) e `ETag` / `If-None-Match` → **304 sem tocar no banco** quando nada mudou;
   - limite de frequência por chave (ex.: 30 por minuto).
6. **(Opcional, v2 do contrato) Pacote "delta"** só com as campanhas alteradas. Só se o CRM aceitar; até lá, o v1 completo continua.
7. Histórico de envios sem o corpo do pacote (já é assim), com limpeza diária.

**Ganho esperado:** chamadas à Meta −80% a −90%; escritas da sincronização −90% ou mais; leituras do banco para envio −95% ou mais; tráfego para o CRM −90% (com gzip).
**Risco:** médio. Mitigação: comparação lado a lado no laboratório (números no banco antes × depois, que devem ser idênticos) e contrato v1 verificado por teste automático (Fase 5).

---

### FASE 5 — Validação final e saúde do sistema

#### Parte A — Validação e caça às regressões

Uma versão reduzida roda ao fim de **cada** fase; a completa, antes de encerrar o projeto.

1. **Matriz de regressão (rotas e fluxos):**
   - Login, setup, sair; rotas públicas × privadas no middleware; gestor suspenso; Super Admin.
   - Painel: os 9 períodos, comparação com o anterior, plataformas, clientes, status, conectadas/manuais, contém/não contém por nível, limpar filtros, preferências salvas, período compartilhado entre páginas.
   - Campanhas: busca, paginação e ordem; detalhe de campanha conectada e de campanha manual.
   - Campanha manual: criar, editar, lançamentos de dia/semana/mês, públicos, criativos com upload (imagem, carrossel, vídeo), todas as exclusões com confirmação.
   - Criativos: rodando/parados, busca, carregar mais.
   - Clientes: ativar/desativar em fila, inativos, edição.
   - Integrações: conectar Meta, ativar/desativar conta, vincular cliente, novo cliente.
   - Destinos: criar, filtros (tudo/regras/manual), prévia, teste, enviar agora, 404 que pausa, timeout, segredo e chave novos.
   - API v1: sem chave, chave errada, `ad_account`, `since`/`until`, 304 com `ETag`, limite de frequência.
   - Links de cliente, página do link e relatório PDF (gestor e cliente).
   - Sincronização: modo leve, completo, 90 dias, 13 meses, token inválido, trava contra execução dupla, fila encadeada.
2. **Testes automatizados novos:**
   - **Unitários:** filtros, períodos, resultado por meta de otimização, público em texto.
   - **Contrato CRM:** o mesmo dado de entrada (fixture) gera o pacote v1 **idêntico** antes e depois (diferença permitida só em `sent_at` e `delivery_id`).
   - **RPC × cálculo atual:** para os mesmos filtros, `dashboard_data` tem que bater centavo a centavo com o resultado da lógica atual.
   - **Isolamento entre agências:** usuário da agência A nunca lê dados da B (RLS novo).
   - **Ponta a ponta:** navegador automatizado com usuário de teste, percorrendo a matriz acima.
   - **Carga (laboratório):** tempo de resposta e bytes por página com 2.000 campanhas ativas.
3. **Implantação gradual:** cada fase entra atrás de uma *feature flag* (variável de ambiente), com possibilidade de voltar ao comportamento anterior em segundos. Acompanhamento de 48h com a instrumentação da Fase 1 antes de remover o código antigo.

#### Parte B — Saúde do sistema (monitoramento contínuo, sem rotina extra)

- **Tela "Saúde do sistema" no Super Admin:**
  - duração dos ciclos, contas na fila, erros;
  - uso da cota da Meta (%);
  - envios ao CRM (ok, falha, pulados);
  - estimativa diária de requisições e bytes.
  - Os números são gravados **ao fim de cada ciclo**, sem consulta periódica.
- **Alertas** quando o orçamento da seção 2 estourar (ex.: ciclo acima de 120 s, cota da Meta acima de 75%).
- **Revisão mensal** do `pg_stat_statements` (roteiro pronto).

---

## 5. Capacidade estimada na carga-alvo (20 clientes, 2.000 ativas)

| Item | Estimativa |
|---|---|
| Linhas diárias (13 meses, só campanhas com gasto) | ~790 mil (~120 MB com índices) |
| Escritas por ciclo de 30 min (só mudanças, hoje e ontem) | ~2 a 4 mil linhas, em 20 a 40 RPCs |
| Painel, 20 gestores × 100 aberturas/dia | ~2.000 requisições/dia, quase todas atendidas pelo cache (0 leitura) |
| Egress de telas | ≤ 40 KB por abertura sem cache → < 3 GB/mês no pior caso |
| Envios ao CRM | Só contas alteradas, com gzip |

---

## 6. O que vou precisar de você (uma única vez)

Todas as mudanças no Supabase são feitas por mim, pela **API de gerenciamento do Supabase**. Para isso preciso de **uma credencial da conta onde está o projeto da Fire**. O acesso que já existe neste computador é de outra conta e não enxerga a Fire.

- **Token de acesso pessoal** do Supabase, gerado na conta da Fire em supabase.com/dashboard/account/tokens → "Generate new token".
- Cole no arquivo `evx-fire/.env.local`, numa linha `SUPABASE_ACCESS_TOKEN=...`. **Não cole no chat.**
- Com ele eu executo sozinho: consultas de diagnóstico, SQL, índices, regras de segurança, chaves de login e o gancho de login.
- O token fica só no seu computador, não vai para o GitHub nem para a Vercel, e você pode revogá-lo quando quiser.

Depois disso: só a aprovação no início de cada fase.

## 7. Ordem e esforço

| Fase | O que entrega | Depende de | Esforço |
|---|---|---|---|
| 1 — Medir e estancar | Números "antes", laboratório de 2.000 campanhas, login sem rede, um agendador, trava, sem regravações, sem destinos fantasmas | token | 1 a 2 sessões |
| 2 — Banco | RLS rápido, índices, "grava só se mudou", RPCs de leitura e escrita | 1 | 2 sessões |
| 3 — Telas leves | Telas recebendo só o resultado, cache por evento | 2 | 2 a 3 sessões |
| 4 — Meta e CRM por evento | Coleta adaptativa na Meta, fila, envio só do que mudou, API com cache | 2 | 2 a 3 sessões |
| 5 — Validação final e saúde | Matriz completa de regressões, testes automáticos, tela "Saúde do sistema" | todas | 1 a 2 sessões |

A Fase 1 já deve resolver a sobrecarga de agora. As Fases 2 a 4 garantem a meta de 2.000 campanhas ativas.
