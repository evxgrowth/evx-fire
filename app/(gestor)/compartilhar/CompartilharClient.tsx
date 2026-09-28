"use client";

import { useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, ExternalLink, Eye, Link2, Loader2, Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import { Panel } from "@/components/ui";
import { useDialog } from "@/components/kit/Dialogs";
import Select from "@/components/kit/Select";
import { createShareLink, deleteShareLink, updateShareLink } from "../actions";

export interface LinkRow {
  id: string;
  token: string;
  client_id: string;
  label: string;
  show_revenue: boolean;
  show_creatives: boolean;
  active: boolean;
  views: number;
  created_at: string;
}

function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" onClick={onChange} disabled={disabled} className="inline-flex items-center gap-2 text-xs text-ash-300 disabled:opacity-60" aria-pressed={on}>
      <span className={clsx("relative h-5 w-9 rounded-full border transition-colors", on ? "border-fire-400 bg-fire-500/80 shadow-[0_0_12px_rgba(255,92,0,.7)]" : "border-white/15 bg-white/5")}>
        <span className={clsx("absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all", on ? "left-[18px]" : "left-0.5")} />
      </span>
      {label}
    </button>
  );
}

export default function CompartilharClient({ links, clients }: { links: LinkRow[]; clients: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const { confirm } = useDialog();
  const [copied, setCopied] = useState<string | null>(null);
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [showRevenue, setShowRevenue] = useState(true);
  const [showCreatives, setShowCreatives] = useState(true);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const nameOf = (id: string) => clients.find((c) => c.id === id)?.name ?? "—";

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Panel title="Novo link" subtitle="Escolha o cliente e o que ele poderá ver." className="neon-ring h-fit">
        {clients.length ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              start(() => createShareLink(clientId, showRevenue, showCreatives));
            }}
          >
            <Select value={clientId} onChange={setClientId} options={clients.map((c) => ({ value: c.id, label: c.name }))} />
            <div className="space-y-2.5">
              <Toggle on={showRevenue} onChange={() => setShowRevenue((v) => !v)} label="Mostrar receita e ROAS" />
              <Toggle on={showCreatives} onChange={() => setShowCreatives((v) => !v)} label="Mostrar criativos" />
            </div>
            <button type="submit" className="btn-fire w-full" disabled={pending}>
              {pending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Gerar link
            </button>
          </form>
        ) : (
          <p className="text-sm text-ash-400">Cadastre um cliente (ou conecte a Meta em Integrações) para gerar links.</p>
        )}
      </Panel>

      <div className="space-y-3 xl:col-span-2">
        {!links.length && <p className="glass p-8 text-center text-sm text-ash-400">Nenhum link criado ainda.</p>}
        <AnimatePresence initial={false}>
          {links.map((l) => {
            const url = `${origin}/share/${l.token}`;
            return (
              <motion.div
                key={l.id}
                layout
                initial={{ opacity: 0, y: -12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className={clsx("glass glass-hover p-4", !l.active && "opacity-60")}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-fire-500/15 text-fire-400">
                    <Link2 size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`led ${l.active ? "led-active" : "led-paused"}`} />
                      <span className="truncate font-medium text-white">{l.label}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-ash-400">
                      {nameOf(l.client_id)} · criado em {new Date(l.created_at).toLocaleDateString("pt-BR")} · <Eye size={11} className="inline" /> {l.views} visualizações
                    </div>
                  </div>
                  <Toggle on={l.active} disabled={pending} onChange={() => start(() => updateShareLink(l.id, { active: !l.active }))} label={l.active ? "Ativo" : "Desativado"} />
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/5 bg-black/40 px-3 py-2">
                  <span className="flex-1 truncate font-mono text-xs text-fire-200">{url}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(url);
                      setCopied(l.id);
                      setTimeout(() => setCopied(null), 1500);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-ash-300 hover:bg-fire-500/10 hover:text-fire-300"
                  >
                    {copied === l.id ? <Check size={14} className="text-good" /> : <Copy size={14} />}
                    {copied === l.id ? "Copiado" : "Copiar"}
                  </button>
                  <a href={`/share/${l.token}`} target="_blank" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-ash-300 hover:bg-fire-500/10 hover:text-fire-300">
                    <ExternalLink size={14} /> Abrir
                  </a>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <Toggle on={l.show_revenue} disabled={pending} onChange={() => start(() => updateShareLink(l.id, { show_revenue: !l.show_revenue }))} label="Receita e ROAS" />
                  <Toggle on={l.show_creatives} disabled={pending} onChange={() => start(() => updateShareLink(l.id, { show_creatives: !l.show_creatives }))} label="Criativos" />
                  <button
                    className="ml-auto inline-flex items-center gap-1.5 text-xs text-ash-500 hover:text-bad"
                    onClick={async () => {
                      const ok = await confirm({ title: `Excluir o link "${l.label}"?`, message: "Quem tiver este endereço perde o acesso ao painel na hora. Não dá para desfazer.", danger: true });
                      if (ok) start(() => deleteShareLink(l.id));
                    }}
                  >
                    <Trash2 size={13} /> Excluir
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
