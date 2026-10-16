-- Laboratório de carga: cria uma agência TEMPORÁRIA no tamanho da meta (20 clientes,
-- 2.000 campanhas ativas + 8.000 inativas, 90 dias de histórico) para medir as telas.
-- As contas são do tipo "manual": aparecem nas telas, mas NÃO sincronizam com a Meta e não há destinos (nada vai ao CRM).
-- Uso:  node scripts/supa.mjs -f scripts/lab-carga.sql        (cria)
--       node scripts/supa.mjs "delete from agencies where name = 'LAB CARGA (apagar)'"   (apaga tudo em cascata)

do $$
declare
  ag uuid;
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  img text := 'https://scontent.xx.fbcdn.net/v/t45.1600-4/' || repeat('x', 560) || '.jpg';
begin
  delete from agencies where name = 'LAB CARGA (apagar)';
  insert into agencies (name) values ('LAB CARGA (apagar)') returning id into ag;

  insert into clients (agency_id, name, segment)
  select ag, 'Cliente Lab ' || lpad(i::text, 2, '0'), (array['Saúde', 'Educação', 'Varejo', 'Imóveis'])[1 + i % 4]
  from generate_series(1, 20) i;

  insert into ad_accounts (agency_id, client_id, platform, external_id, name, sync_enabled)
  select ag, c.id, 'manual', 'lab-' || c.id, 'Conta ' || c.name, false
  from clients c where c.agency_id = ag;

  -- 10.000 campanhas: as 2.000 primeiras ativas
  insert into campaigns (agency_id, ad_account_id, platform, external_id, name, objective, status, source, daily_budget, reach_30d)
  select ag, a.id, case when i % 5 = 0 then 'google' else 'meta' end, 'lab-c-' || i,
    'Campanha ' || i || ' [' || (array['Leads', 'Vendas', 'Reconhecimento', 'Tráfego'])[1 + i % 4] || '] ' || (array['São Paulo', 'Natal', 'Recife', 'Saúde Família', 'Promoção'])[1 + i % 5],
    'OUTCOME_LEADS', case when i <= 2000 then (case when i % 10 = 0 then 'learning' else 'active' end) else (case when i % 3 = 0 then 'ended' else 'paused' end) end,
    case when i % 25 = 0 then 'manual' else 'api' end, 50 + i % 200, 1000 + i * 3
  from generate_series(1, 10000) i
  join lateral (select id from ad_accounts where agency_id = ag order by external_id offset (i % 20) limit 1) a on true;

  -- 2 conjuntos por campanha
  insert into ad_sets (agency_id, campaign_id, external_id, name, effective_status)
  select ag, c.id, c.external_id || '-s' || k, 'Público ' || (array['Mulheres 25-45', 'Homens 30-55', 'Lookalike 1%', 'Remarketing'])[1 + (k + length(c.name)) % 4],
    case when c.status in ('active', 'learning') then 'ACTIVE' else 'PAUSED' end
  from campaigns c cross join generate_series(1, 2) k where c.agency_id = ag;

  -- anúncios: 4 por campanha ativa, 1 por inativa
  insert into creatives (agency_id, campaign_id, ad_set_id, external_id, name, format, headline, body, image_url, active, impressions, clicks, spend, conversions)
  select ag, c.id, s.id, c.external_id || '-a' || k, 'Anúncio ' || k || ' ' || (array['Vídeo depoimento', 'Carrossel ofertas', 'Imagem promoção', 'Reels bastidores'])[1 + k % 4],
    (array['video', 'carousel', 'image', 'image'])[1 + k % 4], 'Título ' || k, repeat('Texto do anúncio. ', 20), img,
    c.status in ('active', 'learning'), 1000 * k, 30 * k, 40.5 * k, k
  from campaigns c
  join lateral (select id from ad_sets where campaign_id = c.id order by external_id limit 1) s on true
  cross join generate_series(1, 4) k
  where c.agency_id = ag and (k = 1 or c.status in ('active', 'learning'));

  -- 90 dias de histórico para as ativas; 20 dias antigos para 10% das inativas
  insert into campaign_daily (agency_id, campaign_id, date, spend, impressions, clicks, conversions, revenue)
  select ag, c.id, d::date, round((20 + (abs(hashtext(c.id::text || d::text)) % 300))::numeric / 3, 2),
    1000 + abs(hashtext(d::text || c.id::text)) % 5000, 10 + abs(hashtext(c.id::text)) % 90, abs(hashtext(d::text)) % 4,
    case when c.name like '%Vendas%' then round((abs(hashtext(c.id::text || 'r' || d::text)) % 900)::numeric, 2) else 0 end
  from campaigns c
  cross join generate_series(today - 89, today, interval '1 day') d
  where c.agency_id = ag and c.status in ('active', 'learning');

  insert into campaign_daily (agency_id, campaign_id, date, spend, impressions, clicks, conversions, revenue)
  select ag, c.id, d::date, 15, 800, 9, 1, 0
  from campaigns c
  cross join generate_series(today - 80, today - 61, interval '1 day') d
  where c.agency_id = ag and c.status in ('paused', 'ended') and c.external_id like '%0';
end $$;

select
  (select count(*) from campaigns c join agencies g on g.id = c.agency_id where g.name = 'LAB CARGA (apagar)') as campanhas,
  (select count(*) from campaign_daily d join agencies g on g.id = d.agency_id where g.name = 'LAB CARGA (apagar)') as dias,
  (select count(*) from creatives r join agencies g on g.id = r.agency_id where g.name = 'LAB CARGA (apagar)') as anuncios,
  (select count(*) from ad_sets s join agencies g on g.id = s.agency_id where g.name = 'LAB CARGA (apagar)') as conjuntos;
