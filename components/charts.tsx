"use client";

import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
  BarChart,
} from "recharts";
import { fmtDay, fmtMoney, fmtMoneyShort, fmtNum, fmtNumShort, fmtPct } from "@/lib/format";

export const SERIES = { meta: "#ff6a00", google: "#f3e6d8" } as const;
const AXIS = { fill: "#8f8177", fontSize: 11 };
const GRID = "rgba(255,255,255,0.05)";

type Row = { date: string; meta: number; google: number; revenue: number; conversions: number };

function TooltipBox({ title, rows }: { title: string; rows: { color?: string; label: string; value: string }[] }) {
  return (
    <div className="rounded-xl border border-fire-500/25 bg-coal-900/95 px-3 py-2 text-xs shadow-[0_10px_40px_-10px_rgba(255,92,0,.5)] backdrop-blur">
      <div className="mb-1.5 font-semibold text-white">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-6 py-0.5">
          <span className="flex items-center gap-2 text-ash-300">
            {r.color && <span className="h-2 w-2 rounded-full" style={{ background: r.color, boxShadow: `0 0 6px ${r.color}` }} />}
            {r.label}
          </span>
          <span className="font-medium tabular-nums text-white">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-ash-300">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color, boxShadow: `0 0 8px ${i.color}` }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Investimento diário empilhado por plataforma. */
export function SpendChart({ data, showMeta = true, showGoogle = true, still = false, height = 260 }: { data: Row[]; showMeta?: boolean; showGoogle?: boolean; still?: boolean; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="g-meta" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={SERIES.meta} stopOpacity={0.55} />
            <stop offset="1" stopColor={SERIES.meta} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="g-google" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={SERIES.google} stopOpacity={0.4} />
            <stop offset="1" stopColor={SERIES.google} stopOpacity={0.02} />
          </linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" tickFormatter={fmtDay} tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis tickFormatter={(v) => fmtMoneyShort(v)} tick={AXIS} axisLine={false} tickLine={false} width={64} />
        <Tooltip
          cursor={{ stroke: "rgba(255,154,61,.5)", strokeDasharray: "4 4" }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TooltipBox
                title={fmtDay(String(label))}
                rows={[
                  ...payload.map((p) => ({
                    color: String(p.stroke),
                    label: p.dataKey === "meta" ? "Meta Ads" : "Google Ads",
                    value: fmtMoney(Number(p.value)),
                  })),
                  ...(payload.length > 1
                    ? [{ label: "Total", value: fmtMoney(payload.reduce((a, p) => a + Number(p.value), 0)) }]
                    : []),
                ]}
              />
            ) : null
          }
        />
        {showGoogle && (
          <Area
            type="monotone"
            dataKey="google"
            stackId="1"
            stroke={SERIES.google}
            strokeWidth={2}
            fill="url(#g-google)"
            isAnimationActive={!still}
            animationDuration={1400}
            activeDot={{ r: 5, stroke: "#0c0907", strokeWidth: 2 }}
          />
        )}
        {showMeta && (
          <Area
            type="monotone"
            dataKey="meta"
            stackId="1"
            stroke={SERIES.meta}
            strokeWidth={2}
            fill="url(#g-meta)"
            filter={still ? undefined : "url(#glow)"}
            isAnimationActive={!still}
            animationDuration={1600}
            activeDot={{ r: 5, stroke: "#0c0907", strokeWidth: 2 }}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Receita diária (série única). */
export function RevenueChart({ data, still = false, height = 200 }: { data: Row[]; still?: boolean; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
        <defs>
          <linearGradient id="g-rev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffd9b0" />
            <stop offset="0.4" stopColor="#ff9a3d" />
            <stop offset="1" stopColor="#ff5c00" stopOpacity={0.5} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" tickFormatter={fmtDay} tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis tickFormatter={(v) => fmtMoneyShort(v)} tick={AXIS} axisLine={false} tickLine={false} width={64} />
        <Tooltip
          cursor={{ fill: "rgba(255,122,26,.08)" }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TooltipBox
                title={fmtDay(String(label))}
                rows={[
                  { color: "#ff9a3d", label: "Receita", value: fmtMoney(Number(payload[0].value)) },
                  { label: "Vendas", value: fmtNum(Number((payload[0].payload as Row).conversions)) },
                ]}
              />
            ) : null
          }
        />
        <Bar dataKey="revenue" fill="url(#g-rev)" radius={[4, 4, 0, 0]} isAnimationActive={!still} animationDuration={1400} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Divisão do investimento entre plataformas. */
export function PlatformDonut({ meta, google, still = false }: { meta: number; google: number; still?: boolean }) {
  const total = meta + google || 1;
  const data = [
    { name: "Meta Ads", value: meta, color: SERIES.meta },
    { name: "Google Ads", value: google, color: SERIES.google },
  ].filter((d) => d.value > 0);
  return (
    <div>
      <div className="relative">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            innerRadius={62}
            outerRadius={84}
            paddingAngle={data.length > 1 ? 3 : 0}
            stroke="#0c0907"
            strokeWidth={2}
            cornerRadius={6}
            isAnimationActive={!still}
            animationDuration={1400}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} style={{ filter: `drop-shadow(0 0 6px ${d.color}66)` }} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipBox
                  title={String(payload[0].name)}
                  rows={[
                    { label: "Investido", value: fmtMoney(Number(payload[0].value)) },
                    { label: "Participação", value: fmtPct((Number(payload[0].value) / total) * 100, 1) },
                  ]}
                />
              ) : null
            }
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-ash-400">Total</div>
          <div className="font-display text-lg font-bold text-white">{fmtMoneyShort(meta + google)}</div>
        </div>
      </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {[
          { label: "Meta Ads", v: meta, c: SERIES.meta },
          { label: "Google Ads", v: google, c: SERIES.google },
        ].map((d) => (
          <div key={d.label} className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
            <div className="flex items-center gap-2 text-[11px] text-ash-400">
              <span className="h-2 w-2 rounded-full" style={{ background: d.c, boxShadow: `0 0 6px ${d.c}` }} />
              {d.label}
            </div>
            <div className="mt-0.5 text-sm font-semibold text-white">{fmtPct((d.v / total) * 100, 1)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Funil: impressões → cliques → vendas. */
export function Funnel({ impressions, clicks, conversions }: { impressions: number; clicks: number; conversions: number }) {
  const steps = [
    { label: "Impressões", value: impressions, rate: null as string | null },
    { label: "Cliques", value: clicks, rate: impressions ? fmtPct((clicks / impressions) * 100) + " CTR" : null },
    { label: "Vendas / Leads", value: conversions, rate: clicks ? fmtPct((conversions / clicks) * 100) + " conv." : null },
  ];
  const widths = [100, 72, 46];
  return (
    <div className="space-y-3">
      {steps.map((s, i) => (
        <div key={s.label}>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="text-ash-300">{s.label}</span>
            <span className="text-ash-400">{s.rate}</span>
          </div>
          <div className="h-10 w-full">
            <motion.div
              className="relative flex h-full items-center overflow-hidden rounded-lg px-3"
              style={{
                background: `linear-gradient(90deg, rgba(255,92,0,${0.85 - i * 0.2}), rgba(255,154,61,${0.55 - i * 0.12}))`,
                boxShadow: "0 0 24px -6px rgba(255,92,0,.6)",
              }}
              initial={{ width: 0 }}
              animate={{ width: `${widths[i]}%` }}
              transition={{ duration: 1, delay: 0.2 + i * 0.2, ease: "easeOut" }}
            >
              <span className="relative z-10 font-display text-sm font-bold text-white drop-shadow">{fmtNumShort(s.value)}</span>
              <span className="ember-line absolute inset-x-0 bottom-0 opacity-60" />
            </motion.div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Barra horizontal de comparação (ex.: ROAS de cada campanha). */
export function MeterBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.max(2, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/5">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-fire-600 to-fire-300"
          style={{ boxShadow: "0 0 8px rgba(255,122,26,.8)" }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </div>
      <span className="w-12 text-right text-xs font-medium tabular-nums text-white">{label}</span>
    </div>
  );
}
