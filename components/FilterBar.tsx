"use client";

import clsx from "clsx";
import { motion } from "framer-motion";
import type { Filters, Period } from "@/lib/data";
import { useData } from "./DataProvider";
import { GoogleAdsIcon, MetaIcon } from "./PlatformIcon";

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  layoutId,
}: {
  value: T;
  options: { value: T; label: React.ReactNode }[];
  onChange: (v: T) => void;
  layoutId: string;
}) {
  return (
    <div className="inline-flex max-w-full overflow-x-auto rounded-xl border border-white/5 bg-black/30 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={clsx(
            "relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            value === o.value ? "text-white" : "text-ash-400 hover:text-ash-200",
          )}
        >
          {value === o.value && (
            <motion.span
              layoutId={layoutId}
              className="absolute inset-0 rounded-lg border border-fire-500/40 bg-fire-500/15 shadow-[0_0_16px_-4px_rgba(255,92,0,.7)]"
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
            />
          )}
          <span className="relative z-10 inline-flex items-center gap-1.5">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export default function FilterBar({
  filters,
  onChange,
  showClient = true,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  showClient?: boolean;
}) {
  const { clients } = useData();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Segmented<Period>
        layoutId="seg-period"
        value={filters.period}
        onChange={(period) => onChange({ ...filters, period })}
        options={[
          { value: 7, label: "7 dias" },
          { value: 14, label: "14 dias" },
          { value: 30, label: "30 dias" },
        ]}
      />
      <Segmented<Filters["platform"]>
        layoutId="seg-platform"
        value={filters.platform}
        onChange={(platform) => onChange({ ...filters, platform })}
        options={[
          { value: "all", label: "Todas" },
          { value: "meta", label: <><MetaIcon size={14} /> Meta</> },
          { value: "google", label: <><GoogleAdsIcon size={14} /> Google</> },
        ]}
      />
      {showClient && (
        <select
          value={filters.clientId}
          onChange={(e) => onChange({ ...filters, clientId: e.target.value })}
          className="input !w-auto !py-2 !text-xs"
        >
          <option value="all">Todos os clientes</option>
          {clients.filter((c) => c.active).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
