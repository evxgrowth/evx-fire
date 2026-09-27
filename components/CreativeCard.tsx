"use client";

import { motion } from "framer-motion";
import { Images, Play, Search, ImageIcon } from "lucide-react";
import type { Campaign, Creative } from "@/lib/types";
import { fmtMoney, fmtNum, fmtPct } from "@/lib/format";
import PlatformBadge from "./PlatformIcon";

const formatInfo = {
  image: { icon: ImageIcon, label: "Imagem" },
  video: { icon: Play, label: "Vídeo" },
  carousel: { icon: Images, label: "Carrossel" },
  search: { icon: Search, label: "Anúncio de pesquisa" },
};

/** Prévia do criativo. Quando a API trouxer a imagem real, usamos imageUrl. */
export function CreativeThumb({ c }: { c: Creative }) {
  const F = formatInfo[c.format];
  if (c.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={c.imageUrl} alt={c.headline} className="h-full w-full object-cover" />;
  }
  if (c.format === "search") {
    return (
      <div className="flex h-full flex-col justify-center gap-1 bg-coal-800 p-4 text-left">
        <div className="text-[10px] text-ash-400">Patrocinado · seusite.com.br</div>
        <div className="text-sm font-semibold leading-snug text-[#8ab4f8]">{c.headline} | Site Oficial</div>
        <div className="line-clamp-2 text-[11px] text-ash-300">{c.body}</div>
      </div>
    );
  }
  return (
    <div
      className="relative flex h-full items-end overflow-hidden p-4"
      style={{
        background: `radial-gradient(120% 80% at 80% 10%, hsl(${c.hue + 15} 100% 62% / .9), transparent 55%), radial-gradient(90% 90% at 10% 100%, hsl(${c.hue} 100% 45%), hsl(${c.hue} 60% 8%))`,
      }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(transparent_40%,rgba(0,0,0,.75))]" />
      <F.icon className="absolute right-3 top-3 text-white/80" size={18} />
      {c.format === "video" && (
        <span className="absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/40 backdrop-blur">
          <Play size={20} className="ml-0.5 text-white" fill="white" />
        </span>
      )}
      <div className="relative font-display text-base font-bold leading-tight text-white drop-shadow-lg">{c.headline}</div>
    </div>
  );
}

export default function CreativeCard({ c, campaign, index = 0 }: { c: Creative; campaign?: Campaign; index?: number }) {
  const ctr = c.impressions ? (c.clicks / c.impressions) * 100 : 0;
  const F = formatInfo[c.format];
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.45 }}
      className="glass glass-hover group overflow-hidden"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <div className="h-full transition-transform duration-700 group-hover:scale-105">
          <CreativeThumb c={c} />
        </div>
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-1 text-[10px] font-medium text-white backdrop-blur">
          <span className={`led ${c.active ? "led-active" : "led-paused"}`} />
          {c.active ? "Rodando" : "Parado"}
        </span>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{c.name}</div>
            <div className="truncate text-[11px] text-ash-400">{campaign ? campaign.name : F.label}</div>
          </div>
          {campaign && <PlatformBadge platform={campaign.platform} withLabel={false} />}
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            ["Gasto", fmtMoney(c.spend).replace(",00", "")],
            ["Impr.", fmtNum(c.impressions)],
            ["CTR", fmtPct(ctr)],
            ["Conv.", fmtNum(c.conversions)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-white/[0.03] px-1 py-1.5">
              <div className="text-[9px] uppercase tracking-wider text-ash-400">{k}</div>
              <div className="truncate text-xs font-semibold tabular-nums text-white">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
