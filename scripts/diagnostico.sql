-- Diagnóstico de consumo do banco da Fire (somente leitura)
select json_build_object(
  'top_statements', (
    select coalesce(json_agg(t), '[]'::json) from (
      select left(regexp_replace(query, '\s+', ' ', 'g'), 160) as query, calls, round(total_exec_time::numeric) as total_ms,
             round(mean_exec_time::numeric, 2) as mean_ms, rows
      from extensions.pg_stat_statements
      where dbid = (select oid from pg_database where datname = current_database())
      order by total_exec_time desc limit 15
    ) t),
  'most_called', (
    select coalesce(json_agg(t), '[]'::json) from (
      select left(regexp_replace(query, '\s+', ' ', 'g'), 120) as query, calls, rows
      from extensions.pg_stat_statements
      where dbid = (select oid from pg_database where datname = current_database())
      order by calls desc limit 12
    ) t),
  'stats_since', (select stats_reset from extensions.pg_stat_statements_info),
  'table_sizes', (
    select json_agg(t) from (
      select n.nspname || '.' || c.relname as tabela, pg_size_pretty(pg_total_relation_size(c.oid)) as tamanho, pg_total_relation_size(c.oid) as bytes,
             c.reltuples::bigint as linhas_aprox
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'r' and n.nspname in ('public', 'cron', 'net', 'auth', 'storage')
      order by pg_total_relation_size(c.oid) desc limit 15
    ) t),
  'db_size', pg_size_pretty(pg_database_size(current_database())),
  'cron_jobs', (select coalesce(json_agg(json_build_object('job', jobname, 'schedule', schedule, 'active', active)), '[]'::json) from cron.job),
  'cron_history_rows', (select count(*) from cron.job_run_details),
  'net_responses_rows', (select count(*) from net._http_response),
  'realtime_tables', (select coalesce(json_agg(schemaname || '.' || tablename), '[]'::json) from pg_publication_tables where pubname = 'supabase_realtime'),
  'unused_indexes', (
    select coalesce(json_agg(t), '[]'::json) from (
      select relname as tabela, indexrelname as indice, idx_scan, pg_size_pretty(pg_relation_size(indexrelid)) as tamanho
      from pg_stat_user_indexes where schemaname = 'public' and idx_scan = 0 order by pg_relation_size(indexrelid) desc
    ) t),
  'table_activity', (
    select json_agg(t) from (
      select relname as tabela, seq_scan, idx_scan, n_tup_ins as inserts, n_tup_upd as updates, n_tup_del as deletes, n_dead_tup as mortas
      from pg_stat_user_tables where schemaname = 'public' order by n_tup_upd + n_tup_ins desc limit 14
    ) t)
) as diagnostico;
