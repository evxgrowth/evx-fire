"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Check, CheckCircle2, ChevronRight, Copy, Info, Loader2, Plus, RefreshCw, Webhook, XCircle } from "lucide-react";
import clsx from "clsx";
import { GoogleAdsIcon, MetaIcon } from "@/components/PlatformIcon";
import { Panel, Pill } from "@/components/ui";
import { useDialog } from "@/components/kit/Dialogs";
import Select from "@/components/kit/Select";
import { useBatchedToggle } from "@/components/useBatchedToggle";
import { assignAccount, createClientRecord, setAccountsEnabled } from "../actions";
import { createDestination } from "../destinos/actions";

export interface AccountRow {
  id: string;
  platform: "meta" | "google";
  external_id: string;
  name: string;
  client_id: string | null;
  sync_enabled: boolean;
  last_synced_at: string | null;
  last_error: string | null;
  account_status: number | null;
}

// Status da conta de anúncios na Meta
const ACCOUNT_STATUS: Record<number, [string, "good" | "warn" | "bad"]> = {
  1: ["Ativa", "good"],
  2: ["Desativada", "bad"],
  3: ["Pagamento pendente", "warn"],
  7: ["Em análise de risco", "warn"],
  8: ["Aguardando pagamento", "warn"],
  9: ["Período de carência", "warn"],
  100: ["Encerramento pendente", "bad"],
  101: ["Encerrada", "bad"],
};

export function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setOk(true);
        setTimeout(() => setOk(false), 1500);
      }}
      className="grid h-8 w-8 place-items-center rounded-lg text-ash-400 hover:bg-fire-500/10 hover:text-fire-300"
      aria-label="Copiar"
    >
      {ok ? <Check size={15} className="text-good" /> : <Copy size={15} />}
    </button>
  );
}

const fmtDate = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });



function Toggle({ on, onChange, disabled }: { on: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onChange} disabled={disabled} aria-pressed={on} className="disabled:opacity-50">
      <span className={clsx("relative block h-5 w-9 rounded-full border transition-colors", on ? "border-fire-400 bg-fire-500/80 shadow-[0_0_12px_rgba(255,92,0,.7)]" : "border-white/15 bg-white/5")}>
        <span className={clsx("absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all", on ? "left-[18px]" : "left-0.5")} />
      </span>
    </button>
  );
}

export default function IntegracoesClient({
  flash,
  meta,
  accounts,
  clients,
  destinations,
}: {
  destinations: { id: string; name: string; url: string; active: boolean; last_sent_at: string | null; last_error: string | null }[];
  flash: { tone: "good" | "bad" | "warn"; text: string } | null;
  meta: { user: string; expiresAt: string | null } | null;
  accounts: AccountRow[];
  clients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { prompt } = useDialog();
  const accToggle = useBatchedToggle(setAccountsEnabled);
  const [assigned, setAssigned] = useState<Record<string, string>>({});
  const [syncing, setSyncing] = useState(false);
  const metaAccounts = accounts.filter((a) => a.platform === "meta");
  // (contas "manuais" não aparecem aqui: são criadas pelas campanhas manuais)
  const daysLeft = meta?.expiresAt ? Math.round((new Date(meta.expiresAt).getTime() - Date.now()) / 86400000) : null;

  return (
    <div className="space-y-5">
      {flash && (
        <div
          className={clsx(
            "flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm",
            flash.tone === "good" && "border-good/30 bg-good/10 text-good",
            flash.tone === "bad" && "border-bad/30 bg-bad/10 text-bad",
            flash.tone === "warn" && "border-warn/30 bg-warn/10 text-warn",
          )}
        >
          {flash.tone === "good" ? <CheckCircle2 size={18} /> : flash.tone === "bad" ? <XCircle size={18} /> : <Info size={18} />}
          {flash.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel className={meta ? "neon-ring" : undefined}>
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-meta">
              <MetaIcon size={26} />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-lg font-semibold text-white">Meta Ads</h3>
                {meta ? (
                  <Pill tone="good">
                    <span className="led led-active" /> Conectado
                  </Pill>
                ) : (
                  <Pill tone="muted">Não conectado</Pill>
                )}
              </div>
              <p className="mt-1 text-sm text-ash-400">Facebook e Instagram Ads. Acesso somente leitura.</p>
              {meta && (
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ash-300">
                  <span>
                    Conectado como <b className="text-white">{meta.user}</b>
                  </span>
                  <span>
                    <b className="text-white">{metaAccounts.length}</b> contas de anúncio
                  </span>
                  {daysLeft != null && (
                    <span className={daysLeft < 10 ? "text-warn" : ""}>{daysLeft > 0 ? `Acesso válido por ${daysLeft} dias` : "Acesso expirado — reconecte"}</span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href="/api/meta/connect" className={meta ? "btn-ghost !py-2 !text-xs" : "btn-fire"}>
              <MetaIcon size={16} /> {meta ? "Reconectar / adicionar contas" : "Conectar com Facebook"}
            </a>
            {meta && (
              <button
                className="btn-ghost !py-2 !text-xs"
                disabled={syncing}
                onClick={async () => {
                  setSyncing(true);
                  await fetch("/api/sync", { method: "POST" });
                  setSyncing(false);
                  router.refresh();
                }}
              >
                {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Sincronizar agora
              </button>
            )}
          </div>
        </Panel>

        <Panel>
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-google">
              <GoogleAdsIcon size={26} />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-lg font-semibold text-white">Google Ads</h3>
                <Pill tone="warn">Em breve</Pill>
              </div>
              <p className="mt-1 text-sm text-ash-400">Pesquisa, Display, YouTube e Performance Max. Será liberado assim que a integração com o Google for aprovada.</p>
            </div>
          </div>
          <div className="mt-4">
            <button className="btn-ghost !py-2 !text-xs" disabled>
              <GoogleAdsIcon size={16} /> Conectar com Google
            </button>
          </div>
        </Panel>
      </div>

      {metaAccounts.length > 0 && (
        <Panel
          title="Contas de anúncio"
          subtitle="Escolha de qual cliente é cada conta. Conta desativada não é sincronizada, some dos painéis e não é enviada aos destinos."
          action={accToggle.saving ? <span className="text-[11px] text-ash-500">Salvando…</span> : undefined}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm [&_td]:px-3 [&_th]:px-3">
              <thead>
                <tr className="border-b border-white/5 text-left text-[11px] uppercase tracking-wider text-ash-400">
                  <th className="py-3 font-medium">Conta</th>
                  <th className="py-3 font-medium">Cliente</th>
                  <th className="py-3 font-medium">Ativa</th>
                  <th className="py-3 font-medium">Última atualização</th>
                </tr>
              </thead>
              <tbody>
                {metaAccounts.map((a) => (
                  <tr key={a.id} className={clsx("border-b border-white/[0.04] transition-opacity", !accToggle.valueOf(a.id, a.sync_enabled) && "opacity-50")}>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-meta">
                          <MetaIcon size={14} />
                        </span>
                        <div>
                          <div className="font-medium text-white">{a.name}</div>
                          <div className="flex items-center gap-2 font-mono text-[11px] text-ash-400">
                            {a.external_id}
                            {a.account_status != null && ACCOUNT_STATUS[a.account_status] && a.account_status !== 1 && (
                              <span className={clsx("font-sans", ACCOUNT_STATUS[a.account_status][1] === "bad" ? "text-bad" : "text-warn")}>· {ACCOUNT_STATUS[a.account_status][0]}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3">
                      <div className="w-60">
                        <Select
                          size="sm"
                          value={assigned[a.id] ?? a.client_id ?? ""}
                          disabled={pending}
                          options={[
                            { value: "", label: "— sem cliente —" },
                            ...clients.map((c) => ({ value: c.id, label: c.name })),
                            { value: "__new", label: "+ Novo cliente…", action: true },
                          ]}
                          onChange={async (v) => {
                            if (v === "__new") {
                              const name = await prompt({ title: "Novo cliente", message: `A conta "${a.name}" será vinculada a ele.`, label: "Nome do cliente", defaultValue: a.name, confirmLabel: "Criar e vincular" });
                              if (!name) return;
                              start(async () => {
                                const id = await createClientRecord(name);
                                await assignAccount(a.id, id);
                                router.refresh();
                              });
                              return;
                            }
                            // Muda na tela na hora; grava em segundo plano
                            setAssigned((m) => ({ ...m, [a.id]: v }));
                            assignAccount(a.id, v || null)
                              .then(() => router.refresh())
                              .catch(() => setAssigned((m) => ({ ...m, [a.id]: a.client_id ?? "" })));
                          }}
                        />
                      </div>
                    </td>
                    <td className="py-3">
                      <Toggle on={accToggle.valueOf(a.id, a.sync_enabled)} onChange={() => accToggle.toggle(a.id, !accToggle.valueOf(a.id, a.sync_enabled))} />
                    </td>
                    <td className="py-3 text-xs">
                      {a.last_error ? (
                        <span className="inline-flex items-center gap-1.5 text-bad" title={a.last_error}>
                          <AlertTriangle size={13} /> Erro: {a.last_error.slice(0, 60)}
                        </span>
                      ) : a.last_synced_at ? (
                        <span className="text-ash-300">{fmtDate(a.last_synced_at)}</span>
                      ) : (
                        <span className="text-ash-500">{a.sync_enabled ? "aguardando" : "desligada"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Panel
        title={
          <span className="flex items-center gap-2">
            <Webhook size={16} className="text-fire-400" /> Destinos: enviar dados para outros sistemas
          </span>
        }
        subtitle="Conecte seu CRM (ou qualquer sistema) e escolha quais campanhas, conjuntos e anúncios ele recebe."
        action={
          <form action={createDestination}>
            <button className="btn-fire !py-2 !text-xs">
              <Plus size={14} /> Novo destino
            </button>
          </form>
        }
      >
        {!destinations.length ? (
          <div className="rounded-xl border border-dashed border-fire-500/25 p-6 text-center text-sm text-ash-400">
            Nenhum destino ainda. Crie um para enviar campanhas, métricas e criativos ao seu CRM automaticamente.
          </div>
        ) : (
          <ul className="space-y-2">
            {destinations.map((d) => (
              <li key={d.id}>
                <Link href={`/destinos/${d.id}`} className="glass-hover flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
                  <span className={clsx("led", !d.active ? "led-paused" : d.last_error ? "led-ended" : "led-active")} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-white">{d.name}</div>
                    <div className="truncate font-mono text-[11px] text-ash-400">{d.url || "endereço ainda não configurado"}</div>
                  </div>
                  <div className="hidden text-right text-[11px] sm:block">
                    {d.last_error ? (
                      <span className="text-bad">Último envio falhou</span>
                    ) : d.last_sent_at ? (
                      <span className="text-ash-300">Último envio {fmtDate(d.last_sent_at)}</span>
                    ) : (
                      <span className="text-ash-500">{d.active ? "aguardando primeiro envio" : "desligado"}</span>
                    )}
                  </div>
                  <ChevronRight size={16} className="text-ash-500" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
