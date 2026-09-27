"use client";

import Link from "next/link";
import { useTransition } from "react";
import { motion } from "framer-motion";
import { Pencil, Plus, Share2 } from "lucide-react";
import { useData } from "@/components/DataProvider";
import { createClientRecord, updateClientRecord } from "../actions";
import { GoogleAdsIcon, MetaIcon } from "@/components/PlatformIcon";
import { PageHeader, Pill } from "@/components/ui";
import { filterCampaigns, totalsOf } from "@/lib/data";
import { fmtMoney, fmtNum, fmtX } from "@/lib/format";

export default function ClientesPage() {
  const { clients, campaigns, demo } = useData();
  const [pending, start] = useTransition();
  return (
    <>
      <PageHeader title="Clientes" subtitle="Cada cliente reúne as contas de anúncio dele na Meta e no Google.">
        {!demo && (
          <button
            className="btn-fire"
            disabled={pending}
            onClick={() => {
              const name = prompt("Nome do cliente:");
              if (name) start(async () => void (await createClientRecord(name)));
            }}
          >
            <Plus size={16} /> Novo cliente
          </button>
        )}
      </PageHeader>
      {!clients.length && (
        <p className="py-16 text-center text-sm text-ash-400">Nenhum cliente ainda. Conecte sua conta da Meta em Integrações: cada conta de anúncio vira um cliente automaticamente.</p>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {clients.map((c, i) => {
          const list = filterCampaigns(campaigns, { clientId: c.id });
          const t = totalsOf(list);
          const running = list.filter((x) => x.status === "active" || x.status === "learning").length;
          return (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              className="glass glass-hover p-5"
            >
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-fire-400 to-fire-700 font-display text-lg font-bold text-white shadow-[0_0_24px_-6px_rgba(255,92,0,.8)]">
                  {c.name.split(" ").slice(0, 2).map((w) => w[0]).join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-display font-semibold text-white">{c.name}</span>
                    {!demo && (
                      <button
                        className="shrink-0 text-ash-500 hover:text-fire-300"
                        aria-label="Editar cliente"
                        onClick={() => {
                          const name = prompt("Nome do cliente:", c.name);
                          if (!name) return;
                          const segment = prompt("Segmento (ex.: Saúde, E-commerce):", c.segment) ?? c.segment;
                          start(() => updateClientRecord(c.id, name, segment));
                        }}
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                  </div>
                  <div className="text-xs text-ash-400">{c.segment || "—"}</div>
                </div>
                <Pill tone={running ? "good" : "muted"}>
                  <span className={`led ${running ? "led-active" : "led-paused"}`} /> {running} ativas
                </Pill>
              </div>
              <div className="mt-4 space-y-2 text-xs">
                <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                  <span className="flex items-center gap-2 text-ash-300">
                    <span className="text-meta"><MetaIcon size={14} /></span> Meta Ads
                  </span>
                  <span className="font-mono text-ash-200">{c.metaAccountId ?? <span className="text-ash-500">não conectado</span>}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                  <span className="flex items-center gap-2 text-ash-300">
                    <span className="text-google"><GoogleAdsIcon size={14} /></span> Google Ads
                  </span>
                  <span className="font-mono text-ash-200">{c.googleCustomerId ?? <span className="text-ash-500">não conectado</span>}</span>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/5 pt-4 text-center">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-ash-400">Investido</div>
                  <div className="text-sm font-semibold text-white">{fmtMoney(t.spend).replace(/,\d\d$/, "")}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-ash-400">Vendas</div>
                  <div className="text-sm font-semibold text-white">{fmtNum(t.conversions)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-ash-400">ROAS</div>
                  <div className="text-sm font-semibold text-fire-300">{fmtX(t.roas)}</div>
                </div>
              </div>
              <Link href="/compartilhar" className="btn-ghost mt-4 w-full !py-2 !text-xs">
                <Share2 size={14} /> Compartilhar painel com o cliente
              </Link>
            </motion.div>
          );
        })}
      </div>
    </>
  );
}
