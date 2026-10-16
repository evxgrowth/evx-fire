-- Pacote do CRM em escala: o histórico diário sai do banco agrupado por campanha, em listas
-- (o pacote que o CRM recebe NÃO muda: lib/fire/snapshot.ts monta os mesmos objetos de antes).
-- Nome novo (snapshot_data2) para a troca não quebrar a versão publicada: snapshot_data (antiga) continua
-- existindo até a versão nova do site estar no ar; depois é apagada (fase13-limpeza.sql).
-- Medido no laboratório (10.000 campanhas, 196 mil dias): 17,5 s / 34 MB → 2,4 s / 8,5 MB.

create or replace function public.snapshot_data2(p_agency uuid, p_accounts uuid[] default null, p_since date default null,
                                                p_until date default null, p_with_daily boolean default true)
returns jsonb language sql stable security invoker set search_path = public as $$
  with acc as (
    select a.id, a.external_id, a.name, a.currency, a.client_id, a.platform
      from public.ad_accounts a left join public.clients cl on cl.id = a.client_id
     where a.agency_id = p_agency and (a.platform = 'manual' or a.sync_enabled) and (a.client_id is null or cl.active)
       and (p_accounts is null or a.id = any(p_accounts))
  ), camp as (
    select id, ad_account_id, external_id, platform, source, name, status, effective_status, objective, objective_raw,
           bid_strategy, daily_budget, lifetime_budget, start_time, stop_time, metrics_30d, result_label
      from public.campaigns where ad_account_id in (select id from acc)
  )
  select jsonb_build_object(
    'agency_name', (select name from public.agencies where id = p_agency),
    'accounts', coalesce((select jsonb_agg(to_jsonb(acc)) from acc), '[]'::jsonb),
    'clients', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'active', active)) from public.clients where agency_id = p_agency), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(to_jsonb(camp)) from camp), '[]'::jsonb),
    'adsets', coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select id, campaign_id, external_id, name, status, effective_status, daily_budget, lifetime_budget, optimization_goal,
               billing_event, bid_strategy, promoted_object, targeting, audience_notes, start_time, end_time, metrics_30d
          from public.ad_sets where campaign_id in (select id from camp)) x), '[]'::jsonb),
    'ads', coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select id, campaign_id, ad_set_id, external_id, creative_id, name, format, headline, body, image_url, thumbnail_url, media,
               video_id, video_url, cta, link_url, preview_url, permalink_url, active, effective_status, metrics_30d
          from public.creatives where campaign_id in (select id from camp)) x), '[]'::jsonb),
    -- histórico diário agrupado por campanha, em listas: { campanha: [[data, gasto, impressões, alcance, cliques, conversões, receita], ...] }
    -- (antes: um objeto por dia, ordenado; 4x maior e 7x mais lento com milhares de campanhas)
    'daily_by', case when p_with_daily then coalesce((
      select jsonb_object_agg(z.campaign_id, z.r) from (
        select d.campaign_id, jsonb_agg(jsonb_build_array(d.date, d.spend, d.impressions, d.reach, d.clicks, d.conversions, d.revenue)) as r
          from public.campaign_daily d
          join camp on camp.id = d.campaign_id
         where (p_since is null or d.date >= p_since) and (p_until is null or d.date <= p_until)
         group by d.campaign_id) z), '{}'::jsonb)
      else '{}'::jsonb end
  )
$$;

revoke all on function public.snapshot_data2(uuid, uuid[], date, date, boolean) from public, anon;
grant execute on function public.snapshot_data2(uuid, uuid[], date, date, boolean) to authenticated, service_role;


-- Só os nomes (contas, campanhas, conjuntos e anúncios) para a prévia de filtros do destino.
-- Antes a tela do destino carregava o pacote inteiro (textos e imagens de todos os anúncios).
-- Segurança do chamador (RLS do gestor). Listas: [id, pai, id externo, nome, status/ativo].
create or replace function public.fire_names(p_agency uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  with acc as (
    select a.id, a.external_id, a.name, a.currency, a.client_id, a.platform
      from public.ad_accounts a left join public.clients cl on cl.id = a.client_id
     where a.agency_id = p_agency and (a.platform = 'manual' or a.sync_enabled) and (a.client_id is null or cl.active)
  ), camp as (
    select c.id, c.ad_account_id, c.external_id, c.name, c.status, c.source from public.campaigns c join acc on acc.id = c.ad_account_id
  )
  select jsonb_build_object(
    'accounts', coalesce((select jsonb_agg(to_jsonb(acc)) from acc), '[]'::jsonb),
    'clients', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name)) from public.clients where agency_id = p_agency), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(jsonb_build_array(id, ad_account_id, external_id, name, status, source)) from camp), '[]'::jsonb),
    'adsets', coalesce((select jsonb_agg(jsonb_build_array(s.id, s.campaign_id, s.external_id, s.name, s.effective_status))
                          from public.ad_sets s join camp on camp.id = s.campaign_id), '[]'::jsonb),
    'ads', coalesce((select jsonb_agg(jsonb_build_array(r.id, r.ad_set_id, r.external_id, r.name, r.active))
                       from public.creatives r join camp on camp.id = r.campaign_id), '[]'::jsonb)
  )
$$;

revoke all on function public.fire_names(uuid) from public, anon;
grant execute on function public.fire_names(uuid) to authenticated, service_role;
