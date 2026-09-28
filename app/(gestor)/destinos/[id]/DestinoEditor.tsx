"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { Panel, Pill } from "@/components/ui";
import { useDialog } from "@/components/kit/Dialogs";
import Select from "@/components/kit/Select";
import { statusLabels } from "@/components/StatusLed";
import { applyFilters, countTree, type DestFilters, type NodeAccount } from "@/lib/fire/filters";
import type { CampaignStatus } from "@/lib/types";
import { deleteDestination, regenerateApiKey, regenerateSecret, saveDestination, sendNow, testDestination } from "../actions";

export interface DeliveryRow {
  id: string;
  event: string;
  ad_account: string | null;
  items: number;
  status: number | null;
  ok: boolean;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
}

type Tree = (NodeAccount & { client: string | null })[];

interface DestProps {
  id: string;
  name: string;
  url: string;
  active: boolean;
  secret: string;
  apiKeyPrefix: string | null;
  lastSentAt: string | null;
  lastStatus: number | null;
  lastError: string | null;
  filters: DestFilters;
}

// ---------- pequenos componentes ----------
function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setOk(true);
        setTimeout(() => setOk(false), 1500);
      }}
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-ash-300 hover:bg-fire-500/10 hover:text-fire-300"
    >
      {ok ? <Check size={14} className="text-good" /> : <Copy size={14} />}
      {label && (ok ? "Copiado" : label)}
    </button>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-all",
        on ? "border-fire-500/50 bg-fire-500/15 text-white shadow-[0_0_14px_-4px_rgba(255,92,0,.8)]" : "border-white/10 text-ash-300 hover:border-white/20",
      )}
    >
      {children}
    </button>
  );
}

function TermsInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const parts = draft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !value.includes(s));
    if (parts.length) onChange([...value, ...parts]);
    setDraft("");
  };
  return (
    <div className="flex min-h-[46px] flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-black/35 px-2 py-1.5 focus-within:border-fire-500/60">
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-lg bg-fire-500/15 px-2 py-1 font-mono text-xs text-fire-200">
          {t}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Remover ${t}`} className="text-fire-300 hover:text-white">
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={add}
        placeholder={value.length ? "" : placeholder}
        className="min-w-[160px] flex-1 bg-transparent px-1 py-1 text-sm text-white outline-none placeholder:text-ash-500"
      />
    </div>
  );
}

function Check3({ state, onClick }: { state: "on" | "off" | "inherit"; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state === "inherit"}
      className={clsx(
        "grid h-4 w-4 shrink-0 place-items-center rounded border",
        state === "on" && "border-fire-400 bg-fire-500 text-coal-950",
        state === "inherit" && "border-fire-500/50 bg-fire-500/30 text-white",
        state === "off" && "border-white/25 hover:border-fire-400",
      )}
    >
      {state !== "off" && <Check size={11} strokeWidth={3} />}
    </button>
  );
}

const LED = ({ active }: { active: boolean }) => <span className={`led ${active ? "led-active" : "led-paused"}`} />;

// ---------- editor ----------
export default function DestinoEditor({ dest, tree, deliveries }: { dest: DestProps; tree: Tree; deliveries: DeliveryRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { confirm } = useDialog();
  const [name, setName] = useState(dest.name);
  const [url, setUrl] = useState(dest.url);
  const [active, setActive] = useState(dest.active);
  const [f, setF] = useState<DestFilters>(dest.filters);
  const [secret, setSecret] = useState(dest.secret);
  const [showSecret, setShowSecret] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [origin, setOrigin] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => setOrigin(window.location.origin), []);

  const dirty = name !== dest.name || url !== dest.url || active !== dest.active || JSON.stringify(f) !== JSON.stringify(dest.filters);
  const set = <K extends keyof DestFilters>(k: K, v: DestFilters[K]) => setF((x) => ({ ...x, [k]: v }));
  const toggleIn = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const preview = useMemo(() => applyFilters(tree, f), [tree, f]);
  const clientOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of tree) if (a.client_id && a.client) m.set(a.client_id, a.client);
    return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [tree]);
  const counts = countTree(preview);
  const total = countTree(tree);

  const save = () =>
    start(async () => {
      const r = await saveDestination(dest.id, { name, url, active, filters: f });
      setMsg(r.ok ? { tone: "good", text: "Configurações salvas." } : { tone: "bad", text: r.error });
      router.refresh();
    });

  // ---------- seleção manual ----------
  const m = f.manual;
  const setManual = (k: keyof DestFilters["manual"], id: string) => set("manual", { ...m, [k]: toggleIn(m[k], id) });
  const q = search.trim().toLowerCase();
  const hit = (s: { name: string; external_id: string }) => !q || s.name.toLowerCase().includes(q) || s.external_id.includes(q);

  return (
    <div className="space-y-5">
      {msg && (
        <div className={clsx("flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm", msg.tone === "good" ? "border-good/30 bg-good/10 text-good" : "border-bad/30 bg-bad/10 text-bad")}>
          {msg.tone === "good" ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          <span className="flex-1">{msg.text}</span>
          <button onClick={() => setMsg(null)} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ---------- 1. Conexão ---------- */}
      <Panel title="1. Conexão" subtitle="Para onde a EVX Fire envia os dados e as credenciais que o seu CRM usa para confirmar que o envio é verdadeiro.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ash-300">Nome do destino</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: CRM Stylo" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ash-300">Endereço do webhook (URL gerada pelo seu CRM)</span>
            <input className="input font-mono !text-xs" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co/functions/v1/fire-webhook?integration=..." />
          </label>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <span className="mb-1.5 flex items-center gap-2 text-xs font-medium text-ash-300">
              <ShieldCheck size={14} className="text-fire-400" /> Segredo de assinatura (cole no CRM)
            </span>
            <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/40 px-3 py-1.5">
              <span className="flex-1 truncate font-mono text-xs text-fire-200">{showSecret ? secret : secret.slice(0, 10) + "•".repeat(24) + secret.slice(-4)}</span>
              <button type="button" onClick={() => setShowSecret((s) => !s)} className="grid h-8 w-8 place-items-center rounded-lg text-ash-400 hover:text-white" aria-label="Mostrar segredo">
                {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
              <CopyBtn text={secret} />
              <button
                type="button"
                title="Gerar novo segredo"
                className="grid h-8 w-8 place-items-center rounded-lg text-ash-400 hover:text-fire-300"
                onClick={async () => {
                  const ok = await confirm({
                    title: "Gerar um novo segredo?",
                    message: "O segredo atual deixa de valer na hora. Os envios ao CRM falham até você colar o novo segredo na tela de credenciais do CRM.",
                    confirmLabel: "Gerar novo segredo",
                    danger: true,
                  });
                  if (ok) start(async () => setSecret(await regenerateSecret(dest.id)));
                }}
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>
          <div>
            <span className="mb-1.5 flex items-center gap-2 text-xs font-medium text-ash-300">
              <KeyRound size={14} className="text-fire-400" /> Chave de API (para o CRM buscar os dados quando quiser)
            </span>
            {newKey ? (
              <div className="rounded-xl border border-good/40 bg-good/10 px-3 py-2">
                <div className="flex items-center gap-1">
                  <span className="flex-1 truncate font-mono text-xs text-white">{newKey}</span>
                  <CopyBtn text={newKey} label="Copiar" />
                </div>
                <p className="mt-1 text-[11px] text-good">Copie agora: por segurança ela não será mostrada de novo.</p>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-1.5">
                <span className="flex-1 truncate font-mono text-xs text-ash-300">{dest.apiKeyPrefix ? `${dest.apiKeyPrefix}••••••••••••` : "nenhuma chave gerada"}</span>
                <button
                  type="button"
                  className="btn-ghost !px-3 !py-1.5 !text-xs"
                  onClick={async () => {
                    const ok =
                      !dest.apiKeyPrefix ||
                      (await confirm({
                        title: "Gerar uma nova chave de API?",
                        message: "A chave atual para de funcionar na hora. O botão \"Sincronizar agora\" do CRM falha até você colar a nova chave lá.",
                        confirmLabel: "Gerar nova chave",
                        danger: true,
                      }));
                    if (ok) start(async () => setNewKey(await regenerateApiKey(dest.id)));
                  }}
                >
                  {dest.apiKeyPrefix ? "Gerar nova" : "Gerar chave"}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs text-ash-400">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ash-300">Endereço da API de consulta:</span>
            <code className="font-mono text-fire-200">{origin}/api/v1/snapshot</code>
            <CopyBtn text={`${origin}/api/v1/snapshot`} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setActive((a) => !a)}
            className="inline-flex items-center gap-2 text-sm text-ash-200"
            aria-pressed={active}
          >
            <span className={clsx("relative block h-5 w-9 rounded-full border transition-colors", active ? "border-fire-400 bg-fire-500/80 shadow-[0_0_12px_rgba(255,92,0,.7)]" : "border-white/15 bg-white/5")}>
              <span className={clsx("absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all", active ? "left-[18px]" : "left-0.5")} />
            </span>
            Envio automático {active ? "ligado" : "desligado"}
            <span className="text-xs text-ash-500">(a cada atualização, ~30 min)</span>
          </button>
        </div>
      </Panel>

      {/* ---------- 2. O que enviar ---------- */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <Panel className="xl:col-span-3" title="2. O que enviar" subtitle="Escolha tudo, filtre por regras (status, palavras no nome como @XYZ, números) ou marque um a um.">
          <div className="mb-5 inline-flex rounded-xl border border-white/5 bg-black/30 p-1">
            {(
              [
                ["all", "Tudo"],
                ["rules", "Por regras"],
                ["manual", "Seleção manual"],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => set("mode", v)}
                className={clsx("rounded-lg px-4 py-2 text-xs font-medium transition-all", f.mode === v ? "bg-fire-500/20 text-white shadow-[0_0_16px_-4px_rgba(255,92,0,.7)]" : "text-ash-400 hover:text-white")}
              >
                {l}
              </button>
            ))}
          </div>

          {f.mode === "all" && <p className="text-sm text-ash-300">Todas as campanhas, conjuntos e anúncios de todas as contas conectadas serão enviados.</p>}

          {f.mode === "rules" && (
            <div className="space-y-5">
              <div>
                <div className="mb-2 text-xs font-medium text-ash-300">Clientes <span className="text-ash-500">(nenhum marcado = todos)</span></div>
                <div className="flex flex-wrap gap-2">
                  {clientOptions.map((c) => (
                    <Chip key={c.id} on={f.clients.includes(c.id)} onClick={() => set("clients", toggleIn(f.clients, c.id))}>
                      {c.name}
                    </Chip>
                  ))}
                  {!clientOptions.length && <span className="text-xs text-ash-500">Nenhum cliente vinculado às contas.</span>}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-medium text-ash-300">Tipo de campanha</div>
                <div className="flex flex-wrap gap-2">
                  <Chip on={f.sources.includes("api")} onClick={() => set("sources", toggleIn(f.sources, "api"))}>
                    Conectadas (Meta/Google)
                  </Chip>
                  <Chip on={f.sources.includes("manual")} onClick={() => set("sources", toggleIn(f.sources, "manual"))}>
                    Manuais
                  </Chip>
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-medium text-ash-300">Contas de anúncio <span className="text-ash-500">(nenhuma marcada = todas)</span></div>
                <div className="flex flex-wrap gap-2">
                  {tree.map((a) => (
                    <Chip key={a.id} on={f.accounts.includes(a.id)} onClick={() => set("accounts", toggleIn(f.accounts, a.id))}>
                      {a.name}
                    </Chip>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-medium text-ash-300">Status das campanhas <span className="text-ash-500">(nenhum marcado = todos)</span></div>
                <div className="flex flex-wrap gap-2">
                  {(["active", "paused", "learning", "ended"] as CampaignStatus[]).map((s) => (
                    <Chip key={s} on={f.campaignStatuses.includes(s)} onClick={() => set("campaignStatuses", toggleIn(f.campaignStatuses, s))}>
                      <span className={`led led-${s}`} /> {statusLabels[s]}
                    </Chip>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-medium text-ash-300">Status dos conjuntos e anúncios dentro delas</div>
                <div className="flex flex-wrap gap-2">
                  <Chip on={f.childStatuses.includes("active")} onClick={() => set("childStatuses", toggleIn(f.childStatuses, "active"))}>
                    <LED active /> Só ativos
                  </Chip>
                  <Chip on={f.childStatuses.includes("inactive")} onClick={() => set("childStatuses", toggleIn(f.childStatuses, "inactive"))}>
                    <LED active={false} /> Só inativos
                  </Chip>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_200px]">
                <div>
                  <div className="mb-2 text-xs font-medium text-ash-300">
                    Nome ou ID <b className="text-good">contém</b> <span className="text-ash-500">(qualquer um destes — Enter para adicionar)</span>
                  </div>
                  <TermsInput value={f.includeTerms} onChange={(v) => set("includeTerms", v)} placeholder="@XYZ, Black Friday, 1202…" />
                </div>
                <div>
                  <span className="mb-2 block text-xs font-medium text-ash-300">Procurar no nome do(a)</span>
                  <Select
                    value={f.termScope}
                    onChange={(x) => set("termScope", x)}
                    options={[
                      { value: "campaign", label: "Campanha" },
                      { value: "adset", label: "Conjunto de anúncios" },
                      { value: "ad", label: "Anúncio" },
                    ]}
                  />
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-medium text-ash-300">
                  Nome ou ID <b className="text-bad">não contém</b>
                </div>
                <TermsInput value={f.excludeTerms} onChange={(v) => set("excludeTerms", v)} placeholder="teste, [OFF]…" />
              </div>
              <p className="text-[11px] text-ash-500">Maiúsculas/minúsculas e acentos são ignorados. Campanhas novas que obedecerem às regras entram sozinhas.</p>
            </div>
          )}

          {f.mode === "manual" && (
            <div>
              <div className="relative mb-3">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ash-400" />
                <input className="input !pl-9" placeholder="Buscar por nome ou ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <p className="mb-3 text-[11px] text-ash-500">Marcar uma campanha ou conjunto envia tudo que estiver dentro, inclusive o que for criado depois.</p>
              <div className="max-h-[520px] space-y-3 overflow-auto pr-1">
                {tree.map((acc) => {
                  const camps = acc.campaigns.filter((c) => hit(c) || c.adsets.some((s) => hit(s) || s.ads.some(hit)));
                  if (!camps.length) return null;
                  return (
                    <div key={acc.id}>
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ash-500">{acc.name}</div>
                      {camps.map((c) => {
                        const cOn = m.campaigns.includes(c.id);
                        const expanded = open[c.id] || !!q;
                        return (
                          <div key={c.id} className="rounded-lg">
                            <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
                              <button type="button" onClick={() => setOpen((o) => ({ ...o, [c.id]: !o[c.id] }))} className="text-ash-500" aria-label="Expandir">
                                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>
                              <Check3 state={cOn ? "on" : "off"} onClick={() => setManual("campaigns", c.id)} />
                              <span className={`led led-${c.status}`} />
                              <span className="truncate text-sm text-white">{c.name}</span>
                              <span className="ml-auto shrink-0 text-[10px] text-ash-500">{c.adsets.length} conj.</span>
                            </div>
                            {expanded &&
                              c.adsets.map((s) => {
                                const sOn = m.adsets.includes(s.id);
                                return (
                                  <div key={s.id} className="ml-7">
                                    <div className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/[0.03]">
                                      <Check3 state={cOn ? "inherit" : sOn ? "on" : "off"} onClick={() => setManual("adsets", s.id)} />
                                      <LED active={s.active} />
                                      <span className="truncate text-xs text-ash-200">{s.name}</span>
                                    </div>
                                    {s.ads.map((a) => (
                                      <div key={a.id} className="ml-6 flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/[0.03]">
                                        <Check3 state={cOn || sOn ? "inherit" : m.ads.includes(a.id) ? "on" : "off"} onClick={() => setManual("ads", a.id)} />
                                        <LED active={a.active} />
                                        <span className="truncate text-xs text-ash-300">{a.name}</span>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-6 border-t border-white/5 pt-5">
            <div className="mb-2 text-xs font-medium text-ash-300">Nível de detalhe enviado</div>
            <div className="flex flex-wrap gap-2">
              <Chip on={f.detail === "campaign"} onClick={() => set("detail", "campaign")}>
                Só campanhas
              </Chip>
              <Chip on={f.detail === "adset"} onClick={() => set("detail", "adset")}>
                Campanhas + conjuntos
              </Chip>
              <Chip on={f.detail === "ad"} onClick={() => set("detail", "ad")}>
                Campanhas + conjuntos + anúncios (com criativos)
              </Chip>
            </div>
          </div>
        </Panel>

        {/* ---------- Prévia ---------- */}
        <Panel className="xl:col-span-2 h-fit xl:sticky xl:top-24" title="Prévia do envio" subtitle="Atualiza enquanto você mexe nos filtros.">
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ["Campanhas", counts.campaigns, total.campaigns],
              ["Conjuntos", counts.adsets, total.adsets],
              ["Anúncios", counts.ads, total.ads],
            ].map(([l, v, t]) => (
              <div key={l as string} className="rounded-xl border border-white/5 bg-white/[0.02] px-2 py-3">
                <div className="font-display text-2xl font-bold text-white">{v as number}</div>
                <div className="text-[10px] uppercase tracking-wider text-ash-400">{l as string}</div>
                <div className="text-[10px] text-ash-500">de {t as number}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 max-h-[420px] space-y-3 overflow-auto pr-1">
            {!preview.length && <p className="py-6 text-center text-sm text-ash-400">Nada será enviado com estes filtros.</p>}
            {preview.map((acc) => (
              <div key={acc.id}>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ash-500">{acc.name}</div>
                <ul className="space-y-1">
                  {acc.campaigns.map((c) => (
                    <li key={c.id} className="rounded-lg bg-white/[0.02] px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`led led-${c.status}`} />
                        <span className="truncate text-xs text-white">{c.name}</span>
                      </div>
                      {f.detail !== "campaign" && c.adsets.length > 0 && (
                        <div className="mt-0.5 pl-4 text-[10px] text-ash-500">
                          {c.adsets.length} conjunto(s){f.detail === "ad" ? ` · ${c.adsets.reduce((t, s) => t + s.ads.length, 0)} anúncio(s)` : ""}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* ---------- Ações ---------- */}
      <div className="glass sticky bottom-4 z-10 flex flex-wrap items-center gap-3 p-4">
        <button className="btn-fire" disabled={pending} onClick={save}>
          {pending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salvar
        </button>
        <button
          className="btn-ghost"
          disabled={pending || dirty}
          title={dirty ? "Salve antes de testar" : ""}
          onClick={() =>
            start(async () => {
              const r = await testDestination(dest.id);
              setMsg(r.ok ? { tone: "good", text: `Teste recebido pelo CRM (HTTP ${r.status}).` } : { tone: "bad", text: `Falhou: ${r.error ?? `HTTP ${r.status}`}` });
              router.refresh();
            })
          }
        >
          <Zap size={16} /> Enviar teste
        </button>
        <button
          className="btn-ghost"
          disabled={pending || dirty}
          title={dirty ? "Salve antes de enviar" : ""}
          onClick={() =>
            start(async () => {
              const r = await sendNow(dest.id);
              setMsg(
                r.error
                  ? { tone: "bad", text: r.error }
                  : r.failed
                    ? { tone: "bad", text: `${r.failed} de ${r.sent} envio(s) falharam. Veja o histórico abaixo.` }
                    : { tone: "good", text: `${r.sent} pacote(s) enviados com sucesso (um por conta de anúncio).` },
              );
              router.refresh();
            })
          }
        >
          <Send size={16} /> Enviar agora
        </button>
        {dirty && <span className="text-xs text-warn">Alterações não salvas</span>}
        <button className="ml-auto inline-flex items-center gap-1.5 text-xs text-ash-500 hover:text-bad" onClick={async () => {
            const ok = await confirm({
              title: `Excluir o destino "${dest.name}"?`,
              message: "A EVX Fire para de enviar dados para este sistema, e o segredo e a chave de API deixam de valer. Os dados que o CRM já recebeu continuam lá.",
              confirmLabel: "Excluir destino",
              danger: true,
            });
            if (ok) start(() => deleteDestination(dest.id));
          }}>
          <Trash2 size={14} /> Excluir destino
        </button>
      </div>

      {/* ---------- Histórico ---------- */}
      <Panel title="Histórico de envios" subtitle="Últimos 7 dias.">
        {!deliveries.length ? (
          <p className="py-6 text-center text-sm text-ash-400">Nenhum envio ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs [&_td]:px-3 [&_th]:px-3">
              <thead>
                <tr className="border-b border-white/5 text-left text-[10px] uppercase tracking-wider text-ash-400">
                  <th className="py-2 font-medium">Quando</th>
                  <th className="py-2 font-medium">Evento</th>
                  <th className="py-2 font-medium">Conta</th>
                  <th className="py-2 font-medium">Campanhas</th>
                  <th className="py-2 font-medium">Resposta</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} className="border-b border-white/[0.04]">
                    <td className="py-2 text-ash-300">{new Date(d.created_at).toLocaleString("pt-BR")}</td>
                    <td className="py-2 font-mono text-fire-200">{d.event}</td>
                    <td className="py-2 font-mono text-ash-300">{d.ad_account ?? "—"}</td>
                    <td className="py-2 text-ash-300">{d.event === "fire.snapshot" ? d.items : "—"}</td>
                    <td className="py-2">
                      {d.ok ? (
                        <Pill tone="good">
                          {d.status} · {d.duration_ms}ms
                        </Pill>
                      ) : (
                        <span className="text-bad" title={d.error ?? ""}>
                          {d.status ?? "sem resposta"} — {(d.error ?? "").slice(0, 80)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
