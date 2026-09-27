"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { ArrowLeft, Banknote, Eye, MousePointerClick, ShoppingCart, Target, Users } from "lucide-react";
import KpiCard from "@/components/KpiCard";
import PlatformBadge from "@/components/PlatformIcon";
import StatusLed from "@/components/StatusLed";
import CreativeCard from "@/components/CreativeCard";
import { Legend, RevenueChart, SERIES, SpendChart } from "@/components/charts";
import { Panel } from "@/components/ui";
import { campaignTotals, dailySeries } from "@/lib/data";
import { useData } from "@/components/DataProvider";
import { fmtMoney, fmtNum, fmtNumShort, fmtX } from "@/lib/format";

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const { campaigns, clientById } = useData();
  const c = campaigns.find((x) => x.id === id);
  if (!c) notFound();
  const t = campaignTotals(c);
  const s = dailySeries([c]);
  const color = SERIES[c.platform];

  return (
    <>
      <Link href="/campanhas" className="mb-4 inline-flex items-center gap-2 text-sm text-ash-400 hover:text-fire-300">
        <ArrowLeft size={16} /> Voltar para campanhas
      </Link>
      <div className="glass neon-ring mb-6 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <PlatformBadge platform={c.platform} />
          <StatusLed status={c.status} />
        </div>
        <h1 className="mt-3 font-display text-2xl font-bold text-white md:text-3xl">{c.name}</h1>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ash-400">
          <span>
            Cliente: <b className="font-medium text-ash-200">{clientById(c.clientId)?.name ?? "Sem cliente"}</b>
          </span>
          <span>
            Objetivo: <b className="font-medium text-ash-200">{c.objective}</b>
          </span>
          <span>
            Orçamento diário: <b className="font-medium text-ash-200">{fmtMoney(c.dailyBudget)}</b>
          </span>
          <span>
            ID: <b className="font-mono font-medium text-ash-200">{c.id}</b>
          </span>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard id="d-spend" index={0} label="Investido" value={t.spend} format={fmtMoney} icon={Banknote} highlight />
        <KpiCard id="d-imp" index={1} label="Impressões" value={t.impressions} format={fmtNumShort} icon={Eye} />
        <KpiCard id="d-reach" index={2} label="Alcance" value={t.reach} format={fmtNumShort} icon={Users} />
        <KpiCard id="d-clk" index={3} label="Cliques" value={t.clicks} format={fmtNum} icon={MousePointerClick} />
        <KpiCard id="d-conv" index={4} label="Vendas / Leads" value={t.conversions} format={fmtNum} icon={ShoppingCart} />
        <KpiCard id="d-roas" index={5} label="ROAS" value={t.roas} format={fmtX} icon={Target} />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Investimento diário" action={<Legend items={[{ color, label: c.platform === "meta" ? "Meta Ads" : "Google Ads" }]} />}>
          <SpendChart data={s} showMeta={c.platform === "meta"} showGoogle={c.platform === "google"} />
        </Panel>
        <Panel title="Receita diária">
          <RevenueChart data={s} />
        </Panel>
      </div>

      <h3 className="mb-3 font-display text-[15px] font-semibold text-white">Criativos desta campanha ({c.creatives.length})</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {c.creatives.map((cr, i) => (
          <CreativeCard key={cr.id} c={cr} index={i} />
        ))}
      </div>
    </>
  );
}
