"use client";

import { useMemo } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { campaignTotals, dailySeries, filterCampaigns, topCreatives, totalsOf, type Filters } from "@/lib/data";
import { fmtMoney, fmtNum, fmtNumShort, fmtPct, fmtX } from "@/lib/format";
import type { Campaign, Client } from "@/lib/types";
import { Legend, PlatformDonut, RevenueChart, SERIES, SpendChart } from "../charts";
import { CreativeThumb } from "../CreativeCard";
import { Flame } from "../FlameLogo";
import PlatformBadge from "../PlatformIcon";
import { statusLabels } from "../StatusLed";

const fmtDate = (iso: string) => iso.split("-").reverse().join("/");

function Page({ n, total, children }: { n: number; total: number; children: React.ReactNode }) {
  return (
    <section className="report-page relative mx-auto mb-8 flex w-[794px] flex-col overflow-hidden rounded-2xl border border-white/5 bg-coal-900 shadow-[0_30px_80px_-30px_rgba(0,0,0,.9)] print:mb-0 print:rounded-none print:border-0">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-[radial-gradient(60%_100%_at_50%_100%,rgba(255,92,0,.14),transparent)]" />
      <div className="relative flex-1 px-12 pb-6 pt-10">{children}</div>
      <footer className="relative flex items-center justify-between border-t border-white/5 px-12 py-4 text-[10px] text-ash-500">
        <span>
          Relatório gerado pela <b className="text-fire-400">EVX Fire</b> · fire.evxgrowth.com.br
        </span>
        <span>
          Página {n} de {total}
        </span>
      </footer>
    </section>
  );
}

function Tile({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${accent ? "border-fire-500/40 bg-fire-500/10" : "border-white/5 bg-white/[0.03]"}`}>
      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ash-400">{label}</div>
      <div className="mt-1 font-display text-[19px] font-bold tabular-nums text-white">{value}</div>
    </div>
  );
}

function H({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-3">
      <h2 className="font-display text-[15px] font-semibold text-white">{children}</h2>
      {sub && <p className="text-[10px] text-ash-400">{sub}</p>}
    </div>
  );
}

export default function ReportView({
  campaigns,
  clients,
  filters,
  agencyName,
  defaultTitle,
  hideRevenue: hideRevenueProp = false,
  hideCreatives = false,
  backHref,
}: {
  campaigns: Campaign[];
  clients: Client[];
  filters: Filters;
  agencyName: string;
  defaultTitle?: string;
  hideRevenue?: boolean;
  hideCreatives?: boolean;
  backHref: string;
}) {
  const d = useMemo(() => {
    const list = filterCampaigns(campaigns, filters);
    const t = totalsOf(list);
    const series = dailySeries(list);
    const rows = list
      .map((c) => ({ c, t: campaignTotals(c) }))
      .filter((r) => r.t.spend > 0 || r.c.status === "active")
      .sort((a, b) => b.t.spend - a.t.spend);
    const best = [...rows].filter((r) => r.t.conversions > 0).sort((a, b) => a.t.cpa - b.t.cpa)[0];
    const most = [...rows].sort((a, b) => b.t.conversions - a.t.conversions)[0];
    return {
      list,
      t,
      series,
      rows,
      best,
      most,
      meta: totalsOf(list.filter((c) => c.platform === "meta")).spend,
      google: totalsOf(list.filter((c) => c.platform === "google")).spend,
      creatives: topCreatives(list, 9),
      active: list.filter((c) => c.status === "active").length,
    };
  }, [campaigns, filters]);

  // Sem receita no período (ex.: campanhas de leads): receita e ROAS não aparecem
  const hideRevenue = hideRevenueProp || d.t.revenue <= 0;
  const days = d.series;
  const from = days[0]?.date;
  const to = days.at(-1)?.date;
  const clientNames = filters.clients.map((id) => clients.find((c) => c.id === id)?.name).filter(Boolean) as string[];
  const title = defaultTitle ?? (clientNames.length ? clientNames.join(" · ") : agencyName || "Todas as contas");
  const generated = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const filterNotes = [
    filters.platform !== "all" ? (filters.platform === "meta" ? "Meta Ads" : "Google Ads") : null,
    filters.statuses.length ? filters.statuses.map((s) => statusLabels[s]).join(", ") : null,
    filters.sources.length === 1 ? (filters.sources[0] === "api" ? "Campanhas conectadas" : "Campanhas manuais") : null,
    filters.include.length ? `Contém: ${filters.include.join(", ")}` : null,
    filters.exclude.length ? `Sem: ${filters.exclude.join(", ")}` : null,
  ].filter(Boolean) as string[];

  const total = hideCreatives || !d.creatives.length ? 2 : 3;
  const legend = [
    ...(d.meta > 0 ? [{ color: SERIES.meta, label: "Meta Ads" }] : []),
    ...(d.google > 0 ? [{ color: SERIES.google, label: "Google Ads" }] : []),
  ];
  const t = d.t;

  return (
    <div className="report min-h-screen py-8 print:py-0">
      {/* Barra de ações (não sai no PDF) */}
      <div className="no-print sticky top-0 z-20 mx-auto mb-6 flex w-[794px] max-w-[calc(100vw-2rem)] flex-wrap items-center gap-3 rounded-2xl border border-fire-500/20 bg-coal-900/90 px-4 py-3 backdrop-blur-xl">
        <a href={backHref} className="inline-flex items-center gap-2 text-xs text-ash-400 hover:text-fire-300">
          <ArrowLeft size={14} /> Voltar
        </a>
        <span className="text-xs text-ash-400">Clique no título ou nas observações para editar antes de salvar.</span>
        <button onClick={() => window.print()} className="btn-fire ml-auto !py-2 !text-xs">
          <Printer size={14} /> Salvar como PDF
        </button>
        <span className="w-full text-[11px] text-ash-500">Na janela que abrir, escolha o destino <b className="text-ash-300">&quot;Salvar como PDF&quot;</b> e ative &quot;Gráficos de plano de fundo&quot;.</span>
      </div>

      {/* ---------- Página 1: capa + visão geral ---------- */}
      <Page n={1} total={total}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame size={40} />
            <div className="font-display text-lg font-extrabold">
              <span className="text-white">EVX</span> <span className="text-fire-400">FIRE</span>
            </div>
          </div>
          <div className="text-right text-[10px] uppercase tracking-[0.2em] text-ash-400">
            Relatório de desempenho
            <div className="mt-0.5 normal-case tracking-normal">{generated}</div>
          </div>
        </div>

        <div className="mt-8">
          <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-fire-400">Tráfego pago</div>
          <h1 contentEditable suppressContentEditableWarning className="mt-1 font-display text-[32px] font-bold leading-tight text-white outline-none focus:ring-1 focus:ring-fire-500/40">
            {title}
          </h1>
          <p className="mt-1 text-xs text-ash-300">
            {from && to ? `Período: ${fmtDate(from)} a ${fmtDate(to)} (${filters.period} dias)` : "Sem dados no período"}
            {agencyName ? ` · Gestão: ${agencyName}` : ""}
          </p>
          {filterNotes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {filterNotes.map((n) => (
                <span key={n} className="rounded-full border border-fire-500/25 bg-fire-500/10 px-2 py-0.5 text-[9px] text-fire-200">
                  {n}
                </span>
              ))}
            </div>
          )}
          <div className="ember-line mt-5 opacity-60" />
        </div>

        <div className="mt-6 grid grid-cols-4 gap-3">
          {(hideRevenue
            ? [
                ["Investimento", fmtMoney(t.spend)],
                ["Resultados", fmtNum(t.conversions)],
                ["Custo por resultado", t.conversions ? fmtMoney(t.cpa) : "—"],
                ["Impressões", fmtNumShort(t.impressions)],
                ["Alcance", fmtNumShort(t.reach)],
                ["Cliques", fmtNum(t.clicks)],
                ["CTR", fmtPct(t.ctr)],
                ["CPC", fmtMoney(t.cpc)],
              ]
            : [
                ["Investimento", fmtMoney(t.spend)],
                ["Receita", fmtMoney(t.revenue)],
                ["ROAS", fmtX(t.roas)],
                ["Resultados", fmtNum(t.conversions)],
                ["Custo por resultado", t.conversions ? fmtMoney(t.cpa) : "—"],
                ["Impressões", fmtNumShort(t.impressions)],
                ["Cliques", fmtNum(t.clicks)],
                ["CTR", fmtPct(t.ctr)],
              ]
          ).map(([l, v], i) => (
            <Tile key={l} label={l} value={v} accent={i === 0} />
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <div className="flex items-start justify-between">
            <H sub="Valor investido por dia">Investimento diário</H>
            <Legend items={legend} />
          </div>
          <SpendChart data={days} still height={210} showMeta={d.meta > 0} showGoogle={d.google > 0} />
        </div>

        <div className="mt-4 grid grid-cols-5 gap-4">
          <div className="col-span-2 rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <H>Divisão por plataforma</H>
            <PlatformDonut meta={d.meta} google={d.google} still />
          </div>
          <div className="col-span-3 rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <H>Destaques do período</H>
            <ul className="space-y-3 text-[11px] leading-relaxed text-ash-200">
              <li>
                <b className="text-white">{d.active}</b> campanha(s) ativas de <b className="text-white">{d.list.length}</b> no relatório.
              </li>
              {d.most && d.most.t.conversions > 0 && (
                <li>
                  Mais resultados: <b className="text-white">{d.most.c.name}</b> com <b className="text-fire-300">{fmtNum(d.most.t.conversions)}</b> resultados.
                </li>
              )}
              {d.best && (
                <li>
                  Menor custo por resultado: <b className="text-white">{d.best.c.name}</b> a <b className="text-fire-300">{fmtMoney(d.best.t.cpa)}</b>.
                </li>
              )}
              <li>
                CPC médio de <b className="text-white">{fmtMoney(t.cpc)}</b> e CPM de <b className="text-white">{fmtMoney(t.cpm)}</b>.
              </li>
            </ul>
          </div>
        </div>
      </Page>

      {/* ---------- Página 2: resultados e campanhas ---------- */}
      <Page n={2} total={total}>
        <div className="grid grid-cols-5 gap-4">
          <div className={`${hideRevenue ? "col-span-5" : "col-span-3"} rounded-xl border border-white/5 bg-white/[0.02] p-4`}>
            <H sub="Da impressão até o resultado">Funil</H>
            {[
              ["Impressões", t.impressions, 100, null],
              ["Cliques", t.clicks, 72, t.impressions ? `${fmtPct((t.clicks / t.impressions) * 100)} CTR` : null],
              ["Resultados", t.conversions, 46, t.clicks ? `${fmtPct((t.conversions / t.clicks) * 100)} conversão` : null],
            ].map(([l, v, w, r]) => (
              <div key={l as string} className="mb-2.5">
                <div className="mb-1 flex justify-between text-[10px] text-ash-300">
                  <span>{l as string}</span>
                  <span className="text-ash-400">{r as string}</span>
                </div>
                <div className="flex h-7 items-center rounded-md bg-gradient-to-r from-fire-600 to-fire-400/60 px-2.5 font-display text-xs font-bold text-white" style={{ width: `${w}%` }}>
                  {fmtNumShort(v as number)}
                </div>
              </div>
            ))}
          </div>
          {!hideRevenue && (
            <div className="col-span-2 rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <H sub="Vendas atribuídas aos anúncios">Receita diária</H>
              <RevenueChart data={days} still height={130} />
            </div>
          )}
        </div>

        <div className="mt-5">
          <H sub={`${d.rows.length} campanha(s) com veiculação no período, por investimento`}>Campanhas</H>
          <table className="w-full text-[10px] [&_td]:px-2 [&_th]:px-2">
            <thead>
              <tr className="border-b border-white/10 text-left text-[8.5px] uppercase tracking-wider text-ash-400">
                <th className="py-2 font-medium">Campanha</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 text-right font-medium">Investido</th>
                <th className="py-2 text-right font-medium">Result.</th>
                <th className="py-2 text-right font-medium">Custo/res.</th>
                <th className="py-2 text-right font-medium">CTR</th>
                {!hideRevenue && <th className="py-2 text-right font-medium">ROAS</th>}
              </tr>
            </thead>
            <tbody>
              {d.rows.slice(0, 22).map(({ c, t: ct }) => (
                <tr key={c.id} className="border-b border-white/[0.05]">
                  <td className="py-1.5">
                    <div className="flex items-center gap-1.5">
                      <PlatformBadge platform={c.platform} withLabel={false} />
                      <span className="line-clamp-1 max-w-[270px] text-white">{c.name}</span>
                    </div>
                  </td>
                  <td className="py-1.5">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-ash-200">
                      <span className={`led led-${c.status} !h-1.5 !w-1.5`} /> {statusLabels[c.status]}
                    </span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-white">{fmtMoney(ct.spend)}</td>
                  <td className="py-1.5 text-right tabular-nums text-white">{fmtNum(ct.conversions)}</td>
                  <td className="py-1.5 text-right tabular-nums text-ash-200">{ct.conversions ? fmtMoney(ct.cpa) : "—"}</td>
                  <td className="py-1.5 text-right tabular-nums text-ash-200">{fmtPct(ct.ctr)}</td>
                  {!hideRevenue && <td className="py-1.5 text-right tabular-nums text-fire-300">{fmtX(ct.roas)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {d.rows.length > 22 && <p className="mt-2 text-[9px] text-ash-500">+ {d.rows.length - 22} campanha(s) com menor investimento.</p>}
        </div>

        {total === 2 && <Notes />}
      </Page>

      {/* ---------- Página 3: criativos ---------- */}
      {total === 3 && (
        <Page n={3} total={total}>
          <H sub="Os anúncios com mais resultados no período">Criativos em destaque</H>
          <div className="grid grid-cols-3 gap-3">
            {d.creatives.map((cr) => {
              const ctr = cr.impressions ? (cr.clicks / cr.impressions) * 100 : 0;
              return (
                <div key={cr.id} className="overflow-hidden rounded-xl border border-white/5 bg-white/[0.02]">
                  <div className="aspect-[4/3] overflow-hidden">
                    <CreativeThumb c={cr} />
                  </div>
                  <div className="p-2.5">
                    <div className="line-clamp-1 text-[10px] font-semibold text-white">{cr.name}</div>
                    <div className="line-clamp-1 text-[9px] text-ash-400">{cr.campaign.name}</div>
                    <div className="mt-1.5 grid grid-cols-3 gap-1 text-center">
                      {[
                        ["Gasto", fmtMoney(cr.spend).replace(/,\d\d$/, "")],
                        ["CTR", fmtPct(ctr, 1)],
                        ["Result.", fmtNum(cr.conversions)],
                      ].map(([k, v]) => (
                        <div key={k} className="rounded bg-white/[0.04] py-1">
                          <div className="text-[7.5px] uppercase tracking-wider text-ash-500">{k}</div>
                          <div className="text-[9.5px] font-semibold text-white">{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <Notes />
        </Page>
      )}
    </div>
  );
}

function Notes() {
  return (
    <div className="mt-5 rounded-xl border border-dashed border-fire-500/30 bg-fire-500/[0.04] p-4">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-fire-400">Observações do gestor</div>
      <div contentEditable suppressContentEditableWarning className="min-h-[60px] text-[11px] leading-relaxed text-ash-200 outline-none">
        Clique aqui para escrever os próximos passos, aprendizados do período e recomendações para o cliente.
      </div>
    </div>
  );
}
