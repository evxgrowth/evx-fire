-- =====================================================================
--  EVX Fire — Otimização, Fase 1 (Parte B)
--  Executado automaticamente pela API de gerenciamento (scripts/supa.mjs).
--  Pode rodar mais de uma vez.
-- =====================================================================

-- ---------- 1. Hash por linha: a sincronização só grava o que mudou ----------
alter table public.campaigns add column if not exists row_hash text;
alter table public.ad_sets   add column if not exists row_hash text;
alter table public.creatives add column if not exists row_hash text;

-- ---------- 2. Trava de sincronização por agência ----------
create table if not exists public.sync_locks (
  agency_id      uuid primary key references public.agencies(id) on delete cascade,
  locked_until   timestamptz not null default now(),
  last_manual_at timestamptz
);
alter table public.sync_locks enable row level security; -- sem policy: só o servidor

-- 'ok' = pode sincronizar | 'busy' = já tem uma rodando | 'cooldown' = botão usado há menos de 5 min
create or replace function public.try_sync_lock(p_agency uuid, p_seconds int, p_manual boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare r public.sync_locks;
begin
  insert into public.sync_locks (agency_id, locked_until) values (p_agency, now() - interval '1 second') on conflict do nothing;
  select * into r from public.sync_locks where agency_id = p_agency for update;
  if r.locked_until > now() then return 'busy'; end if;
  if p_manual and r.last_manual_at > now() - interval '5 minutes' then return 'cooldown'; end if;
  update public.sync_locks
     set locked_until = now() + make_interval(secs => p_seconds),
         last_manual_at = case when p_manual then now() else last_manual_at end
   where agency_id = p_agency;
  return 'ok';
end $$;

create or replace function public.release_sync_lock(p_agency uuid)
returns void language sql security definer set search_path = public as $$
  update public.sync_locks set locked_until = now() where agency_id = p_agency;
$$;

revoke all on function public.try_sync_lock(uuid, int, boolean) from public, anon, authenticated;
revoke all on function public.release_sync_lock(uuid) from public, anon, authenticated;
grant execute on function public.try_sync_lock(uuid, int, boolean) to service_role;
grant execute on function public.release_sync_lock(uuid) to service_role;

-- ---------- 3. Preferências: mescla numa chamada só ----------
create or replace function public.prefs_merge(p_patch jsonb)
returns void language sql security invoker set search_path = public as $$
  insert into public.user_preferences (user_id, prefs, updated_at)
  values (auth.uid(), p_patch, now())
  on conflict (user_id) do update set prefs = public.user_preferences.prefs || excluded.prefs, updated_at = now();
$$;
revoke all on function public.prefs_merge(jsonb) from public, anon;
grant execute on function public.prefs_merge(jsonb) to authenticated;

-- ---------- 4. Gancho de login: agência, função e status DENTRO do token ----------
-- Assim nenhuma página precisa consultar o perfil, e as regras de segurança leem do token.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  claims jsonb := event -> 'claims';
  p record;
begin
  select pr.agency_id, pr.role, pr.full_name, pr.email, a.name as agency_name, a.status as agency_status
    into p
    from public.profiles pr
    left join public.agencies a on a.id = pr.agency_id
   where pr.id = (event ->> 'user_id')::uuid;
  if found then
    claims := jsonb_set(claims, '{app}', jsonb_build_object(
      'agency_id', p.agency_id, 'role', p.role, 'name', p.full_name, 'email', p.email,
      'agency_name', p.agency_name, 'agency_status', p.agency_status));
  end if;
  return jsonb_build_object('claims', claims);
end $$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant select on public.profiles, public.agencies to supabase_auth_admin;
drop policy if exists auth_hook_read on public.profiles;
create policy auth_hook_read on public.profiles for select to supabase_auth_admin using (true);
drop policy if exists auth_hook_read on public.agencies;
create policy auth_hook_read on public.agencies for select to supabase_auth_admin using (true);

-- ---------- 5. Segurança: lê do token e é calculada uma vez por consulta ----------
-- Agência suspensa: my_agency_id() devolve nulo → o gestor deixa de ver qualquer dado na hora.
create or replace function public.my_agency_id() returns uuid
language sql stable security definer set search_path = public as $$
  select a.id from public.agencies a
   where a.id = coalesce(nullif(auth.jwt() -> 'app' ->> 'agency_id', '')::uuid,
                         (select agency_id from public.profiles where id = auth.uid()))
     and a.status <> 'suspended'
$$;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (auth.jwt() -> 'app' ->> 'role') = 'super_admin',
    (select role = 'super_admin' from public.profiles where id = auth.uid()),
    false)
$$;

-- As regras usam (select …): o Postgres calcula UMA vez por consulta, não por linha.
drop policy if exists agencies_read on public.agencies;
create policy agencies_read on public.agencies for select
  using (id = (select public.my_agency_id()) or (select public.is_super_admin()));

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select
  using (id = (select auth.uid()) or agency_id = (select public.my_agency_id()) or (select public.is_super_admin()));

do $$
declare t text;
begin
  foreach t in array array['clients','ad_accounts','campaigns','campaign_daily','creatives','share_links',
                           'ad_sets','destinations','deliveries','manual_entries','destination_state'] loop
    execute format('drop policy if exists %1$s_rw on public.%1$s', t);
    execute format(
      'create policy %1$s_rw on public.%1$s for all
         using (agency_id = (select public.my_agency_id()) or (select public.is_super_admin()))
         with check (agency_id = (select public.my_agency_id()))', t);
  end loop;
end $$;

drop policy if exists user_preferences_rw on public.user_preferences;
create policy user_preferences_rw on public.user_preferences for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------- 6. Suspensão: derruba as sessões abertas da agência ----------
create or replace function public.revoke_agency_sessions(p_agency uuid)
returns void language sql security definer set search_path = public, auth as $$
  delete from auth.sessions where user_id in (select id from public.profiles where agency_id = p_agency and role <> 'super_admin');
$$;
revoke all on function public.revoke_agency_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_agency_sessions(uuid) to service_role;

-- ---------- 7. Agendador: limpa o próprio histórico (sem criar outra rotina) ----------
select cron.alter_job(jobid, command := command || E'\ndelete from cron.job_run_details where end_time < now() - interval ''2 days'';')
  from cron.job
 where jobname = 'evx-fire-sync' and command not like '%job_run_details%';
delete from cron.job_run_details where end_time < now() - interval '2 days';

-- ---------- 8. Destinos vazios criados por engano (sem endereço, nunca usados) ----------
delete from public.destinations where coalesce(url, '') = '' and last_sent_at is null and active = false;
