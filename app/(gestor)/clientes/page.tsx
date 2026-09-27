"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { Archive, ArchiveRestore, Loader2, Pencil, Plus, Power, Search, Share2, X } from "lucide-react";
import { useData } from "@/components/DataProvider";
import { useDebounced, usePref } from "@/components/Prefs";
import { GoogleAdsIcon, MetaIcon } from "@/components/PlatformIcon";
import { PageHeader, Pill } from "@/components/ui";
import { filterCampaigns, totalsOf } from "@/lib/data";
import { fmtMoney, fmtNum, fmtX } from "@/lib/format";
import type { Client } from "@/lib/types";
import { createClientRecord, setClientActive, updateClientRecord } from "../actions";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function ClientModal({ client, onClose }: { client: Client | "new"; onClose: () => void }) {
  const isNew = client === "new";
  const [name, setName] = useState(isNew ? "" : client.name);
  const [segment, setSegment] = useState(isNew ? "" : client.segment);
  const [notes, setNotes] = useState(isNew ? "" : (client.notes ?? ""));
  const [pending, start] = useTransition();
  return (
    <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.form
        initial={{ scale: 0.95, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        className="glass neon-ring w-full max-w-md space-y-3 rounded-3xl p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          start(async () => {
            if (isNew) await createClientRecord(name, segment, notes);
            else await updateClientRecord(client.id, name, segment, notes);
            onClose();
          });
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-white">{isNew ? "Novo cliente" : "Editar cliente"}</h2>
          <button type="button" onClick={onClose} className="text-ash-400 hover:text-white" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <input className="input" placeholder="Nome do cliente" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        <input className="input" placeholder="Segmento (ex.: Saúde, E-commerce, Academia)" value={segment} onChange={(e) => setSegment(e.target.value)} />
        <textarea className="input min-h-[80px]" placeholder="Observações (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button className="btn-fire w-full" disabled={pending}>
          {pending ? <Loader2 size={16} className="animate-spin" /> : isNew ? "Cadastrar cliente" : "Salvar"}
        </button>
      </motion.form>
    </motion.div>
  );
}

export default function ClientesPage() {
  const { clients, campaigns, demo } = useData();
  const [prefs, setPrefs] = usePref("clients.filters", { kind: "all" as "all" | "api" | "manual", showInactive: false });
  const [search, setSearch] = useState("");
  const q = useDebounced(search, 300);
  const [modal, setModal] = useState<Client | "new" | null>(null);
  const [pending, start] = useTransition();

  const inactiveCount = clients.filter((c) => !c.active).length;
  const rows = useMemo(() => {
    return clients
      .filter((c) => c.active !== prefs.showInactive)
      .map((c) => {
        const list = filterCampaigns(campaigns, { clientId: c.id });
        const connected = !!(c.metaAccountId || c.googleCustomerId);
        const manual = list.filter((x) => x.source === "manual").length;
        return { c, list, connected, manual };
      })
      .filter((r) => prefs.kind === "all" || (prefs.kind === "api" ? r.connected : r.manual > 0 || !r.connected))
      .filter((r) => !q.trim() || norm(r.c.name + " " + r.c.segment).includes(norm(q.trim())));
  }, [clients, campaigns, prefs.kind, prefs.showInactive, q]);

  return (
    <>
      <PageHeader
        title={prefs.showInactive ? "Clientes inativos" : "Clientes"}
        subtitle={
          prefs.showInactive
            ? "Clientes desativados: as campanhas deles não aparecem nos painéis nem são enviadas aos destinos."
            : "Cada cliente reúne as contas de anúncio conectadas e as campanhas manuais dele."
        }
      >
        {!demo && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPrefs({ ...prefs, showInactive: !prefs.showInactive })}
              className={clsx(
                "relative grid h-10 w-10 place-items-center rounded-xl border transition-colors",
                prefs.showInactive ? "border-fire-500/50 bg-fire-500/15 text-fire-300" : "border-white/10 bg-white/[0.03] text-ash-400 hover:text-white",
              )}
              title={prefs.showInactive ? "Voltar para clientes ativos" : "Ver clientes inativos"}
              aria-label={prefs.showInactive ? "Voltar para clientes ativos" : "Ver clientes inativos"}
            >
              <Archive size={17} />
              {inactiveCount > 0 && !prefs.showInactive && (
                <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-coal-600 px-1 text-[9px] font-bold text-white">{inactiveCount}</span>
              )}
            </button>
            <button className="btn-fire" onClick={() => setModal("new")}>
              <Plus size={16} /> Novo cliente
            </button>
          </div>
        )}
      </PageHeader>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-white/5 bg-black/30 p-1 text-xs">
          {(
            [
              ["all", "Todos"],
              ["api", "Com conta conectada"],
              ["manual", "Com campanhas manuais"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setPrefs({ ...prefs, kind: v })}
              className={clsx("rounded-lg px-3 py-1.5 font-medium transition-colors", prefs.kind === v ? "bg-fire-500/15 text-white" : "text-ash-400 hover:text-white")}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ash-400" />
          <input className="input !py-2 !pl-9" placeholder="Buscar cliente…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {!rows.length && (
        <p className="py-16 text-center text-sm text-ash-400">
          {prefs.showInactive ? "Nenhum cliente inativo." : clients.length ? "Nenhum cliente com esses filtros." : "Nenhum cliente ainda. Conecte a Meta em Integrações ou cadastre um cliente manualmente."}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ c, list, manual }, i) => {
          const t = totalsOf(list);
          const running = list.filter((x) => x.status === "active" || x.status === "learning").length;
          return (
            <motion.div
              key={c.id}
              layout
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 12) * 0.04 }}
              className={clsx("glass glass-hover p-5", !c.active && "opacity-70")}
            >
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-fire-400 to-fire-700 font-display text-lg font-bold text-white shadow-[0_0_24px_-6px_rgba(255,92,0,.8)]">
                  {c.name
                    .replace(/[^\p{L}\p{N} ]/gu, "")
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join("")
                    .toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display font-semibold text-white">{c.name}</div>
                  <div className="text-xs text-ash-400">{c.segment || "—"}</div>
                </div>
                {!demo && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button className="grid h-7 w-7 place-items-center rounded-lg text-ash-500 hover:bg-white/5 hover:text-fire-300" onClick={() => setModal(c)} aria-label="Editar cliente" title="Editar">
                      <Pencil size={13} />
                    </button>
                    <button
                      className={clsx("grid h-7 w-7 place-items-center rounded-lg hover:bg-white/5", c.active ? "text-ash-500 hover:text-bad" : "text-ash-400 hover:text-good")}
                      disabled={pending}
                      onClick={() => start(() => setClientActive(c.id, !c.active))}
                      aria-label={c.active ? "Desativar cliente" : "Reativar cliente"}
                      title={c.active ? "Desativar cliente" : "Reativar cliente"}
                    >
                      {c.active ? <Power size={13} /> : <ArchiveRestore size={14} />}
                    </button>
                  </div>
                )}
              </div>

              {c.active && (
                <>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Pill tone={running ? "good" : "muted"}>
                      <span className={`led ${running ? "led-active" : "led-paused"}`} /> {running} ativas
                    </Pill>
                    {manual > 0 && <Pill tone="muted">{manual} manuais</Pill>}
                  </div>
                  <div className="mt-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-3 py-2">
                      <span className="flex shrink-0 items-center gap-2 text-ash-300">
                        <span className="text-meta">
                          <MetaIcon size={14} />
                        </span>{" "}
                        Meta Ads
                      </span>
                      <span className="truncate font-mono text-ash-200">{c.metaAccountId ?? <span className="text-ash-500">não conectado</span>}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-3 py-2">
                      <span className="flex shrink-0 items-center gap-2 text-ash-300">
                        <span className="text-google">
                          <GoogleAdsIcon size={14} />
                        </span>{" "}
                        Google Ads
                      </span>
                      <span className="truncate font-mono text-ash-200">{c.googleCustomerId ?? <span className="text-ash-500">não conectado</span>}</span>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/5 pt-4 text-center">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-ash-400">Investido 30d</div>
                      <div className="text-sm font-semibold text-white">{fmtMoney(t.spend).replace(/,\d\d$/, "")}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-ash-400">Resultados</div>
                      <div className="text-sm font-semibold text-white">{fmtNum(t.conversions)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-ash-400">ROAS</div>
                      <div className="text-sm font-semibold text-fire-300">{fmtX(t.roas)}</div>
                    </div>
                  </div>
                  {!demo && (
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Link href={`/campanhas/nova?cliente=${c.id}`} className="btn-ghost !py-2 !text-xs">
                        <Plus size={14} /> Campanha manual
                      </Link>
                      <Link href="/compartilhar" className="btn-ghost !py-2 !text-xs">
                        <Share2 size={14} /> Link do cliente
                      </Link>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>{modal && <ClientModal client={modal} onClose={() => setModal(null)} />}</AnimatePresence>
    </>
  );
}
