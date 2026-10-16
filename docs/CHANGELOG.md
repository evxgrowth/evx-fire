# EVX Fire — Changelog técnico (auditoria)

Registro de todas as mudanças de código, banco de dados e configuração do EVX Fire, do início do projeto até hoje.
Escrito para auditoria de DevOps: cada entrada diz **o que mudou**, **onde** (arquivos, objetos do banco, configuração),
**como foi verificado** e **como reverter**.

| Item | Valor |
|---|---|
| Repositório | `github.com/evxgrowth/evx-fire` (branch `main`, deploy automático na Vercel a cada push) |
| Produção | `https://fire.evxgrowth.com.br` |
| Banco | Supabase, projeto `jpwxrfrptrkiydcacpfw` (organização "EVX FIRE DB"), Postgres 17 |
| Pilha | Next.js 15 (App Router), TypeScript, Tailwind v4, Recharts, framer-motion |
| Integrações | Meta Graph API (somente leitura), EVX CRM (webhook assinado HMAC + API de consulta) |
| Mudanças no banco | Arquivos versionados em `supabase/*.sql`, aplicados pela API de gerenciamento do Supabase com `node scripts/supa.mjs -f <arquivo>` (token pessoal em `.env.local`, nunca no repositório) |

Convenções: datas no fuso de São Paulo; "commit" = hash curto do git. Valores secretos nunca aparecem neste documento.

---

## 1. Estado atual (inventário para auditoria)

### 1.1 Agendamento (único)

| Item | Valor |
|---|---|
| Mecanismo | `pg_cron` + `pg_net` no Supabase (o agendador da Vercel foi removido; `vercel.json` = `{}`) |
| Job | `evx-fire-sync`, expressão `*/30 * * * *` (a cada 30 min, UTC) |
| Ação | `net.http_get` em `https://fire.evxgrowth.com.br/api/cron/sync` com `Authorization: Bearer <CRON_SECRET>`, timeout 290 s |
| Limpeza embutida | O mesmo job apaga `cron.job_run_details` com mais de 2 dias |
| Rotina diária | Primeiro ciclo após 03:00 (São Paulo): apaga `deliveries` com mais de 7 dias (`dailyMaintenance`) |

> **Ponto de atenção (auditoria):** o `CRON_SECRET` fica gravado no comando do job (`cron.job.command`), visível a quem administra o banco. Recomendação: mover para o Supabase Vault e ler com `vault.decrypted_secrets` no comando.

### 1.2 Autenticação

- Gancho de token **`custom_access_token_hook`** habilitado no Supabase Auth (`hook_custom_access_token_enabled = true`, URI `pg-functions://postgres/public/custom_access_token_hook`). Coloca no JWT a claim `app` = `{agency_id, role, name, email, agency_name, agency_status}`.
- Tokens assinados com chaves **ES256**: o middleware e o servidor validam localmente com `supabase.auth.getClaims()` (sem ida ao servidor de login a cada clique).
- Suspensão de agência: `my_agency_id()` devolve `null` para agência suspensa (as regras de segurança bloqueiam), `revoke_agency_sessions(agency)` derruba as sessões, e o cache de telas/links da agência é limpo.

### 1.3 Funções do banco (todas em `public`)

| Função | Segurança | Quem pode chamar | Uso |
|---|---|---|---|
| `custom_access_token_hook(event)` | invoker | `supabase_auth_admin` | Claims no token |
| `my_agency_id()`, `is_super_admin()` | definer | todos (usadas nas policies) | Regras de segurança (RLS) |
| `prefs_merge(p_patch)` | invoker | authenticated | Preferências do usuário numa chamada |
| `revoke_agency_sessions(p_agency)` | definer | service_role | Suspensão de agência |
| `try_sync_lock`, `release_sync_lock`, `try_sync_locks`, `release_sync_locks` | definer | service_role | Trava contra sincronização dupla |
| `sync_account_state(p_account, p_mode)` | definer | service_role | Estado da conta para a sincronização |
| `sync_apply_account(p_account, p)` | definer | service_role | Grava uma conta inteira numa chamada (só o que mudou, por `row_hash`) |
| `dispatch_plan(p_agency)` | definer | service_role | Plano de envio ao CRM (destinos, contas, já enviado) |
| `record_delivery(p)` | definer | service_role | Registro de envio + estado "já enviado" |
| `snapshot_data(...)` | invoker | authenticated, service_role | **Versão anterior** do pacote do CRM. Mantida só até a versão nova estar no ar; removida por `supabase/fase13-limpeza.sql` |
| `snapshot_data2(...)` | invoker | authenticated, service_role | Pacote do CRM (histórico diário compacto, agrupado por campanha) |
| `fire_names(p_agency)` | invoker | authenticated, service_role | Só nomes da árvore (tela de destino) |
| `gestor_base(p_agency, p_client)` | definer | service_role | Base leve do layout (clientes, última sincronização) |
| `fire_match(p_agency, p_client, f)` | definer | service_role | Filtros das telas (mesma regra de `lib/data.ts`) |
| `fire_view(p_agency, p_client, a)` | definer | service_role | Dados prontos de cada tela |
| `fire_creative_json(...)` | invoker | interno | Formato do anúncio enviado às telas |
| `f_norm(text)` | imutável | interno | Texto sem acento e minúsculo |
| `gestor_data(...)` | definer | service_role | **Não usada pelo site.** Mantida só para o script de conferência `scripts/verify-views.mts` |
| `system_health()` | definer | service_role | Tela "Saúde do sistema" |

Funções `security definer` recebem a agência **sempre do servidor** (login verificado ou link validado), nunca do navegador, e só o `service_role` pode executá-las.

### 1.4 Tabelas e colunas adicionadas pelas otimizações

| Objeto | Finalidade |
|---|---|
| `campaigns.row_hash`, `ad_sets.row_hash`, `creatives.row_hash` | Impressão digital da linha: a sincronização só grava o que mudou |
| `sync_locks` (RLS ligado, sem policy) | Trava por agência + intervalo mínimo de 5 min no botão "Sincronizar" |
| `ad_accounts.last_structure_sync_at`, `ad_accounts.structure_sig` | Modo "só métricas" da sincronização |
| `campaigns.name_norm`, `ad_sets.name_norm`, `creatives.name_norm`, `creatives.headline_norm` | Colunas **calculadas pelo banco** (`generated always ... stored`) com o texto sem acento, para busca e filtros |
| Índice `idx_daily_campaign_date_cover2` em `campaign_daily (campaign_id, date) include (spend, impressions, reach, clicks, conversions, revenue)` | Somas por período e pacote do CRM lendo só o índice |
| Extensão `unaccent` (schema `extensions`) | Normalização de texto |

### 1.5 Cache do servidor (Next.js Data Cache)

| Etiqueta | O que guarda | Quem limpa |
|---|---|---|
| `agency:<id>` | Base do layout (`gestor_base`), dados de cada tela (`fire_view`), pacote da API v1 | Ciclo do agendador (agências sincronizadas), botão Sincronizar, conexão com a Meta, ações do gestor (clientes, contas, campanhas manuais), suspensão de agência |
| `share-links` | Validação dos links de cliente | Criar/alterar/apagar link, ativar/desativar/apagar cliente, suspender agência |

Validade máxima de qualquer entrada: 1 hora (rede de segurança caso uma limpeza falhe).

### 1.6 Rotas

| Rota | Acesso | Observação |
|---|---|---|
| `/api/cron/sync` | `Authorization: Bearer CRON_SECRET` | Fora do middleware |
| `/api/sync` | Gestor logado | Botão "Sincronizar"; 429 se já houver uma rodando ou se usado há menos de 5 min |
| `/api/view` | Gestor logado **ou** token de link de cliente válido | Pública no middleware; a própria rota valida. Pedido sanitizado (lista fechada de visões, filtros, limites) |
| `/api/v1/snapshot` | Chave de API do destino (hash SHA-256 no banco) | Cache + `ETag`/`304` |
| `/api/meta/callback` | Retorno OAuth da Meta | Pública |

### 1.7 Variáveis de ambiente (só os nomes)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `META_APP_ID`, `META_APP_SECRET`, `META_LOGIN_CONFIG_ID`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (Vercel e `.env.local`).
Só local (nunca na Vercel nem no git): `SUPABASE_ACCESS_TOKEN` (token pessoal da API de gerenciamento, usado por `scripts/supa.mjs`).
Diagnóstico opcional: `FIRE_DB_TRACE=1` registra cada chamada ao banco (`[db] MÉTODO caminho status bytes`).

---

## 2. Resultados medidos

| Medida | Antes (14/10) | Depois |
|---|---|---|
| Requisições ao banco por ciclo de 30 min, sem mudanças | 29 | 8 (produção) |
| Linhas regravadas por ciclo, sem mudanças | 668 | 0 (produção) |
| Abrir o painel | ~14 requisições, base inteira | 1ª vez: base + 1 visão; seguintes: só preferências (cache) |
| Tamanho recebido pelo navegador (agência real) | base inteira (~0,7 MB) | painel 15 KB, campanhas 14 KB/50 linhas, criativos 60 KB/40, clientes 0,1 KB |
| Agência de laboratório (20 clientes, 10.000 campanhas, 2.000 ativas, 90 dias) — modelo antigo | 28 MB e 17 s por carregamento | — |
| Mesma agência — modelo atual | — | 3 a 50 KB por tela; 50 a 720 ms no banco; filtros "contém" ~200 ms |
| Pacote do CRM, agência de laboratório inteira | estourava o tempo (> 100 s) | 8 s, em chamadas de 1 conta |
| API v1 repetida sem mudanças | consulta completa | 1 consulta (chave) e `304` sem corpo |
| Uso do banco (dados reais) | 18 MB | 16 MB (após o laboratório ser apagado e as tabelas compactadas) |

---

## 3. Linha do tempo

### 3.1 — 27/09/2026 · `41d2254`, `c482017`, `b2bd1cc` · Fundação
- Painel com login real, multiempresa (agências), Super Admin e integração de leitura com Meta Ads.
- Banco: `supabase/schema.sql` — tabelas `agencies`, `profiles`, `clients`, `ad_accounts`, `platform_connections`, `campaigns`, `campaign_daily`, `creatives`, `share_links`; view `agency_spend_30d`; funções `my_agency_id()`, `is_super_admin()`; RLS por agência.
- `/setup` detecta banco ainda não preparado. SQL local do agendador ignorado no git (`supabase/*.local.sql`).

### 3.2 — 27/09/2026 · `e058414`, `0f39c7c`, `79cc125`, `323ec72` · Destinos e contrato do CRM
- Destinos: webhooks assinados (`X-Fire-Signature`, HMAC-SHA256 de `timestamp.corpo`) + API de consulta `/api/v1/snapshot` com chave por destino.
- Filtros de campanhas/conjuntos/anúncios por destino; sincronização completa (contas, campanhas, conjuntos, anúncios, histórico).
- Banco: `supabase/fase5.sql` — tabelas `ad_sets`, `destinations`, `deliveries`, `manual_entries`, `user_preferences`; colunas de métricas/estado em `campaigns` e `creatives`; policies de armazenamento de criativos.
- Contrato v1 (`fire.snapshot`): dias completos com zero onde não houve veiculação, novas tentativas, `404` do CRM pausa o destino, API sempre responde JSON. Envio não se repete quando o CRM só demora (timeout).

### 3.3 — 27 e 28/09/2026 · `1e10bfa`, `190c299`, `c358fa0` · Produto
- Filtros combinados e salvos por página, períodos compartilhados (hoje, ontem, semana, mês, 7–90 dias), relatório PDF, link do cliente.
- Sincronização econômica: modo leve, diário incremental, histórico de 13 meses uma vez, cache de imagens; envio só do que mudou; API com `since`/`until`.
- Banco: `supabase/fase6.sql` — tabela `destination_state`; colunas `last_full_sync_at`, `last_daily_full_at`, `history_backfilled_at`; índices por agência.

### 3.4 — 14/10/2026 · `caf3d4a` · Otimização, Fase 1 (medir e estancar)
**Motivo:** o plano gratuito do Supabase chegou a 89% em egress e ingestão de logs. Plano em `docs/PLANO-OTIMIZACAO.md`.
- **Login sem rede:** `middleware.ts` e `lib/auth.ts` passam a usar `getClaims()` e as claims do token (zero consultas ao perfil por página).
- **Banco** (`supabase/fase7-otimizacao-1.sql`):
  - `row_hash` em `campaigns`, `ad_sets`, `creatives`;
  - tabela `sync_locks` + `try_sync_lock`/`release_sync_lock`;
  - `prefs_merge`;
  - `custom_access_token_hook`;
  - `my_agency_id()` e `is_super_admin()` leem o token;
  - todas as policies reescritas com `(select fn())` (calculado uma vez por consulta, em vez de por linha);
  - `revoke_agency_sessions`;
  - limpeza de `cron.job_run_details` (2 dias);
  - remoção de destinos "fantasmas" sem URL.
- **Configuração:** gancho de token habilitado via API de gerenciamento (`PATCH /v1/projects/{ref}/config/auth`). Agendador único no `pg_cron` (Vercel Cron removido).
- **Código:**
  - sincronização grava só o que mudou;
  - trava contra sincronização dupla;
  - envio ao CRM só das contas alteradas;
  - destinos só são criados ao clicar em Salvar (`/destinos/novo`);
  - preferências numa chamada (espera de 1,5 s).
- **Verificação:** medição por `pg_stat_statements` antes/depois: 29 → 33 requisições e 668 → 38 regravações por ciclo nesta fase. O ganho grande veio na fase seguinte.
- **Reverter:** `git revert caf3d4a`; desligar o gancho em Auth → Hooks; as colunas novas são inofensivas.

### 3.5 — 15/10/2026 · `5acd3bc` · Otimização, Fases 2 e 4 (banco e eventos)
- **Banco** (`supabase/fase8-otimizacao-2.sql`):
  - `sync_apply_account`: uma chamada por conta, em blocos de 250 campanhas, `on conflict ... where row_hash is distinct from`;
  - `sync_account_state`, `try_sync_locks`/`release_sync_locks`, `dispatch_plan`, `record_delivery`, `snapshot_data`;
  - colunas `last_structure_sync_at` e `structure_sig`.
- **Sincronização (`lib/meta/sync.ts`)**, três modos:
  - **leve:** nada rodando e estrutura sincronizada há menos de 6 h;
  - **só métricas:** estrutura igual e menos de 6 h; volta ao completo se surgir anúncio novo;
  - **completo:** quando os outros não se aplicam.
  - Até 4 contas em paralelo. `preview_url` fica fora do hash, porque a Meta muda esse link a cada consulta.
- **Meta (`lib/meta/graph.ts`):** limite de 60 s por chamada; falha de rede tratada como temporária, com nova tentativa; causa do erro gravada em `ad_accounts.last_error`.
- **CRM (`lib/fire/dispatch.ts`):** plano de envio e registro de envio numa chamada cada. Não envia nada se nada mudou e todos os destinos receberam algo nas últimas 23 h.
- **Verificação:**
  - pacote do CRM idêntico byte a byte ao anterior (4.189.885 bytes; 166 campanhas, 194 conjuntos, 308 anúncios, 12 meses);
  - em produção: **8 requisições e 0 regravações por ciclo**;
  - todas as telas abertas sem erro.
- **Reverter:** `git revert 5acd3bc` (as funções novas podem continuar no banco).

### 3.6 — 15/10/2026 · `3daac3a` · Otimização, Fase 3 (telas com cache)
- Banco: `supabase/fase9-telas-leves.sql` — `gestor_data` (dados das telas numa chamada, formato compacto).
- Cache do servidor por agência (etiqueta `agency:<id>`) limpo por evento; fim do `revalidatePath("/", "layout")` global.
- Verificação: dados idênticos ao carregamento anterior para as 166 campanhas; cache confirmado (2ª abertura sem consulta).
- Reverter: `git revert 3daac3a`.

### 3.7 — 15/10/2026 · `73194ac` · Otimização, Fases 4B e 5
- API v1: pacote em cache + `ETag` / `If-None-Match` → `304` sem corpo. Contrato inalterado (só o cabeçalho `ETag` foi acrescentado).
- Tela **Super Admin → Saúde do sistema**. Mostra:
  - as últimas execuções do agendador e as respostas HTTP;
  - contas com erro ou atraso;
  - destinos e envios das últimas 24 h;
  - tamanho do banco.
- Banco: `supabase/fase10-saude.sql` — `system_health()`.
- Verificação: API testada com destino temporário (200, 304 com 0 bytes, 401 sem chave/chave errada); destino apagado em seguida.

### 3.8 — 16/10/2026 · `54ee84a` · Escala (meta: 20 clientes, 2.000 campanhas ativas, 8.000 inativas)
**Problema:** o navegador recebia a base inteira e calculava tudo. Na carga-alvo isso dá 28 MB e 17 s por carregamento, acima do limite de 2 MB do cache, e cada abertura de página ia ao banco.

**Telas — o banco calcula, o navegador recebe só o resultado** (`supabase/fase11-telas-escala.sql`):
- `fire_match`: mesmas regras de `filterCampaigns` (`lib/data.ts`): plataforma, clientes, status, origem, "contém"/"não contém" por nível (qualquer, campanha, conjunto, anúncio), sem acento e sem diferenciar maiúsculas. Dois caminhos: sem termos de texto, consulta direta; com termos, comparação numa passada só, agrupando por campanha.
- `fire_view`: visões `dashboard`, `report`, `campaigns` (paginada), `creatives` (paginada), `clients`, `campaign`. Inclui:
  - comparação com o período anterior;
  - série diária;
  - tabela limitada às 50 campanhas de maior investimento, com o total;
  - destaques (melhor custo por resultado, mais resultados).
- `gestor_base`: layout só com clientes e última sincronização.
- Colunas calculadas `name_norm`/`headline_norm` + extensão `unaccent`; índice de cobertura em `campaign_daily`.

**Código das telas:**
- `lib/views.ts`: tipos, datas e o cálculo de referência (modo demonstração e gabarito dos testes).
- `components/useView.ts`: busca a visão pronta, mostra o resultado anterior enquanto carrega e guarda as respostas da aba, conforme a versão dos dados.
- `app/api/view/route.ts`: rota que valida e sanitiza o pedido.
- `components/DataProvider.tsx`: passa a guardar só a base leve.
- Telas refeitas: painel, campanhas ("Mostrar mais" no servidor, busca no servidor), criativos (idem, imagens com `loading="lazy"`), clientes, detalhe da campanha, relatório PDF (gestor e link), link do cliente.
- No painel, a tabela mostra as 50 de maior investimento, com link "Ver todas em Campanhas".

**Segurança do link do cliente:**
- receita zerada no servidor quando "mostrar receita" está desligado;
- criativos não são enviados quando "mostrar criativos" está desligado;
- cliente forçado no servidor.

Antes, esses dados iam para o navegador e só eram escondidos na tela.

**CRM — mesmo contrato, montagem em escala** (`supabase/fase12-crm-escala.sql`):
- `snapshot_data2`: histórico diário agrupado por campanha, em listas. No laboratório: de 17,5 s / 34 MB para 2,4 s / 8,5 MB. `lib/fire/snapshot.ts` reabre nos mesmos objetos de antes.
- Montagem conta a conta (1 conta por chamada, até 3 em paralelo), abaixo do limite de 8 s por consulta.
- Busca de dias por índice (`Map`) em vez de lista. Com 13 meses, a lista ficava quadrática.
- `fire_names`: a tela do destino carrega só nomes. Antes carregava textos e imagens de todos os anúncios.
- Troca segura: `snapshot_data2` tem nome novo; a função antiga continuou atendendo a versão publicada até o deploy. Durante a troca houve uma janela de ~6 min em que `snapshot_data` esteve alterada; a versão original foi restaurada e **nenhum envio ocorreu nesse intervalo** (último envio 15:01, troca ~16:10–16:16 UTC; conferido em `deliveries`).

**Verificação:**
- `scripts/verify-views.mts`: banco × cálculo antigo em **1.624 combinações** de filtros (854 com resultado), incluindo agência real, links de cliente e laboratório. **0 diferenças.** Empates exatos de valor são desempatados pelo id, nos dois lados.
- `scripts/verify-crm.mts`: pacote do CRM versão anterior × atual, **idêntico byte a byte**. Casos: 90 dias e 13 meses, filtros padrão e do destino real, mais a árvore de nomes do destino.
- Navegador automatizado com usuários temporários: agência real, agência de demonstração, Super Admin e agência de laboratório. Todas as telas abertas sem erro. Testados também troca de período, busca, "Mostrar mais", detalhe da campanha, link do cliente e relatórios. Limpeza do cache após sincronização confirmada.
- Laboratório de carga (`scripts/lab-carga.sql` + `scripts/lab-medir.mts`), apagado ao fim. Tabelas compactadas com `VACUUM FULL`; banco voltou a 16 MB.

**Reverter:** `git revert 54ee84a`. As funções novas podem ficar no banco. Não executar `fase13-limpeza.sql` antes de reverter, porque a versão anterior do site depende de `snapshot_data`.

### 3.9 — 16/10/2026 · commit seguinte a `54ee84a` · Documentação no Super Admin
- **Super Admin → Changelog** (`/admin/changelog`) mostra este documento (`docs/CHANGELOG.md`).
- **Super Admin → Checklist de testes** (`/admin/testes`) mostra `docs/CHECKLIST-TESTES.md` com marcação por item, salva no navegador.
- Os documentos são lidos do próprio deploy (`next.config.ts → outputFileTracingIncludes`), então o que está no repositório é o que aparece na tela.
- Novos arquivos: `components/Markdown.tsx` (leitor de Markdown simples, sem dependência externa), `components/CheckItem.tsx`, `lib/docs.ts`, `supabase/fase13-limpeza.sql` (ainda não executado; ver item 4.4).
- Sem mudança no banco.

---

## 4. Pontos de atenção e pendências

1. **API v1 com a agência inteira (`/api/v1/snapshot` sem `ad_account`):** a Vercel limita respostas de funções a ~4,5 MB.
   - Hoje: 1,6 MB (90 dias); 4,6 MB pedindo 13 meses.
   - Na carga-alvo, a agência inteira passa desse limite.
   - Recomendação (exige combinar com o CRM, porque muda o uso do contrato): o CRM consultar **por conta** (`?ad_account=`), que já é suportado.
2. **Tamanho do pacote do CRM na carga-alvo:** cada conta alterada gera ~3 MB (90 dias de histórico diário). Com muitas contas mudando a cada 30 min, o tráfego de saída do banco cresce.
   - Opções a combinar: reduzir a frequência de envio quando só as métricas mudam, ou enviar só os dias alterados (exige versão 2 do contrato).
3. **Segredo do agendador** dentro do comando do `pg_cron` (ver 1.1): mover para o Vault.
4. **Limpeza pós-deploy (pendente de propósito):** `supabase/fase13-limpeza.sql` remove `snapshot_data`, que só a versão anterior do site usa. A função foi mantida para permitir voltar a versão anterior pela Vercel com um clique. Executar depois de 48 h estável.
5. **`gestor_data`** e `lib/packed.ts → unpack` só existem para o script de conferência. Podem ser removidos quando a conferência não for mais necessária.
6. Google Ads ainda não integrado; app da Meta em modo desenvolvedor por decisão do responsável.

## 5. Como auditar / repetir as verificações

```
node scripts/supa.mjs -f scripts/diagnostico.sql                  # consumo: pg_stat_statements, tamanhos, cron
NODE_OPTIONS=--experimental-websocket npx tsx scripts/verify-views.mts 400
git show <versão anterior>:lib/fire/snapshot.ts > lib/fire/_old-snapshot.ts
NODE_OPTIONS="--experimental-websocket --conditions=react-server" npx tsx scripts/verify-crm.mts
node scripts/supa.mjs -f scripts/lab-carga.sql && npx tsx scripts/lab-medir.mts
node scripts/supa.mjs "delete from agencies where name = 'LAB CARGA (apagar)'"
```

Acompanhamento contínuo: **Super Admin → Saúde do sistema**.
