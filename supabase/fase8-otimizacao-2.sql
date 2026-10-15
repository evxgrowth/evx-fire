-- =====================================================================
--  EVX Fire — Otimização, Fases 2 e 4
--  Funções no banco: cada conta é gravada numa única chamada (só o que mudou),
--  o pacote do CRM é montado numa chamada e o envio é registrado numa chamada.
--  Executado automaticamente pela API de gerenciamento (scripts/supa.mjs). Pode rodar mais de uma vez.
-- =====================================================================

-- ---------- Controle do modo "só métricas" (Fase 4) ----------
alter table public.ad_accounts add column if not exists last_structure_sync_at timestamptz; -- última coleta de conjuntos/anúncios
alter table public.ad_accounts add column if not exists structure_sig text;                  -- assinatura da lista de campanhas

-- ---------- Estado de uma conta, para a sincronização decidir o que buscar ----------
-- p_mode 'full'   → imagens já salvas dos anúncios (para não baixar de novo)
-- p_mode 'metrics'→ anúncios conhecidos e metas de otimização dos conjuntos
create or replace function public.sync_account_state(p_account uuid, p_mode text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when p_mode = 'full' then
    jsonb_build_object('ads', coalesce((
      select jsonb_agg(jsonb_build_object('external_id', a.external_id, 'image_url', a.image_url, 'thumbnail_url', a.thumbnail_url, 'media', a.media))
        from public.creatives a join public.campaigns c on c.id = a.campaign_id
       where c.ad_account_id = p_account), '[]'::jsonb))
  else
    jsonb_build_object(
      'ad_ids', coalesce((
        select jsonb_agg(a.external_id) from public.creatives a join public.campaigns c on c.id = a.campaign_id
         where c.ad_account_id = p_account), '[]'::jsonb),
      'adsets', coalesce((
        select jsonb_agg(jsonb_build_object('external_id', s.external_id, 'optimization_goal', s.optimization_goal, 'promoted_object', s.promoted_object))
          from public.ad_sets s join public.campaigns c on c.id = s.campaign_id
         where c.ad_account_id = p_account), '[]'::jsonb))
  end
$$;

-- ---------- Grava uma conta inteira numa chamada, só o que mudou ----------
create or replace function public.sync_apply_account(p_account uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_agency uuid;
  v_mode text := coalesce(p ->> 'mode', 'full');
  n_c int := 0; n_s int := 0; n_a int := 0; n_d int := 0; n int := 0;
begin
  select agency_id into v_agency from public.ad_accounts where id = p_account;
  if v_agency is null then raise exception 'conta % não encontrada', p_account; end if;

  -- ===== Campanhas =====
  if v_mode = 'light' then
    -- modo leve: só nome, status e orçamento, quando mudaram
    with src as (
      select * from jsonb_to_recordset(coalesce(p -> 'campaigns', '[]')) as x(
        external_id text, name text, objective text, objective_raw text, status text, effective_status text,
        bid_strategy text, daily_budget numeric, lifetime_budget numeric, start_time timestamptz, stop_time timestamptz)
    ), upd as (
      update public.campaigns c set
        name = s.name, objective = s.objective, objective_raw = s.objective_raw, status = s.status,
        effective_status = s.effective_status, bid_strategy = s.bid_strategy, daily_budget = s.daily_budget,
        lifetime_budget = s.lifetime_budget, start_time = s.start_time, stop_time = s.stop_time, updated_at = now()
      from src s
      where c.ad_account_id = p_account and c.external_id = s.external_id
        and (c.name, c.objective_raw, c.status, c.effective_status, c.bid_strategy, c.daily_budget, c.lifetime_budget, c.stop_time)
            is distinct from (s.name, s.objective_raw, s.status, s.effective_status, s.bid_strategy, s.daily_budget, s.lifetime_budget, s.stop_time)
      returning 1
    ), ins as (
      insert into public.campaigns (agency_id, ad_account_id, platform, external_id, name, objective, objective_raw, status,
                                    effective_status, bid_strategy, daily_budget, lifetime_budget, start_time, stop_time)
      select v_agency, p_account, 'meta', s.external_id, s.name, s.objective, s.objective_raw, s.status,
             s.effective_status, s.bid_strategy, s.daily_budget, s.lifetime_budget, s.start_time, s.stop_time
        from src s
       where not exists (select 1 from public.campaigns c where c.ad_account_id = p_account and c.external_id = s.external_id)
      returning 1
    )
    select (select count(*) from upd) + (select count(*) from ins) into n_c;
  else
    with src as (
      select * from jsonb_to_recordset(coalesce(p -> 'campaigns', '[]')) as x(
        external_id text, name text, objective text, objective_raw text, status text, effective_status text,
        bid_strategy text, daily_budget numeric, lifetime_budget numeric, start_time timestamptz, stop_time timestamptz,
        reach_30d bigint, metrics_30d jsonb, row_hash text)
    ), up as (
      insert into public.campaigns (agency_id, ad_account_id, platform, external_id, name, objective, objective_raw, status,
                                    effective_status, bid_strategy, daily_budget, lifetime_budget, start_time, stop_time,
                                    reach_30d, metrics_30d, row_hash, updated_at)
      select v_agency, p_account, 'meta', s.external_id, s.name, s.objective, s.objective_raw, s.status,
             s.effective_status, s.bid_strategy, s.daily_budget, s.lifetime_budget, s.start_time, s.stop_time,
             coalesce(s.reach_30d, 0), coalesce(s.metrics_30d, '{}'), s.row_hash, now()
        from src s
      on conflict (ad_account_id, external_id) do update set
        name = excluded.name, objective = excluded.objective, objective_raw = excluded.objective_raw, status = excluded.status,
        effective_status = excluded.effective_status, bid_strategy = excluded.bid_strategy, daily_budget = excluded.daily_budget,
        lifetime_budget = excluded.lifetime_budget, start_time = excluded.start_time, stop_time = excluded.stop_time,
        reach_30d = excluded.reach_30d, metrics_30d = excluded.metrics_30d, row_hash = excluded.row_hash, updated_at = now()
      where public.campaigns.row_hash is distinct from excluded.row_hash
      returning 1
    )
    select count(*) into n_c from up;
  end if;

  -- ===== Conjuntos (completos) =====
  with src as (
    select * from jsonb_to_recordset(coalesce(p -> 'adsets', '[]')) as x(
      external_id text, campaign_ext text, name text, status text, effective_status text, daily_budget numeric,
      lifetime_budget numeric, optimization_goal text, billing_event text, bid_strategy text, promoted_object jsonb,
      targeting jsonb, start_time timestamptz, end_time timestamptz, metrics_30d jsonb, row_hash text)
  ), up as (
    insert into public.ad_sets (agency_id, campaign_id, external_id, name, status, effective_status, daily_budget, lifetime_budget,
                                optimization_goal, billing_event, bid_strategy, promoted_object, targeting, start_time, end_time,
                                metrics_30d, row_hash, updated_at)
    select v_agency, c.id, s.external_id, s.name, s.status, s.effective_status, s.daily_budget, s.lifetime_budget,
           s.optimization_goal, s.billing_event, s.bid_strategy, s.promoted_object, s.targeting, s.start_time, s.end_time,
           coalesce(s.metrics_30d, '{}'), s.row_hash, now()
      from src s join public.campaigns c on c.ad_account_id = p_account and c.external_id = s.campaign_ext
    on conflict (campaign_id, external_id) do update set
      name = excluded.name, status = excluded.status, effective_status = excluded.effective_status,
      daily_budget = excluded.daily_budget, lifetime_budget = excluded.lifetime_budget, optimization_goal = excluded.optimization_goal,
      billing_event = excluded.billing_event, bid_strategy = excluded.bid_strategy, promoted_object = excluded.promoted_object,
      targeting = excluded.targeting, start_time = excluded.start_time, end_time = excluded.end_time,
      metrics_30d = excluded.metrics_30d, row_hash = excluded.row_hash, updated_at = now()
    where public.ad_sets.row_hash is distinct from excluded.row_hash
    returning 1
  )
  select count(*) into n_s from up;

  -- ===== Conjuntos (só métricas — modo métricas) =====
  with src as (
    select * from jsonb_to_recordset(coalesce(p -> 'adset_metrics', '[]')) as x(external_id text, metrics_30d jsonb)
  ), upd as (
    update public.ad_sets a set metrics_30d = s.metrics_30d, updated_at = now()
      from src s, public.campaigns c
     where c.ad_account_id = p_account and a.campaign_id = c.id and a.external_id = s.external_id
       and a.metrics_30d is distinct from s.metrics_30d
    returning 1
  )
  select count(*) into n from upd;
  n_s := n_s + n;

  -- ===== Anúncios / criativos (completos) =====
  with src as (
    select * from jsonb_to_recordset(coalesce(p -> 'ads', '[]')) as x(
      external_id text, campaign_ext text, adset_ext text, creative_id text, name text, format text, headline text, body text,
      image_url text, thumbnail_url text, media jsonb, video_id text, video_url text, cta text, link_url text,
      preview_url text, permalink_url text, active boolean, effective_status text, impressions bigint, reach bigint,
      clicks bigint, spend numeric, conversions numeric, metrics_30d jsonb, row_hash text)
  ), up as (
    insert into public.creatives (agency_id, campaign_id, ad_set_id, external_id, creative_id, name, format, headline, body,
                                  image_url, thumbnail_url, media, video_id, video_url, cta, link_url, preview_url, permalink_url,
                                  active, effective_status, impressions, reach, clicks, spend, conversions, metrics_30d, row_hash, updated_at)
    select v_agency, c.id, st.id, s.external_id, s.creative_id, s.name, coalesce(s.format, 'image'), coalesce(s.headline, ''), coalesce(s.body, ''),
           s.image_url, s.thumbnail_url, coalesce(s.media, '[]'), s.video_id, s.video_url, s.cta, s.link_url, s.preview_url, s.permalink_url,
           coalesce(s.active, false), coalesce(s.effective_status, ''), coalesce(s.impressions, 0), coalesce(s.reach, 0),
           coalesce(s.clicks, 0), coalesce(s.spend, 0), coalesce(s.conversions, 0), coalesce(s.metrics_30d, '{}'), s.row_hash, now()
      from src s
      join public.campaigns c on c.ad_account_id = p_account and c.external_id = s.campaign_ext
      left join public.ad_sets st on st.campaign_id = c.id and st.external_id = s.adset_ext
    on conflict (campaign_id, external_id) do update set
      ad_set_id = excluded.ad_set_id, creative_id = excluded.creative_id, name = excluded.name, format = excluded.format,
      headline = excluded.headline, body = excluded.body, image_url = excluded.image_url, thumbnail_url = excluded.thumbnail_url,
      media = excluded.media, video_id = excluded.video_id, video_url = excluded.video_url, cta = excluded.cta,
      link_url = excluded.link_url, preview_url = excluded.preview_url, permalink_url = excluded.permalink_url,
      active = excluded.active, effective_status = excluded.effective_status, impressions = excluded.impressions,
      reach = excluded.reach, clicks = excluded.clicks, spend = excluded.spend, conversions = excluded.conversions,
      metrics_30d = excluded.metrics_30d, row_hash = excluded.row_hash, updated_at = now()
    where public.creatives.row_hash is distinct from excluded.row_hash
    returning 1
  )
  select count(*) into n_a from up;

  -- ===== Anúncios (só métricas — modo métricas) =====
  with src as (
    select * from jsonb_to_recordset(coalesce(p -> 'ad_metrics', '[]')) as x(
      external_id text, impressions bigint, reach bigint, clicks bigint, spend numeric, conversions numeric, metrics_30d jsonb)
  ), upd as (
    update public.creatives a set impressions = s.impressions, reach = s.reach, clicks = s.clicks, spend = s.spend,
                                  conversions = s.conversions, metrics_30d = s.metrics_30d, updated_at = now()
      from src s, public.campaigns c
     where c.ad_account_id = p_account and a.campaign_id = c.id and a.external_id = s.external_id
       and (a.impressions, a.reach, a.clicks, a.spend, a.conversions) is distinct from (s.impressions, s.reach, s.clicks, s.spend, s.conversions)
    returning 1
  )
  select count(*) into n from upd;
  n_a := n_a + n;

  -- ===== Métricas diárias (só os dias que mudaram) =====
  with src as (
    select * from jsonb_to_recordset(coalesce(p -> 'daily', '[]')) as x(
      campaign_ext text, date date, spend numeric, impressions bigint, reach bigint, clicks bigint, conversions numeric, revenue numeric)
  ), up as (
    insert into public.campaign_daily (campaign_id, agency_id, date, spend, impressions, reach, clicks, conversions, revenue)
    select c.id, v_agency, s.date, s.spend, s.impressions, s.reach, s.clicks, s.conversions, s.revenue
      from src s join public.campaigns c on c.ad_account_id = p_account and c.external_id = s.campaign_ext
    on conflict (campaign_id, date) do update set
      spend = excluded.spend, impressions = excluded.impressions, reach = excluded.reach, clicks = excluded.clicks,
      conversions = excluded.conversions, revenue = excluded.revenue
    where (public.campaign_daily.spend, public.campaign_daily.impressions, public.campaign_daily.reach, public.campaign_daily.clicks,
           public.campaign_daily.conversions, public.campaign_daily.revenue)
          is distinct from (excluded.spend, excluded.impressions, excluded.reach, excluded.clicks, excluded.conversions, excluded.revenue)
    returning 1
  )
  select count(*) into n_d from up;

  -- ===== Conta: uma única atualização =====
  update public.ad_accounts set
    last_synced_at         = now(),
    last_error             = null,
    account_status         = coalesce((p -> 'account' ->> 'account_status')::int, account_status),
    last_full_sync_at      = coalesce((p -> 'account' ->> 'last_full_sync_at')::timestamptz, last_full_sync_at),
    last_daily_full_at     = coalesce((p -> 'account' ->> 'last_daily_full_at')::timestamptz, last_daily_full_at),
    history_backfilled_at  = coalesce((p -> 'account' ->> 'history_backfilled_at')::timestamptz, history_backfilled_at),
    last_structure_sync_at = coalesce((p -> 'account' ->> 'last_structure_sync_at')::timestamptz, last_structure_sync_at),
    structure_sig          = coalesce(p -> 'account' ->> 'structure_sig', structure_sig)
  where id = p_account;

  return jsonb_build_object('campaigns', n_c, 'adsets', n_s, 'ads', n_a, 'daily', n_d);
end $$;

-- ---------- Travas de várias agências numa chamada ----------
create or replace function public.try_sync_locks(p_agencies uuid[], p_seconds int, p_manual boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a uuid; r text; ok jsonb := '[]'; blocked jsonb := '[]';
begin
  foreach a in array coalesce(p_agencies, '{}') loop
    r := public.try_sync_lock(a, p_seconds, p_manual);
    if r = 'ok' then ok := ok || to_jsonb(a); else blocked := blocked || jsonb_build_object('agency', a, 'reason', r); end if;
  end loop;
  return jsonb_build_object('ok', ok, 'blocked', blocked);
end $$;

create or replace function public.release_sync_locks(p_agencies uuid[])
returns void language sql security definer set search_path = public as $$
  update public.sync_locks set locked_until = now() where agency_id = any(p_agencies);
$$;

-- ---------- Plano de envio ao CRM numa chamada ----------
create or replace function public.dispatch_plan(p_agency uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with d as (select * from public.destinations where agency_id = p_agency and active and url <> '')
  select jsonb_build_object(
    'dests', coalesce((select jsonb_agg(to_jsonb(d)) from d), '[]'::jsonb),
    'sendable', coalesce((
      select jsonb_agg(a.id) from public.ad_accounts a left join public.clients c on c.id = a.client_id
       where a.agency_id = p_agency and (a.platform = 'manual' or a.sync_enabled) and (a.client_id is null or c.active)), '[]'::jsonb),
    'states', coalesce((
      select jsonb_agg(jsonb_build_object('destination_id', s.destination_id, 'ad_account_id', s.ad_account_id, 'sent_at', s.sent_at, 'hash', s.hash))
        from public.destination_state s where s.destination_id in (select id from d)), '[]'::jsonb))
$$;

-- ---------- Registro de um envio (log + "já enviado") numa chamada ----------
create or replace function public.record_delivery(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.deliveries (agency_id, destination_id, event, ad_account, items, status, ok, duration_ms, error)
  values ((p ->> 'agency_id')::uuid, (p ->> 'destination_id')::uuid, p ->> 'event', p ->> 'ad_account', coalesce((p ->> 'items')::int, 0),
          (p ->> 'status')::int, coalesce((p ->> 'ok')::boolean, false), (p ->> 'duration_ms')::int, p ->> 'error');
  if coalesce((p ->> 'ok')::boolean, false) and p ? 'state_account' then
    insert into public.destination_state (destination_id, ad_account_id, agency_id, hash, sent_at)
    values ((p ->> 'destination_id')::uuid, (p ->> 'state_account')::uuid, (p ->> 'agency_id')::uuid, p ->> 'hash', now())
    on conflict (destination_id, ad_account_id) do update set hash = excluded.hash, sent_at = now();
  end if;
end $$;

-- ---------- Dados para montar o pacote do CRM (e a prévia do destino) numa chamada ----------
-- SECURITY INVOKER: chamada pela tela do gestor respeita as regras de segurança; o servidor (chave secreta) vê tudo.
create or replace function public.snapshot_data(p_agency uuid, p_accounts uuid[] default null, p_since date default null,
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
    'daily', case when p_with_daily then coalesce((
      select jsonb_agg(to_jsonb(x) order by x.date) from (
        select campaign_id, date, spend, impressions, reach, clicks, conversions, revenue
          from public.campaign_daily
         where campaign_id in (select id from camp)
           and (p_since is null or date >= p_since) and (p_until is null or date <= p_until)) x), '[]'::jsonb)
      else '[]'::jsonb end
  )
$$;

-- ---------- Permissões: só o servidor chama as funções internas ----------
do $$
declare f text;
begin
  foreach f in array array[
    'sync_account_state(uuid, text)', 'sync_apply_account(uuid, jsonb)', 'try_sync_locks(uuid[], int, boolean)',
    'release_sync_locks(uuid[])', 'dispatch_plan(uuid)', 'record_delivery(jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
revoke all on function public.snapshot_data(uuid, uuid[], date, date, boolean) from public, anon;
grant execute on function public.snapshot_data(uuid, uuid[], date, date, boolean) to authenticated, service_role;
