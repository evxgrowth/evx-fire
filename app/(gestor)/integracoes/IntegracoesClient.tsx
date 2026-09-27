"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, CheckCircle2, Copy, Info, Loader2, Plug, RefreshCw, Webhook, XCircle, Zap } from "lucide-react";
import clsx from "clsx";
import { GoogleAdsIcon, MetaIcon } from "@/components/PlatformIcon";
import { Panel, Pill } from "@/components/ui";
import { assignAccount, createClientRecord, setAccountSync } from "../actions";

export interface AccountRow {
  id: string;
  platform: "meta" | "google";
  external_id: string;
  name: string;
  client_id: string | null;
  sync_enabled: boolean;
  last_synced_at: string | null;
  last_error: string | null;
}

function CopyBtn({ text }: { text: string }) {
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

const samplePayload = `{
  "event": "metrics.daily",
  "client": { "id": "…", "name": "Vida Plena Home Care" },
  "campaign": {
    "id": "…",
    "platform": "meta",
    "name": "[VDP] Conversão | Cuidadores 24h",
    "status": "active"
  },
  "date": "2026-09-27",
  "metrics": {
    "spend": 184.32,
    "impressions": 8421,
    "reach": 5210,
    "clicks": 163,
    "conversions": 11,
    "revenue": 4950.00
  },
  "creatives": [
    {
      "format": "image",
      "headline": "Oferta por tempo limitado",
      "image_url": "https://…/criativo.jpg",
      "active": true
    }
  ]
}`;

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
}: {
  flash: { tone: "good" | "bad" | "warn"; text: string } | null;
  meta: { user: string; expiresAt: string | null } | null;
  accounts: AccountRow[];
  clients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [syncing, setSyncing] = useState(false);
  const metaAccounts = accounts.filter((a) => a.platform === "meta");
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
        <Panel title="Contas de anúncio" subtitle="Escolha de qual cliente é cada conta e quais devem ser sincronizadas.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm [&_td]:px-3 [&_th]:px-3">
              <thead>
                <tr className="border-b border-white/5 text-left text-[11px] uppercase tracking-wider text-ash-400">
                  <th className="py-3 font-medium">Conta</th>
                  <th className="py-3 font-medium">Cliente</th>
                  <th className="py-3 font-medium">Sincronizar</th>
                  <th className="py-3 font-medium">Última atualização</th>
                </tr>
              </thead>
              <tbody>
                {metaAccounts.map((a) => (
                  <tr key={a.id} className="border-b border-white/[0.04]">
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-meta">
                          <MetaIcon size={14} />
                        </span>
                        <div>
                          <div className="font-medium text-white">{a.name}</div>
                          <div className="font-mono text-[11px] text-ash-400">{a.external_id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3">
                      <select
                        className="input !w-auto !py-1.5 !text-xs"
                        value={a.client_id ?? ""}
                        disabled={pending}
                        onChange={(e) => {
                          const v = e.target.value;
                          start(async () => {
                            if (v === "__new") {
                              const name = prompt("Nome do novo cliente:", a.name);
                              if (!name) return;
                              const id = await createClientRecord(name);
                              await assignAccount(a.id, id);
                            } else {
                              await assignAccount(a.id, v || null);
                            }
                          });
                        }}
                      >
                        <option value="">— sem cliente —</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                        <option value="__new">+ Novo cliente…</option>
                      </select>
                    </td>
                    <td className="py-3">
                      <Toggle on={a.sync_enabled} disabled={pending} onChange={() => start(() => setAccountSync(a.id, !a.sync_enabled))} />
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Panel
          className="xl:col-span-3"
          title={
            <span className="flex items-center gap-2">
              <Webhook size={16} className="text-fire-400" /> API e Webhooks <Pill tone="warn">Em breve</Pill>
            </span>
          }
          subtitle="Envie os dados desta conta automaticamente para outros sistemas (CRM, sites, Zapier, n8n)."
        >
          <ul className="space-y-3 text-sm text-ash-300">
            <li className="flex gap-3">
              <Plug size={16} className="mt-0.5 shrink-0 text-fire-400" />
              <span>
                <b className="text-white">Chave de API</b> — outro sistema busca os dados da EVX Fire quando quiser.
              </span>
            </li>
            <li className="flex gap-3">
              <Zap size={16} className="mt-0.5 shrink-0 text-fire-400" />
              <span>
                <b className="text-white">Webhooks</b> — a EVX Fire envia os dados sozinha a cada atualização: métricas, status de campanha e criativos novos.
              </span>
            </li>
          </ul>
          <p className="mt-4 text-xs text-ash-500">Esta parte será ativada na próxima fase. Ao lado está o formato exato dos dados que serão enviados.</p>
        </Panel>

        <Panel
          className="xl:col-span-2"
          title={
            <span className="flex items-center gap-2">
              <Zap size={16} className="text-fire-400" /> Exemplo dos dados enviados
            </span>
          }
          action={<CopyBtn text={samplePayload} />}
        >
          <pre className="max-h-[420px] overflow-auto rounded-xl border border-white/5 bg-black/50 p-4 font-mono text-[11.5px] leading-relaxed text-ash-200">{samplePayload}</pre>
        </Panel>
      </div>
    </div>
  );
}
