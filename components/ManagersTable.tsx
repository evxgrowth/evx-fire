"use client";

import { motion } from "framer-motion";
import { Ban, Play } from "lucide-react";
import type { Manager } from "@/lib/types";
import { fmtMoney } from "@/lib/format";
import { Pill } from "./ui";

const statusTone = { active: "good", trial: "warn", suspended: "bad" } as const;
const statusLabel = { active: "Ativo", trial: "Teste grátis", suspended: "Suspenso" };

export default function ManagersTable({ managers, onToggle }: { managers: Manager[]; onToggle?: (id: string) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full [&_td]:px-3 [&_th]:px-3 min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-white/5 text-left text-[11px] uppercase tracking-wider text-ash-400">
            <th className="py-3 pl-2 font-medium">Gestor / Agência</th>
            <th className="py-3 font-medium">Plano</th>
            <th className="py-3 font-medium">Status</th>
            <th className="py-3 text-right font-medium">Clientes</th>
            <th className="py-3 text-right font-medium">Invest. gerenciado (30d)</th>
            <th className="py-3 pl-6 font-medium">Último acesso</th>
            <th className="py-3 pr-2 text-right font-medium">Ações</th>
          </tr>
        </thead>
        <tbody>
          {managers.map((m, i) => (
            <motion.tr
              key={m.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="border-b border-white/[0.04] transition-colors hover:bg-fire-500/[0.05]"
            >
              <td className="py-3 pl-2">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-fire-300 to-fire-700 text-xs font-bold text-coal-950">
                    {m.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                  </div>
                  <div>
                    <div className="font-medium text-white">{m.name}</div>
                    <div className="text-[11px] text-ash-400">
                      {m.agency} · {m.email}
                    </div>
                  </div>
                </div>
              </td>
              <td className="py-3">
                <Pill tone={m.plan === "Agency" ? "fire" : "muted"}>{m.plan}</Pill>
              </td>
              <td className="py-3">
                <Pill tone={statusTone[m.status]}>{statusLabel[m.status]}</Pill>
              </td>
              <td className="py-3 text-right tabular-nums text-white">{m.clients}</td>
              <td className="py-3 text-right tabular-nums text-white">{fmtMoney(m.spendManaged)}</td>
              <td className="py-3 pl-6 text-ash-300">{m.lastSeen}</td>
              <td className="py-3 pr-2">
                <div className="flex justify-end gap-1">
                  {m.isOwner && <span className="text-[11px] text-fire-300">você</span>}
                  {onToggle && !m.isOwner && (
                    <button
                      onClick={() => onToggle(m.id)}
                      className={
                        m.status === "suspended"
                          ? "grid h-8 w-8 place-items-center rounded-lg text-ash-400 hover:bg-good/10 hover:text-good"
                          : "grid h-8 w-8 place-items-center rounded-lg text-ash-400 hover:bg-bad/10 hover:text-bad"
                      }
                      title={m.status === "suspended" ? "Reativar" : "Suspender"}
                    >
                      {m.status === "suspended" ? <Play size={15} /> : <Ban size={15} />}
                    </button>
                  )}
                </div>
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
