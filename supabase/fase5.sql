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

-- =====================================================================
--  Fase 5b: correções de sincronização, clientes ativos/inativos,
--  campanhas manuais, preferências e upload de criativos
-- =====================================================================

-- ---------- Contas: status na Meta e contas "manuais" ----------
alter table public.ad_accounts add column if not exists account_status integer;
alter table public.ad_accounts drop constraint if exists ad_accounts_platform_check;
alter table public.ad_accounts add constraint ad_accounts_platform_check check (platform in ('meta','google','manual'));
-- Correção: contas com pagamento pendente / carência também devem sincronizar
update public.ad_accounts set sync_enabled = true where platform = 'meta' and last_synced_at is null;

-- ---------- Clientes: ativo/inativo ----------
alter table public.clients add column if not exists active boolean not null default true;
alter table public.clients add column if not exists notes  text not null default '';

-- ---------- Campanhas manuais ----------
alter table public.campaigns add column if not exists source       text not null default 'api';
alter table public.campaigns add column if not exists result_label text not null default '';
alter table public.campaigns add column if not exists notes        text not null default '';
alter table public.ad_sets   add column if not exists audience_notes text not null default '';
alter table public.creatives add column if not exists media jsonb not null default '[]'::jsonb;

create table if not exists public.manual_entries (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  period      text not null check (period in ('day','week','month')),
  start_date  date not null,
  end_date    date not null,
  spend       numeric not null default 0,
  impressions bigint  not null default 0,
  reach       bigint  not null default 0,
  clicks      bigint  not null default 0,
  results     numeric not null default 0,
  revenue     numeric not null default 0,
  notes       text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists idx_manual_entries_campaign on public.manual_entries(campaign_id);
alter table public.manual_entries enable row level security;
drop policy if exists manual_entries_rw on public.manual_entries;
create policy manual_entries_rw on public.manual_entries for all
  using (agency_id = public.my_agency_id() or public.is_super_admin())
  with check (agency_id = public.my_agency_id());

-- ---------- Preferências de cada gestor ----------
create table if not exists public.user_preferences (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  prefs      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_preferences enable row level security;
drop policy if exists user_preferences_rw on public.user_preferences;
create policy user_preferences_rw on public.user_preferences for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Upload de criativos (Storage) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('creatives', 'creatives', true, 52428800)
on conflict (id) do nothing;

drop policy if exists creatives_upload on storage.objects;
create policy creatives_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'creatives' and (storage.foldername(name))[1] = public.my_agency_id()::text);
drop policy if exists creatives_update on storage.objects;
create policy creatives_update on storage.objects for update to authenticated
  using (bucket_id = 'creatives' and (storage.foldername(name))[1] = public.my_agency_id()::text);
drop policy if exists creatives_delete on storage.objects;
create policy creatives_delete on storage.objects for delete to authenticated
  using (bucket_id = 'creatives' and (storage.foldername(name))[1] = public.my_agency_id()::text);
