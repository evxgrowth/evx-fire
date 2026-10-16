-- Etapa de escala das telas: cada tela recebe do banco só o resultado pronto para o filtro e o período.
-- Antes: o navegador recebia a base inteira (todas as campanhas, dias e anúncios) e calculava sozinho.
-- Agora: o banco filtra e soma; o servidor guarda em cache por agência (limpo por evento).
-- As regras de filtro são as mesmas de lib/data.ts (filterCampaigns); a equivalência é testada
-- por scripts/verify-views.mts contra o cálculo antigo.

create extension if not exists unaccent schema extensions;

-- Normaliza texto como o painel: sem acento e minúsculo
create or replace function public.f_norm(t text)
returns text language sql immutable parallel safe
set search_path = ''
as $$ select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, ''))) $$;

drop function if exists public.fire_hits(text, text[]);

-- Nomes já normalizados, guardados pelo próprio banco (colunas calculadas): a busca por texto
-- não precisa tirar acento de milhares de nomes a cada consulta.
alter table public.campaigns add column if not exists name_norm text generated always as (public.f_norm(name)) stored;
alter table public.ad_sets add column if not exists name_norm text generated always as (public.f_norm(name)) stored;
alter table public.creatives add column if not exists name_norm text generated always as (public.f_norm(name)) stored;
alter table public.creatives add column if not exists headline_norm text generated always as (public.f_norm(headline)) stored;

-- Campanhas visíveis que passam nos filtros, com os anúncios (criativos) que continuam valendo.
-- Mesma lógica de filterCampaigns (lib/data.ts):
--  plataforma, clientes, status, origem; "contém" e "não contém" por nível (qualquer, campanha, conjunto, anúncio).
-- Dois caminhos: sem termos de texto (o mais comum) é uma consulta direta; com termos, o texto é
-- normalizado uma vez por linha e comparado em uma passada (agrupando por campanha).
create or replace function public.fire_match(p_agency uuid, p_client uuid, f jsonb)
returns table (cid uuid, client_id uuid, crs uuid[])
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_platform text := coalesce(nullif(f->>'platform', ''), 'all');
  v_clients text[] := array(select jsonb_array_elements_text(coalesce(f->'clients', '[]'::jsonb)));
  v_statuses text[] := array(select jsonb_array_elements_text(coalesce(f->'statuses', '[]'::jsonb)));
  v_sources text[] := array(select jsonb_array_elements_text(coalesce(f->'sources', '[]'::jsonb)));
  v_inc text[] := array(select public.f_norm(btrim(x)) from jsonb_array_elements_text(coalesce(f->'include', '[]'::jsonb)) x where btrim(x) <> '');
  v_exc text[] := array(select public.f_norm(btrim(x)) from jsonb_array_elements_text(coalesce(f->'exclude', '[]'::jsonb)) x where btrim(x) <> '');
  v_scope text := coalesce(nullif(f->>'scope', ''), 'any');
  v_only text := nullif(f->>'clientId', '');
  n_inc int;
  n_exc int;
begin
  n_inc := cardinality(v_inc);
  n_exc := cardinality(v_exc);

  if n_inc = 0 and n_exc = 0 then
    return query
    with acc as (
      select a.id, a.client_id
      from ad_accounts a
      left join clients cl on cl.id = a.client_id
      where a.agency_id = p_agency
        and (p_client is null or a.client_id = p_client)
        and (a.platform = 'manual' or a.sync_enabled)
        and (a.client_id is null or coalesce(cl.active, true))
        and (v_only is null or a.client_id::text = v_only)
        and (cardinality(v_clients) = 0 or a.client_id::text = any (v_clients))
    ),
    camp as (
      select c.id, acc.client_id
      from campaigns c join acc on acc.id = c.ad_account_id
      where (v_platform = 'all' or c.platform = v_platform)
        and (cardinality(v_statuses) = 0 or c.status = any (v_statuses))
        and (cardinality(v_sources) = 0 or coalesce(c.source, 'api') = any (v_sources))
    ),
    cra as (
      select r.campaign_id, array_agg(r.id) as crs
      from creatives r join camp on camp.id = r.campaign_id
      group by r.campaign_id
    )
    select camp.id, camp.client_id, coalesce(cra.crs, '{}'::uuid[])
    from camp left join cra on cra.campaign_id = camp.id;
    return;
  end if;

  return query
  with acc as (
    select a.id, a.client_id
    from ad_accounts a
    left join clients cl on cl.id = a.client_id
    where a.agency_id = p_agency
      and (p_client is null or a.client_id = p_client)
      and (a.platform = 'manual' or a.sync_enabled)
      and (a.client_id is null or coalesce(cl.active, true))
      and (v_only is null or a.client_id::text = v_only)
      and (cardinality(v_clients) = 0 or a.client_id::text = any (v_clients))
  ),
  camp as (
    select c.id, acc.client_id, c.name_norm || ' ' || c.id::text as ctext
    from campaigns c join acc on acc.id = c.ad_account_id
    where (v_platform = 'all' or c.platform = v_platform)
      and (cardinality(v_statuses) = 0 or c.status = any (v_statuses))
      and (cardinality(v_sources) = 0 or coalesce(c.source, 'api') = any (v_sources))
  ),
  st as (
    select s.id, s.campaign_id, s.name_norm as stext
    from ad_sets s join camp on camp.id = s.campaign_id
  ),
  stf as (
    select st.id, st.campaign_id,
      exists (select 1 from unnest(v_inc) x where strpos(st.stext, x) > 0) as s_inc,
      exists (select 1 from unnest(v_exc) x where strpos(st.stext, x) > 0) as s_exc
    from st
  ),
  sfa as (
    select stf.campaign_id, bool_or(stf.s_inc) as any_set_inc
    from stf group by stf.campaign_id
  ),
  cf as (
    select camp.id, camp.client_id,
      exists (select 1 from unnest(v_inc) x where strpos(camp.ctext, x) > 0) as c_inc,
      exists (select 1 from unnest(v_exc) x where strpos(camp.ctext, x) > 0) as c_exc,
      coalesce(sfa.any_set_inc, false) as any_set_inc
    from camp left join sfa on sfa.campaign_id = camp.id
  ),
  crf as (
    select r.id, r.campaign_id,
      exists (select 1 from unnest(v_inc) x where strpos(t.atext, x) > 0) as a_inc,
      exists (select 1 from unnest(v_exc) x where strpos(t.atext, x) > 0) as a_exc,
      coalesce(stf.s_inc, false) as s_inc,
      coalesce(stf.s_exc, false) as s_exc
    from creatives r
    join camp on camp.id = r.campaign_id
    left join stf on stf.id = r.ad_set_id and stf.campaign_id = r.campaign_id
    -- mesmo texto do painel: nome + título (ou o nome, se não houver título) + id
    cross join lateral (select r.name_norm || ' ' || coalesce(nullif(r.headline_norm, ''), r.name_norm) || ' ' || r.id::text as atext) t
  ),
  crk as (
    select crf.campaign_id, crf.id, crf.a_inc, crf.s_inc,
      (n_inc = 0 or case v_scope
          when 'campaign' then true
          when 'adset' then crf.s_inc
          when 'ad' then crf.a_inc
          else cf.c_inc or crf.a_inc or crf.s_inc
        end)
      and (n_exc = 0 or (
          (v_scope not in ('adset', 'any') or not crf.s_exc)
          and (v_scope not in ('ad', 'any') or not crf.a_exc))) as keep_cr
    from crf join cf on cf.id = crf.campaign_id
  ),
  cra as (
    select crk.campaign_id, bool_or(crk.a_inc) as any_a, bool_or(crk.a_inc or crk.s_inc) as any_as,
      array_agg(crk.id) filter (where crk.keep_cr) as crs
    from crk
    group by crk.campaign_id
  )
  select cf.id, cf.client_id, coalesce(cra.crs, '{}'::uuid[])
  from cf
  left join cra on cra.campaign_id = cf.id
  where (n_inc = 0 or case v_scope
      when 'campaign' then cf.c_inc
      when 'adset' then cf.any_set_inc
      when 'ad' then coalesce(cra.any_a, false)
      else cf.c_inc or cf.any_set_inc or coalesce(cra.any_as, false)
    end)
    and not (n_exc > 0 and v_scope in ('campaign', 'any') and cf.c_exc);
end;
$$;

-- Anúncio no formato enviado às telas (mesmas chaves do formato compacto + campanha)
create or replace function public.fire_creative_json(r creatives, camp_name text, camp_platform text)
returns jsonb language sql immutable
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', r.id, 'c', r.campaign_id, 's', r.ad_set_id, 'n', r.name, 'f', r.format, 'h', nullif(r.headline, ''), 'b', nullif(r.body, ''),
    'img', r.image_url, 'vid', r.video_url, 'cta', r.cta,
    'm', case when jsonb_array_length(coalesce(r.media, '[]'::jsonb)) > 0 then r.media end,
    'a', r.active, 'i', r.impressions, 'k', r.clicks, 'sp', r.spend, 'cv', r.conversions,
    'cn', camp_name, 'cp', camp_platform))
$$;

/**
 * Dados prontos de uma tela.
 * a = { view, filters, since, until, days, prev_since, prev_until, prev_days, hist_since, limit, top, search, state, id }
 * Datas calculadas pelo servidor (fuso de São Paulo). Visões: dashboard, report, campaigns, creatives, clients, campaign.
 */
create or replace function public.fire_view(p_agency uuid, p_client uuid, a jsonb)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v text := a->>'view';
  f jsonb := coalesce(a->'filters', '{}'::jsonb);
  d_since date := (a->>'since')::date;
  d_until date := (a->>'until')::date;
  d_days int := coalesce((a->>'days')::int, 1);
  pv_since date := (a->>'prev_since')::date;
  pv_until date := (a->>'prev_until')::date;
  pv_days int := coalesce((a->>'prev_days')::int, 1);
  h_since date := (a->>'hist_since')::date;
  lim int := greatest(1, least(coalesce((a->>'limit')::int, 50), 2000));
  top_n int := greatest(0, least(coalesce((a->>'top')::int, 4), 60));
  q text := public.f_norm(btrim(coalesce(a->>'search', '')));
  st text := coalesce(nullif(a->>'state', ''), 'all');
  res jsonb;
begin
  if exists (select 1 from agencies g where g.id = p_agency and g.status = 'suspended') then
    return null;
  end if;

  if v in ('dashboard', 'report') then
    with m as (select * from public.fire_match(p_agency, p_client, f)),
    c as (
      select c.id, c.name, c.platform, coalesce(c.source, 'api') as source, c.status, c.objective, m.client_id, c.reach_30d as reach, m.crs,
        exists (select 1 from campaign_daily d where d.campaign_id = c.id and d.date >= h_since) as hist
      from m join campaigns c on c.id = m.cid
    ),
    per as (
      select d.campaign_id, sum(d.spend) as spend, sum(d.impressions) as impressions, sum(d.clicks) as clicks, sum(d.conversions) as conversions, sum(d.revenue) as revenue
      from campaign_daily d join c on c.id = d.campaign_id
      where d.date between d_since and d_until
      group by 1
    ),
    prev as (
      select sum(d.spend) as spend, sum(d.impressions) as impressions, sum(d.clicks) as clicks, sum(d.conversions) as conversions, sum(d.revenue) as revenue
      from campaign_daily d join c on c.id = d.campaign_id
      where d.date between pv_since and pv_until
    ),
    r as (
      select c.*, coalesce(per.spend, 0) as spend, coalesce(per.impressions, 0) as impressions, coalesce(per.clicks, 0) as clicks,
        coalesce(per.conversions, 0) as conversions, coalesce(per.revenue, 0) as revenue
      from c left join per on per.campaign_id = c.id
    ),
    tbl as (select * from r where r.spend > 0 or r.status = 'active'),
    daily as (
      select d.date, c.platform, sum(d.spend) as spend, sum(d.revenue) as revenue, sum(d.conversions) as conversions, sum(d.clicks) as clicks, sum(d.impressions) as impressions
      from campaign_daily d join c on c.id = d.campaign_id
      where d.date between d_since and d_until
      group by 1, 2
    ),
    row_json as (
      select r.id, jsonb_build_object('id', r.id, 'name', r.name, 'platform', r.platform, 'source', r.source, 'status', r.status, 'objective', r.objective,
        'clientId', r.client_id, 'spend', r.spend, 'impressions', r.impressions, 'clicks', r.clicks, 'conversions', r.conversions, 'revenue', r.revenue) as j
      from r
    )
    select jsonb_build_object(
      'count', (select count(*) from r),
      'running', (select count(*) from r where r.status in ('active', 'learning')),
      'activeOnly', (select count(*) from r where r.status = 'active'),
      'totals', (select jsonb_build_object('spend', coalesce(sum(spend), 0), 'impressions', coalesce(sum(impressions), 0), 'clicks', coalesce(sum(clicks), 0),
          'conversions', coalesce(sum(conversions), 0), 'revenue', coalesce(sum(revenue), 0),
          'reach', coalesce(sum(reach), 0) * case when bool_or(hist) then least(1, d_days / 30.0) else 1 end) from r),
      -- comparação só se o período anterior inteiro estiver dentro do histórico carregado (90 dias) e houver histórico
      'prev', case when pv_since is not null and pv_since >= h_since
          and exists (select 1 from public.fire_match(p_agency, p_client, '{}'::jsonb) vm join campaign_daily d on d.campaign_id = vm.cid where d.date >= h_since)
        then (select jsonb_build_object('spend', coalesce(prev.spend, 0), 'impressions', coalesce(prev.impressions, 0), 'clicks', coalesce(prev.clicks, 0),
            'conversions', coalesce(prev.conversions, 0), 'revenue', coalesce(prev.revenue, 0),
            'reach', (select coalesce(sum(reach), 0) from r) * least(1, pv_days / 30.0)) from prev)
        end,
      'series', case when exists (select 1 from r where r.hist) then (
          select coalesce(jsonb_agg(jsonb_build_object('date', to_char(g.day, 'YYYY-MM-DD'),
              'meta', coalesce((select sum(spend) from daily where daily.date = g.day and daily.platform = 'meta'), 0),
              'google', coalesce((select sum(spend) from daily where daily.date = g.day and daily.platform = 'google'), 0),
              'revenue', coalesce((select sum(revenue) from daily where daily.date = g.day), 0),
              'conversions', coalesce((select sum(conversions) from daily where daily.date = g.day), 0),
              'clicks', coalesce((select sum(clicks) from daily where daily.date = g.day), 0),
              'impressions', coalesce((select sum(impressions) from daily where daily.date = g.day), 0)) order by g.day), '[]'::jsonb)
          from generate_series(d_since, d_until, interval '1 day') as g(day)) else '[]'::jsonb end,
      'metaSpend', (select coalesce(sum(spend), 0) from r where r.platform = 'meta'),
      'googleSpend', (select coalesce(sum(spend), 0) from r where r.platform = 'google'),
      'tableTotal', (select count(*) from tbl),
      'table', coalesce((select jsonb_agg(rj.j order by t.spend desc, t.id) from (select * from tbl order by spend desc, id limit lim) t join row_json rj on rj.id = t.id), '[]'::jsonb),
      'best', (select rj.j from tbl t join row_json rj on rj.id = t.id where t.conversions > 0 order by t.spend / t.conversions, t.spend desc, t.id limit 1),
      'most', (select rj.j from tbl t join row_json rj on rj.id = t.id order by t.conversions desc, t.spend desc, t.id limit 1),
      'creatives', coalesce((
        select jsonb_agg(public.fire_creative_json(x.cr, x.name, x.platform) order by (x.cr).conversions desc, (x.cr).spend desc, (x.cr).id)
        from (
          select cr, c.name, c.platform from c join creatives cr on cr.id = any (c.crs)
          order by cr.conversions desc, cr.spend desc, cr.id limit top_n
        ) x), '[]'::jsonb)
    ) into res;
    return res;
  end if;

  if v = 'campaigns' then
    with m as (select * from public.fire_match(p_agency, p_client, f)),
    c as (
      select c.id, c.name, c.platform, coalesce(c.source, 'api') as source, c.status, c.objective, m.client_id, m.crs
      from m join campaigns c on c.id = m.cid
      where q = ''
        or strpos(c.name_norm, q) > 0
        or strpos(c.id::text, q) > 0
        or exists (select 1 from ad_sets s where s.campaign_id = c.id and strpos(s.name_norm, q) > 0)
        or exists (select 1 from creatives cr where cr.id = any (m.crs) and strpos(cr.name_norm, q) > 0)
    ),
    per as (
      select d.campaign_id, sum(d.spend) as spend, sum(d.impressions) as impressions, sum(d.clicks) as clicks, sum(d.conversions) as conversions, sum(d.revenue) as revenue
      from campaign_daily d join c on c.id = d.campaign_id
      where d.date between d_since and d_until
      group by 1
    ),
    r as (
      select c.*, coalesce(per.spend, 0) as spend, coalesce(per.impressions, 0) as impressions, coalesce(per.clicks, 0) as clicks,
        coalesce(per.conversions, 0) as conversions, coalesce(per.revenue, 0) as revenue
      from c left join per on per.campaign_id = c.id
    )
    select jsonb_build_object(
      'count', (select count(*) from r),
      'active', (select count(*) from r where r.status = 'active'),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'platform', t.platform, 'source', t.source, 'status', t.status, 'objective', t.objective,
          'clientId', t.client_id, 'spend', t.spend, 'impressions', t.impressions, 'clicks', t.clicks, 'conversions', t.conversions, 'revenue', t.revenue)
          order by t.spend desc, t.id)
        from (select * from r order by spend desc, id limit lim) t), '[]'::jsonb)
    ) into res;
    return res;
  end if;

  if v = 'creatives' then
    with m as (select * from public.fire_match(p_agency, p_client, f)),
    x as (
      select cr, c.name, c.platform
      from m join campaigns c on c.id = m.cid
      join creatives cr on cr.id = any (m.crs)
      where (st = 'all' or cr.active = (st = 'active'))
        and (q = '' or strpos(cr.name_norm || ' ' || coalesce(nullif(cr.headline_norm, ''), cr.name_norm) || ' ' || c.name_norm, q) > 0)
    )
    select jsonb_build_object(
      'count', (select count(*) from x),
      'rows', coalesce((
        select jsonb_agg(public.fire_creative_json(y.cr, y.name, y.platform) order by (y.cr).conversions desc, (y.cr).spend desc, (y.cr).id)
        from (select * from x order by (x.cr).conversions desc, (x.cr).spend desc, (x.cr).id limit lim) y), '[]'::jsonb)
    ) into res;
    return res;
  end if;

  if v = 'clients' then
    -- por cliente, no período informado (a tela de clientes usa "Este mês")
    with m as (select * from public.fire_match(p_agency, p_client, '{}'::jsonb)),
    c as (select c.id, c.status, coalesce(c.source, 'api') as source, m.client_id from m join campaigns c on c.id = m.cid where m.client_id is not null),
    per as (
      select d.campaign_id, sum(d.spend) as spend, sum(d.conversions) as conversions, sum(d.revenue) as revenue
      from campaign_daily d join c on c.id = d.campaign_id
      where d.date between d_since and d_until
      group by 1
    )
    select coalesce(jsonb_object_agg(k.client_id, k.j), '{}'::jsonb) into res
    from (
      select c.client_id, jsonb_build_object(
        'spend', coalesce(sum(per.spend), 0), 'conversions', coalesce(sum(per.conversions), 0), 'revenue', coalesce(sum(per.revenue), 0),
        'running', count(*) filter (where c.status in ('active', 'learning')),
        'manual', count(*) filter (where c.source = 'manual'),
        'count', count(*)) as j
      from c left join per on per.campaign_id = c.id
      group by c.client_id
    ) k;
    return jsonb_build_object('stats', res);
  end if;

  if v = 'campaign' then
    -- detalhe de uma campanha visível: histórico inteiro carregado (90 dias)
    with m as (select * from public.fire_match(p_agency, p_client, '{}'::jsonb) where cid = (a->>'id')::uuid),
    c as (
      select c.*, m.client_id, cl.name as client_name,
        exists (select 1 from campaign_daily d where d.campaign_id = c.id and d.date >= h_since) as hist
      from m join campaigns c on c.id = m.cid left join clients cl on cl.id = m.client_id
    ),
    dd as (select d.* from campaign_daily d join c on c.id = d.campaign_id where d.date >= h_since and d.date <= d_until)
    select case when not exists (select 1 from c) then null else jsonb_build_object(
      'campaign', (select jsonb_build_object('id', c.id, 'name', c.name, 'platform', c.platform, 'source', coalesce(c.source, 'api'), 'status', c.status,
          'objective', c.objective, 'dailyBudget', c.daily_budget, 'clientId', c.client_id, 'clientName', c.client_name) from c),
      'totals', (select jsonb_build_object('spend', coalesce(sum(spend), 0), 'impressions', coalesce(sum(impressions), 0), 'clicks', coalesce(sum(clicks), 0),
          'conversions', coalesce(sum(conversions), 0), 'revenue', coalesce(sum(revenue), 0), 'reach', (select reach_30d from c)) from dd),
      'series', case when (select hist from c) then (
          select coalesce(jsonb_agg(jsonb_build_object('date', to_char(g.day, 'YYYY-MM-DD'),
              'meta', case when (select platform from c) = 'meta' then coalesce(dd.spend, 0) else 0 end,
              'google', case when (select platform from c) = 'google' then coalesce(dd.spend, 0) else 0 end,
              'revenue', coalesce(dd.revenue, 0), 'conversions', coalesce(dd.conversions, 0), 'clicks', coalesce(dd.clicks, 0), 'impressions', coalesce(dd.impressions, 0))
              order by g.day), '[]'::jsonb)
          from generate_series(h_since, d_until, interval '1 day') as g(day) left join dd on dd.date = g.day) else '[]'::jsonb end,
      'creatives', coalesce((
        select jsonb_agg(public.fire_creative_json(cr, c.name, c.platform) order by cr.conversions desc, cr.spend desc, cr.id)
        from c join creatives cr on cr.campaign_id = c.id), '[]'::jsonb)
    ) end into res;
    return res;
  end if;

  raise exception 'visão desconhecida: %', v;
end;
$$;

-- Base leve do layout: clientes, última sincronização e se há contas (nada de campanhas)
create or replace function public.gestor_base(p_agency uuid, p_client uuid default null)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with acc as (
    select a.client_id, a.platform, a.external_id, a.last_synced_at
    from ad_accounts a
    where a.agency_id = p_agency and (p_client is null or a.client_id = p_client)
  )
  select case when exists (select 1 from agencies g where g.id = p_agency and g.status = 'suspended') then null else jsonb_build_object(
    'has_accounts', exists (select 1 from acc),
    'last_sync', (select max(last_synced_at) from acc),
    'clients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cl.id, 'name', cl.name, 'segment', cl.segment, 'active', cl.active, 'notes', cl.notes,
        'meta', (select string_agg(external_id, ', ') from acc where acc.client_id = cl.id and acc.platform = 'meta'),
        'google', (select string_agg(external_id, ', ') from acc where acc.client_id = cl.id and acc.platform = 'google')
      ) order by cl.name)
      from clients cl where cl.agency_id = p_agency and (p_client is null or cl.id = p_client)), '[]'::jsonb)
  ) end
$$;

-- Índice para somar os dias por campanha dentro de um período sem ler a tabela inteira
-- (inclui o alcance: o pacote do CRM também lê só o índice, sem ir à tabela)
drop index if exists public.idx_daily_campaign_date_cover;
create index if not exists idx_daily_campaign_date_cover2 on public.campaign_daily (campaign_id, date)
  include (spend, impressions, reach, clicks, conversions, revenue);

revoke all on function public.fire_match(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fire_view(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.gestor_base(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fire_match(uuid, uuid, jsonb) to service_role;
grant execute on function public.fire_view(uuid, uuid, jsonb) to service_role;
grant execute on function public.gestor_base(uuid, uuid) to service_role;
