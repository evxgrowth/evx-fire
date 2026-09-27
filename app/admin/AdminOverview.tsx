"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Ban, Banknote, Building2, Users } from "lucide-react";
import KpiCard from "@/components/KpiCard";
import ManagersTable from "@/components/ManagersTable";
import { Panel } from "@/components/ui";
import type { Manager } from "@/lib/types";
import { fmtMoney, fmtMoneyShort, fmtNum } from "@/lib/format";

export default function AdminOverview({ managers }: { managers: Manager[] }) {
  const active = managers.filter((m) => m.status !== "suspended");
  const chart = [...managers].sort((a, b) => b.spendManaged - a.spendManaged).slice(0, 12).map((m) => ({ name: m.agency, value: m.spendManaged }));

  return (
    <>
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard id="a-m" index={0} label="Agências ativas" value={active.length} format={fmtNum} icon={Users} highlight />
        <KpiCard id="a-c" index={1} label="Clientes na plataforma" value={managers.reduce((a, m) => a + m.clients, 0)} format={fmtNum} icon={Building2} />
        <KpiCard id="a-s" index={2} label="Investimento gerenciado (30d)" value={managers.reduce((a, m) => a + m.spendManaged, 0)} format={fmtMoney} icon={Banknote} />
        <KpiCard id="a-r" index={3} label="Agências suspensas" value={managers.length - active.length} format={fmtNum} icon={Ban} />
      </div>

      <Panel title="Investimento gerenciado por agência" subtitle="Últimos 30 dias" className="mb-5" delay={0.2}>
        {chart.some((c) => c.value > 0) ? (
          <ResponsiveContainer width="100%" height={Math.max(160, chart.length * 40)}>
            <BarChart data={chart} layout="vertical" margin={{ left: 10, right: 20 }}>
              <defs>
                <linearGradient id="adm-bar" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#ff5c00" />
                  <stop offset="1" stopColor="#ffbd7a" />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => fmtMoneyShort(v)} tick={{ fill: "#8f8177", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fill: "#bfb1a6", fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: "rgba(255,122,26,.08)" }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <div className="rounded-xl border border-fire-500/25 bg-coal-900/95 px-3 py-2 text-xs">
                      <div className="font-semibold text-white">{String(payload[0].payload.name)}</div>
                      <div className="text-ash-300">{fmtMoney(Number(payload[0].value))}</div>
                    </div>
                  ) : null
                }
              />
              <Bar dataKey="value" fill="url(#adm-bar)" radius={[0, 4, 4, 0]} barSize={18} animationDuration={1400} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-10 text-center text-sm text-ash-400">Assim que os gestores conectarem as contas de anúncio, o volume aparece aqui.</p>
        )}
      </Panel>

      <Panel title="Agências e gestores" delay={0.3}>
        <ManagersTable managers={managers} />
      </Panel>
    </>
  );
}
