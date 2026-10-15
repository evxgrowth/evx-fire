-- Fase 5 da otimização: tela "Saúde do sistema" (Super Admin) numa única consulta.
-- Só leitura. Só o servidor (chave de serviço) pode chamar.

create or replace function public.system_health()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'checked_at', now(),
    'db_bytes', pg_database_size(current_database()),
    -- últimas execuções do agendador (o pedido saiu do banco?)
    'cron', coalesce((
      select jsonb_agg(x order by x.start_time desc) from (
        select d.start_time, d.end_time, d.status, left(d.return_message, 200) as message
        from cron.job_run_details d join cron.job j on j.jobid = d.jobid
        where j.jobname = 'evx-fire-sync'
        order by d.start_time desc limit 8
      ) x), '[]'::jsonb),
    -- o que o site respondeu a essas chamadas
    'http', coalesce((
      select jsonb_agg(x order by x.created desc) from (
        select r.created, r.status_code, r.timed_out, left(coalesce(r.error_msg, r.content), 200) as message
        from net._http_response r order by r.created desc limit 8
      ) x), '[]'::jsonb),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'agency', g.name, 'name', a.name, 'platform', a.platform, 'enabled', a.sync_enabled,
        'last_synced_at', a.last_synced_at, 'last_structure_sync_at', a.last_structure_sync_at, 'error', a.last_error)
        order by a.sync_enabled desc, (a.last_error is null), g.name, a.name)
      from ad_accounts a join agencies g on g.id = a.agency_id
      where a.platform <> 'manual'), '[]'::jsonb),
    'destinations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'agency', g.name, 'name', d.name, 'active', d.active, 'has_url', d.url <> '',
        'last_sent_at', d.last_sent_at, 'last_status', d.last_status, 'error', d.last_error,
        'sent_24h', (select count(*) from deliveries x where x.destination_id = d.id and x.created_at > now() - interval '24 hours'),
        'failed_24h', (select count(*) from deliveries x where x.destination_id = d.id and x.created_at > now() - interval '24 hours' and not x.ok))
        order by g.name, d.name)
      from destinations d join agencies g on g.id = d.agency_id), '[]'::jsonb)
  );
$$;

revoke all on function public.system_health() from public, anon, authenticated;
grant execute on function public.system_health() to service_role;
