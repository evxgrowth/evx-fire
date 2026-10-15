-- Fase 3 da otimização: dados das telas numa única chamada, em formato compacto.
-- Substitui as várias consultas paginadas de lib/repo.ts (contas, clientes, campanhas,
-- dias, conjuntos, anúncios). O resultado é guardado em cache no servidor (por agência)
-- e só é recalculado quando algo muda (sincronização ou ação do gestor).

create or replace function public.gestor_data(p_agency uuid, p_client uuid default null, p_since date default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with acc as (
    select a.id, a.client_id, a.platform, a.external_id, a.last_synced_at, a.sync_enabled
    from ad_accounts a
    where a.agency_id = p_agency and (p_client is null or a.client_id = p_client)
  ),
  cli as (
    select c.id, c.name, c.segment, c.active, c.notes
    from clients c
    where c.agency_id = p_agency and (p_client is null or c.id = p_client)
  ),
  -- contas visíveis: conectadas e ligadas (ou manuais), de clientes ativos
  vis as (
    select acc.id, acc.client_id from acc
    left join cli on cli.id = acc.client_id
    where (acc.platform = 'manual' or acc.sync_enabled) and (acc.client_id is null or coalesce(cli.active, true))
  ),
  camp as (
    select c.id, vis.client_id, c.platform, c.source, c.name, c.objective, c.status, c.daily_budget, c.reach_30d
    from campaigns c join vis on vis.id = c.ad_account_id
  )
  -- agência suspensa: nada (a tela mostra erro e o gestor é levado ao login)
  select case when exists (select 1 from agencies g where g.id = p_agency and g.status = 'suspended') then null else jsonb_build_object(
    'has_accounts', exists (select 1 from acc),
    'last_sync', (select max(last_synced_at) from acc),
    'since', p_since,
    'clients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cli.id, 'name', cli.name, 'segment', cli.segment, 'active', cli.active, 'notes', cli.notes,
        'meta', (select string_agg(external_id, ', ') from acc where acc.client_id = cli.id and acc.platform = 'meta'),
        'google', (select string_agg(external_id, ', ') from acc where acc.client_id = cli.id and acc.platform = 'google')
      ) order by cli.name) from cli), '[]'::jsonb),
    -- campanha: [id, cliente, plataforma, origem, nome, objetivo, status, orçamento diário, alcance 30d]
    'campaigns', coalesce((
      select jsonb_agg(jsonb_build_array(id, client_id, platform, source, name, objective, status, daily_budget, reach_30d)) from camp), '[]'::jsonb),
    -- conjunto: [id, campanha, nome, ativo]
    'adsets', coalesce((
      select jsonb_agg(jsonb_build_array(s.id, s.campaign_id, s.name, s.effective_status = 'ACTIVE'))
      from ad_sets s join camp on camp.id = s.campaign_id), '[]'::jsonb),
    'creatives', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', cr.id, 'c', cr.campaign_id, 's', cr.ad_set_id, 'n', cr.name, 'f', cr.format, 'h', nullif(cr.headline, ''), 'b', nullif(cr.body, ''),
        'img', cr.image_url, 'vid', cr.video_url, 'cta', cr.cta, 'm', case when jsonb_array_length(coalesce(cr.media, '[]'::jsonb)) > 0 then cr.media end,
        'a', cr.active, 'i', cr.impressions, 'k', cr.clicks, 'sp', cr.spend, 'cv', cr.conversions)))
      from creatives cr join camp on camp.id = cr.campaign_id), '[]'::jsonb),
    -- dias com dados, por campanha: { campanha: [[dia desde p_since, gasto, impressões, cliques, conversões, receita], ...] }
    'daily', coalesce((
      select jsonb_object_agg(campaign_id, rows) from (
        select d.campaign_id, jsonb_agg(jsonb_build_array(d.date - p_since, d.spend, d.impressions, d.clicks, d.conversions, d.revenue) order by d.date) as rows
        from campaign_daily d join camp on camp.id = d.campaign_id
        where p_since is not null and d.date >= p_since
        group by d.campaign_id
      ) x), '{}'::jsonb)
  ) end;
$$;

revoke all on function public.gestor_data(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.gestor_data(uuid, uuid, date) to service_role;
