-- =====================================================================
--  EVX Fire — Fase 5: conjuntos de anúncios, dados completos e destinos (CRM/webhooks)
--  Supabase → SQL Editor → New query → cole TUDO → Run.
--  Pode rodar mais de uma vez sem problema.
-- =====================================================================

-- ---------- Campanhas: dados extras ----------
alter table public.campaigns add column if not exists effective_status text not null default '';
alter table public.campaigns add column if not exists objective_raw   text not null default '';
alter table public.campaigns add column if not exists bid_strategy    text not null default '';
alter table public.campaigns add column if not exists lifetime_budget numeric not null default 0;
alter table public.campaigns add column if not exists start_time      timestamptz;
alter table public.campaigns add column if not exists stop_time       timestamptz;
alter table public.campaigns add column if not exists metrics_30d     jsonb not null default '{}'::jsonb;

-- ---------- Conjuntos de anúncios ----------
create table if not exists public.ad_sets (
  id                uuid primary key default gen_random_uuid(),
  agency_id         uuid not null references public.agencies(id) on delete cascade,
  campaign_id       uuid not null references public.campaigns(id) on delete cascade,
  external_id       text not null,
  name              text not null default '',
  status            text not null default 'active',
  effective_status  text not null default '',
  daily_budget      numeric not null default 0,
  lifetime_budget   numeric not null default 0,
  optimization_goal text not null default '',
  billing_event     text not null default '',
  bid_strategy      text not null default '',
  promoted_object   jsonb,
  targeting         jsonb,
  start_time        timestamptz,
  end_time          timestamptz,
  metrics_30d       jsonb not null default '{}'::jsonb,
  updated_at        timestamptz not null default now(),
  unique (campaign_id, external_id)
);
create index if not exists idx_adsets_campaign on public.ad_sets(campaign_id);

-- ---------- Anúncios / criativos: dados extras ----------
alter table public.creatives add column if not exists ad_set_id        uuid references public.ad_sets(id) on delete set null;
alter table public.creatives add column if not exists effective_status text not null default '';
alter table public.creatives add column if not exists reach            bigint not null default 0;
alter table public.creatives add column if not exists metrics_30d      jsonb not null default '{}'::jsonb;
alter table public.creatives add column if not exists cta              text;
alter table public.creatives add column if not exists link_url         text;
alter table public.creatives add column if not exists thumbnail_url    text;
alter table public.creatives add column if not exists video_id         text;
alter table public.creatives add column if not exists video_url        text;
alter table public.creatives add column if not exists preview_url      text;
alter table public.creatives add column if not exists permalink_url    text;
alter table public.creatives add column if not exists creative_id      text;

-- ---------- Destinos (CRM / webhooks) ----------
create table if not exists public.destinations (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references public.agencies(id) on delete cascade,
  name           text not null default 'Meu CRM',
  url            text not null default '',
  secret         text not null,
  api_key_hash   text,
  api_key_prefix text,
  filters        jsonb not null default '{}'::jsonb,
  active         boolean not null default true,
  last_sent_at   timestamptz,
  last_status    integer,
  last_error     text,
  created_at     timestamptz not null default now()
);

create table if not exists public.deliveries (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references public.agencies(id) on delete cascade,
  destination_id uuid not null references public.destinations(id) on delete cascade,
  event          text not null,
  ad_account     text,
  items          integer not null default 0,
  status         integer,
  ok             boolean not null default false,
  duration_ms    integer,
  error          text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_deliveries_dest on public.deliveries(destination_id, created_at desc);

-- ---------- Segurança ----------
alter table public.ad_sets      enable row level security;
alter table public.destinations enable row level security;
alter table public.deliveries   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['ad_sets','destinations','deliveries'] loop
    execute format('drop policy if exists %1$s_rw on public.%1$s', t);
    execute format(
      'create policy %1$s_rw on public.%1$s for all using (agency_id = public.my_agency_id() or public.is_super_admin()) with check (agency_id = public.my_agency_id())',
      t);
  end loop;
end $$;
