-- =====================================================================
--  EVX Fire — estrutura do banco de dados
--  Como usar: Supabase → SQL Editor → New query → cole TUDO → Run.
--  Pode rodar mais de uma vez sem problema.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Agências (cada gestor pertence a uma) ----------
create table if not exists public.agencies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  plan        text not null default 'Pro' check (plan in ('Starter','Pro','Agency')),
  status      text not null default 'active' check (status in ('active','trial','suspended')),
  created_at  timestamptz not null default now()
);

-- ---------- Perfis (1 por usuário do Supabase Auth) ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  agency_id   uuid references public.agencies(id) on delete set null,
  full_name   text not null default '',
  email       text not null default '',
  role        text not null default 'manager' check (role in ('super_admin','manager')),
  last_seen_at timestamptz,
  created_at  timestamptz not null default now()
);

-- ---------- Clientes do gestor ----------
create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  name        text not null,
  segment     text not null default '',
  created_at  timestamptz not null default now()
);

-- ---------- Conexões OAuth (tokens) — só o servidor lê ----------
create table if not exists public.platform_connections (
  id               uuid primary key default gen_random_uuid(),
  agency_id        uuid not null references public.agencies(id) on delete cascade,
  platform         text not null check (platform in ('meta','google')),
  external_user_id text not null,
  external_user_name text not null default '',
  access_token     text not null,
  token_expires_at timestamptz,
  created_at       timestamptz not null default now(),
  unique (agency_id, platform, external_user_id)
);

-- ---------- Contas de anúncio ----------
create table if not exists public.ad_accounts (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references public.agencies(id) on delete cascade,
  connection_id  uuid references public.platform_connections(id) on delete set null,
  client_id      uuid references public.clients(id) on delete set null,
  platform       text not null check (platform in ('meta','google')),
  external_id    text not null,
  name           text not null default '',
  currency       text not null default 'BRL',
  sync_enabled   boolean not null default true,
  last_synced_at timestamptz,
  last_error     text,
  created_at     timestamptz not null default now(),
  unique (agency_id, platform, external_id)
);

-- ---------- Campanhas ----------
create table if not exists public.campaigns (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  ad_account_id uuid not null references public.ad_accounts(id) on delete cascade,
  platform      text not null,
  external_id   text not null,
  name          text not null default '',
  objective     text not null default '',
  status        text not null default 'active' check (status in ('active','learning','paused','ended')),
  daily_budget  numeric not null default 0,
  reach_30d     bigint not null default 0,
  updated_at    timestamptz not null default now(),
  unique (ad_account_id, external_id)
);

-- ---------- Métricas diárias por campanha ----------
create table if not exists public.campaign_daily (
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  agency_id    uuid not null references public.agencies(id) on delete cascade,
  date         date not null,
  spend        numeric not null default 0,
  impressions  bigint not null default 0,
  reach        bigint not null default 0,
  clicks       bigint not null default 0,
  conversions  numeric not null default 0,
  revenue      numeric not null default 0,
  primary key (campaign_id, date)
);

-- ---------- Criativos (1 por anúncio) ----------
create table if not exists public.creatives (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null references public.agencies(id) on delete cascade,
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  external_id  text not null,
  name         text not null default '',
  format       text not null default 'image',
  headline     text not null default '',
  body         text not null default '',
  image_url    text,
  active       boolean not null default true,
  impressions  bigint not null default 0,
  clicks       bigint not null default 0,
  spend        numeric not null default 0,
  conversions  numeric not null default 0,
  updated_at   timestamptz not null default now(),
  unique (campaign_id, external_id)
);

-- ---------- Links compartilháveis ----------
create table if not exists public.share_links (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references public.agencies(id) on delete cascade,
  client_id      uuid not null references public.clients(id) on delete cascade,
  token          text not null unique,
  label          text not null default '',
  show_revenue   boolean not null default true,
  show_creatives boolean not null default true,
  active         boolean not null default true,
  views          integer not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists idx_campaigns_agency on public.campaigns(agency_id);
create index if not exists idx_daily_agency_date on public.campaign_daily(agency_id, date);
create index if not exists idx_creatives_campaign on public.creatives(campaign_id);
create index if not exists idx_accounts_client on public.ad_accounts(client_id);

-- =====================================================================
--  Segurança: cada gestor só enxerga os dados da própria agência.
-- =====================================================================

create or replace function public.my_agency_id() returns uuid
language sql stable security definer set search_path = public as $$
  select agency_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'super_admin' from public.profiles where id = auth.uid()), false)
$$;

alter table public.agencies             enable row level security;
alter table public.profiles             enable row level security;
alter table public.clients              enable row level security;
alter table public.platform_connections enable row level security;
alter table public.ad_accounts          enable row level security;
alter table public.campaigns            enable row level security;
alter table public.campaign_daily       enable row level security;
alter table public.creatives            enable row level security;
alter table public.share_links          enable row level security;

-- Agências
drop policy if exists agencies_read on public.agencies;
create policy agencies_read on public.agencies for select
  using (id = public.my_agency_id() or public.is_super_admin());

-- Perfis
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select
  using (id = auth.uid() or agency_id = public.my_agency_id() or public.is_super_admin());

-- Tabelas da agência: ler e escrever só a própria
do $$
declare t text;
begin
  foreach t in array array['clients','ad_accounts','campaigns','campaign_daily','creatives','share_links'] loop
    execute format('drop policy if exists %1$s_rw on public.%1$s', t);
    execute format(
      'create policy %1$s_rw on public.%1$s for all using (agency_id = public.my_agency_id() or public.is_super_admin()) with check (agency_id = public.my_agency_id())',
      t);
  end loop;
end $$;

-- platform_connections: sem policy = nenhum usuário lê os tokens.
-- Apenas o servidor (chave secreta) acessa.

-- ---------- Resumo por agência (usado no painel do Super Admin) ----------
create or replace view public.agency_spend_30d with (security_invoker = true) as
  select agency_id, sum(spend) as spend
  from public.campaign_daily
  where date >= current_date - 30
  group by agency_id;
