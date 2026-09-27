"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import type { Campaign } from "@/lib/types";
import { campaignTotals } from "@/lib/data";
import { useData } from "./DataProvider";
import { fmtMoney, fmtNum, fmtPct, fmtX } from "@/lib/format";
import PlatformBadge from "./PlatformIcon";
import StatusLed from "./StatusLed";
import { MeterBar } from "./charts";

export default function CampaignTable({ campaigns, linkBase }: { campaigns: Campaign[]; linkBase?: string }) {
  const { clientById } = useData();
  const rows = campaigns.map((c) => ({ c, t: campaignTotals(c) })).sort((a, b) => b.t.spend - a.t.spend);
  const maxRoas = Math.max(...rows.map((r) => r.t.roas), 1);

  return (
    <div className="overflow-x-auto">
      <table className="w-full [&_td]:px-3 [&_th]:px-3 min-w-[860px] text-sm">
        <thead>
          <tr className="border-b border-white/5 text-left text-[11px] uppercase tracking-wider text-ash-400">
            <th className="py-3 pl-2 font-medium">Campanha</th>
            <th className="py-3 font-medium">Status</th>
            <th className="py-3 text-right font-medium">Investido</th>
            <th className="py-3 text-right font-medium">Impressões</th>
            <th className="py-3 text-right font-medium">Cliques</th>
            <th className="py-3 text-right font-medium">CTR</th>
            <th className="py-3 text-right font-medium">Vendas</th>
            <th className="py-3 pl-6 font-medium">ROAS</th>
            {linkBase && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ c, t }, i) => {
            const inner = (
              <>
                <td className="py-3 pl-2">
                  <div className="flex items-center gap-3">
                    <PlatformBadge platform={c.platform} withLabel={false} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="max-w-[280px] truncate font-medium text-white">{c.name}</span>
                        {c.source === "manual" && <span className="shrink-0 rounded border border-white/15 px-1.5 py-px text-[9px] uppercase tracking-wider text-ash-300">Manual</span>}
                      </div>
                      <div className="text-[11px] text-ash-400">
                        {clientById(c.clientId)?.name} · {c.objective}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="py-3">
                  <StatusLed status={c.status} />
                </td>
                <td className="py-3 text-right tabular-nums text-white">{fmtMoney(t.spend)}</td>
                <td className="py-3 text-right tabular-nums text-ash-200">{fmtNum(t.impressions)}</td>
                <td className="py-3 text-right tabular-nums text-ash-200">{fmtNum(t.clicks)}</td>
                <td className="py-3 text-right tabular-nums text-ash-200">{fmtPct(t.ctr)}</td>
                <td className="py-3 text-right tabular-nums text-white">{fmtNum(t.conversions)}</td>
                <td className="py-3 pl-6">
                  <MeterBar value={t.roas} max={maxRoas} label={fmtX(t.roas)} />
                </td>
              </>
            );
            return (
              <motion.tr
                key={c.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="group border-b border-white/[0.04] transition-colors hover:bg-fire-500/[0.05]"
              >
                {inner}
                {linkBase && (
                  <td className="py-3 pr-2 text-right">
                    <Link
                      href={`${linkBase}/${c.id}`}
                      className="inline-grid h-8 w-8 place-items-center rounded-lg text-ash-400 transition-all group-hover:bg-fire-500/15 group-hover:text-fire-300"
                      aria-label={`Abrir ${c.name}`}
                    >
                      <ChevronRight size={16} />
                    </Link>
                  </td>
                )}
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
