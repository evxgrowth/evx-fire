-- =====================================================================
--  EVX Fire — Fase 6: sincronização econômica, histórico de 13 meses,
--  envio só do que mudou e índices para consultas rápidas
--  Supabase → SQL Editor → New query → cole TUDO → Run.
--  Pode rodar mais de uma vez sem problema.
-- =====================================================================

-- ---------- Controle da sincronização por conta ----------
alter table public.ad_accounts add column if not exists last_full_sync_at     timestamptz; -- última completa
alter table public.ad_accounts add column if not exists last_daily_full_at    timestamptz; -- últimos 90 dias
alter table public.ad_accounts add column if not exists history_backfilled_at timestamptz; -- histórico de 13 meses

-- ---------- O que já foi enviado a cada destino (para não reenviar igual) ----------
create table if not exists public.destination_state (
  destination_id uuid not null references public.destinations(id) on delete cascade,
  ad_account_id  uuid not null references public.ad_accounts(id) on delete cascade,
  agency_id      uuid not null references public.agencies(id) on delete cascade,
  hash           text not null,
  sent_at        timestamptz not null default now(),
  primary key (destination_id, ad_account_id)
);
alter table public.destination_state enable row level security;
drop policy if exists destination_state_rw on public.destination_state;
create policy destination_state_rw on public.destination_state for all
  using (agency_id = public.my_agency_id() or public.is_super_admin())
  with check (agency_id = public.my_agency_id());

-- ---------- Índices (atalhos de busca) ----------
create index if not exists idx_ad_accounts_agency   on public.ad_accounts(agency_id);
create index if not exists idx_clients_agency       on public.clients(agency_id);
create index if not exists idx_campaigns_account    on public.campaigns(ad_account_id);
create index if not exists idx_adsets_agency        on public.ad_sets(agency_id);
create index if not exists idx_creatives_agency     on public.creatives(agency_id);
create index if not exists idx_creatives_adset      on public.creatives(ad_set_id);
create index if not exists idx_share_links_agency   on public.share_links(agency_id);
create index if not exists idx_destinations_agency  on public.destinations(agency_id);
create index if not exists idx_deliveries_created   on public.deliveries(created_at);
create index if not exists idx_profiles_agency      on public.profiles(agency_id);
-- campaign_daily já tem (campaign_id, date) como chave e (agency_id, date) como índice

-- As funções de segurança são chamadas em toda consulta: marcá-las como estáveis ajuda o Postgres a reaproveitar o resultado
alter function public.my_agency_id() stable;
alter function public.is_super_admin() stable;
