"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import clsx from "clsx";

function useCountUp(target: number, duration = 1400) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - k, 4);
      const cur = origin + (target - origin) * eased;
      setV(cur);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

function Sparkline({ data, id }: { data: number[]; id: string }) {
  if (data.length < 2) return null;
  const w = 120;
  const h = 36;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const pts = data.map((d, i) => [(i / (data.length - 1)) * w, h - 3 - ((d - min) / (max - min || 1)) * (h - 6)]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-3 h-8 w-full" aria-hidden>
      <defs>
        <linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff7a1a" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ff7a1a" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        d={`${line} L${w},${h} L0,${h} Z`}
        fill={`url(#sp-${id})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.8 }}
      />
      <motion.path
        d={line}
        fill="none"
        stroke="#ff9a3d"
        strokeWidth={2}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.4, ease: "easeOut" }}
        style={{ filter: "drop-shadow(0 0 4px rgba(255,122,26,.8))" }}
      />
    </svg>
  );
}

export interface KpiProps {
  id: string;
  label: string;
  value: number;
  format: (v: number) => string;
  icon: LucideIcon;
  delta?: number | null; // variação % vs período anterior
  invertDelta?: boolean; // ex.: CPA subir é ruim
  spark?: number[];
  highlight?: boolean;
  index?: number;
}

export default function KpiCard({ id, label, value, format, icon: Icon, delta, invertDelta, spark, highlight, index = 0 }: KpiProps) {
  const v = useCountUp(value);
  const good = delta == null ? null : invertDelta ? delta < 0 : delta >= 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.5, ease: "easeOut" }}
      className={clsx("glass glass-hover group relative overflow-hidden p-4", highlight && "neon-ring")}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-fire-600/10 blur-2xl transition-opacity duration-500 group-hover:bg-fire-600/25" />
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-ash-400">{label}</span>
        <span className="grid h-8 w-8 place-items-center rounded-lg border border-fire-500/20 bg-fire-500/10 text-fire-400">
          <Icon size={16} />
        </span>
      </div>
      <div className="mt-3">
        <div>
          <div className="font-display text-2xl font-bold tracking-tight text-white tabular-nums">{format(v)}</div>
          {delta != null && (
            <div
              className={clsx(
                "mt-1 inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                good ? "bg-good/10 text-good" : "bg-bad/10 text-bad",
              )}
            >
              {delta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {Math.abs(delta).toFixed(1).replace(".", ",")}%
              <span className="ml-1 font-normal text-ash-400">vs anterior</span>
            </div>
          )}
        </div>
        {spark && <Sparkline data={spark} id={id} />}
      </div>
    </motion.div>
  );
}
