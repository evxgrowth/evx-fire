import { PageHeader, Panel, Pill } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/server";

export const metadata = { title: "Saúde do sistema — EVX Fire" };

interface Health {
  checked_at: string;
  db_bytes: number;
  cron: { start_time: string; end_time: string | null; status: string; message: string | null }[];
  http: { created: string; status_code: number | null; timed_out: boolean | null; message: string | null }[];
  accounts: { agency: string; name: string; platform: string; enabled: boolean; last_synced_at: string | null; last_structure_sync_at: string | null; error: string | null }[];
  destinations: { agency: string; name: string; active: boolean; has_url: boolean; last_sent_at: string | null; last_status: number | null; error: string | null; sent_24h: number; failed_24h: number }[];
}

const DB_LIMIT = 500 * 1024 * 1024; // plano gratuito do Supabase

function ago(iso: string | null, now: number) {
  if (!iso) return "nunca";
  const m = Math.round((now - Date.parse(iso)) / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  if (m < 1440) return `há ${Math.round(m / 60)} h`;
  return `há ${Math.round(m / 1440)} d`;
}

const hhmm = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/5 py-2.5 text-sm last:border-0">{children}</div>;
}

/** Super Admin: o sistema está funcionando? Uma consulta só ao banco (função system_health). */
export default async function SaudePage() {
  const { data, error } = await createAdminClient().rpc("system_health");
  if (error || !data) return <p className="text-sm text-bad">Não foi possível ler a saúde do sistema: {error?.message}</p>;
  const h = data as Health;
  const now = Date.parse(h.checked_at);

  // O agendador roda a cada 30 min: mais de 40 min sem rodar é sinal de problema
  const lastCron = h.cron[0];
  const cronLate = !lastCron || now - Date.parse(lastCron.start_time) > 40 * 60000;
  const httpFails = h.http.filter((r) => r.timed_out || (r.status_code ?? 0) >= 400 || !(r.message ?? "").includes('"ok":true')).length;
  const enabled = h.accounts.filter((a) => a.enabled);
  const accErrors = enabled.filter((a) => a.error);
  const accLate = enabled.filter((a) => !a.last_synced_at || now - Date.parse(a.last_synced_at) > 2 * 3600000);
  const destActive = h.destinations.filter((d) => d.active && d.has_url);
  const destFails = destActive.filter((d) => d.error || d.failed_24h > 0);
  const problems = (cronLate ? 1 : 0) + (httpFails ? 1 : 0) + accErrors.length + accLate.length + destFails.length;

  return (
    <>
      <PageHeader title="Saúde do sistema" subtitle={`Verificado ${hhmm(h.checked_at)} · atualiza ao abrir a página`}>
        <Pill tone={problems ? "warn" : "good"}>{problems ? `${problems} ponto(s) de atenção` : "Tudo funcionando"}</Pill>
      </PageHeader>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Agendador", cronLate ? "Atrasado" : `Rodou ${ago(lastCron?.start_time ?? null, now)}`, cronLate ? "bad" : "good"],
          ["Ciclos com falha", `${httpFails} de ${h.http.length}`, httpFails ? "warn" : "good"],
          ["Contas com erro", `${accErrors.length + accLate.length} de ${enabled.length}`, accErrors.length + accLate.length ? "warn" : "good"],
          ["Banco de dados", `${(h.db_bytes / 1048576).toFixed(0)} MB de 500 MB (${Math.round((h.db_bytes / DB_LIMIT) * 100)}%)`, h.db_bytes > DB_LIMIT * 0.5 ? "warn" : "good"],
        ].map(([label, value, tone]) => (
          <div key={label} className="glass p-4">
            <div className="text-[11px] uppercase tracking-wider text-ash-400">{label}</div>
            <div className={`mt-1 font-display text-lg font-semibold ${tone === "bad" ? "text-bad" : tone === "warn" ? "text-fire-300" : "text-white"}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel title="Contas de anúncio" subtitle="Atualizadas a cada 30 minutos. Ligadas e com erro aparecem primeiro.">
          {h.accounts.length ? (
            h.accounts.map((a, i) => (
              <Row key={i}>
                <span className={`led ${!a.enabled ? "led-paused" : a.error ? "led-ended" : "led-active"}`} />
                <span className="min-w-0 flex-1 truncate text-white">{a.name}</span>
                <span className="text-xs text-ash-400">{a.agency}</span>
                <span className="text-xs text-ash-300">{a.enabled ? ago(a.last_synced_at, now) : "desligada"}</span>
                {a.error && a.enabled && <span className="w-full text-xs text-bad">{a.error}</span>}
              </Row>
            ))
          ) : (
            <p className="text-sm text-ash-400">Nenhuma conta conectada.</p>
          )}
        </Panel>

        <Panel title="Destinos (CRM)" subtitle="Envios automáticos das últimas 24 horas.">
          {h.destinations.length ? (
            h.destinations.map((d, i) => (
              <Row key={i}>
                <span className={`led ${!(d.active && d.has_url) ? "led-paused" : d.error || d.failed_24h ? "led-ended" : "led-active"}`} />
                <span className="min-w-0 flex-1 truncate text-white">{d.name}</span>
                <span className="text-xs text-ash-400">{d.agency}</span>
                <span className="text-xs text-ash-300">
                  {d.active && d.has_url ? `${d.sent_24h} envio(s), ${d.failed_24h} falha(s) · último ${ago(d.last_sent_at, now)}` : "desligado"}
                </span>
                {d.error && <span className="w-full text-xs text-bad">{d.error}</span>}
              </Row>
            ))
          ) : (
            <p className="text-sm text-ash-400">Nenhum destino cadastrado.</p>
          )}
        </Panel>

        <Panel title="Últimos ciclos automáticos" subtitle="O que o site respondeu a cada chamada do agendador." className="xl:col-span-2">
          {h.http.length ? (
            h.http.map((r, i) => {
              const ok = !r.timed_out && (r.status_code ?? 0) < 400 && (r.message ?? "").includes('"ok":true');
              return (
                <Row key={i}>
                  <span className={`led ${ok ? "led-active" : "led-ended"}`} />
                  <span className="w-28 text-ash-300">{hhmm(r.created)}</span>
                  <span className="text-xs text-ash-400">{r.timed_out ? "sem resposta (tempo esgotado)" : `HTTP ${r.status_code ?? "—"}`}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-ash-400">{r.message}</span>
                </Row>
              );
            })
          ) : (
            <p className="text-sm text-ash-400">Nenhum ciclo registrado ainda.</p>
          )}
        </Panel>
      </div>
    </>
  );
}
