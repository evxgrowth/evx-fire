"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { Filter, X } from "lucide-react";
import { activeFilterCount, defaultFilters, type Filters, type TermScope } from "@/lib/data";
import PeriodSelect from "./PeriodSelect";
import type { CampaignStatus } from "@/lib/types";
import { useData } from "./DataProvider";
import ChipsInput from "./ChipsInput";
import { GoogleAdsIcon, MetaIcon } from "./PlatformIcon";
import { statusLabels } from "./StatusLed";

function Segmented<T extends string | number>({ value, options, onChange, layoutId }: { value: T; options: { value: T; label: React.ReactNode }[]; onChange: (v: T) => void; layoutId: string }) {
  return (
    <div className="inline-flex max-w-full overflow-x-auto rounded-xl border border-white/5 bg-black/30 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={clsx("relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors", value === o.value ? "text-white" : "text-ash-400 hover:text-ash-200")}
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

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-all",
        on ? "border-fire-500/50 bg-fire-500/15 text-white shadow-[0_0_14px_-4px_rgba(255,92,0,.8)]" : "border-white/10 text-ash-300 hover:border-white/20",
      )}
    >
      {children}
    </button>
  );
}

const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
const SCOPES: [TermScope, string][] = [
  ["any", "Qualquer nível"],
  ["campaign", "Campanha"],
  ["adset", "Conjunto"],
  ["ad", "Anúncio"],
];
const STATUSES: CampaignStatus[] = ["active", "learning", "paused", "ended"];

/**
 * Barra de filtros do painel, campanhas e criativos.
 * `lockClient`: no link do cliente, o cliente já vem fixo (sem seletor de clientes).
 */
export default function FilterBar({
  filters,
  onChange,
  lockClient = false,
  extra,
  extraCount = 0,
  onClearExtra,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  lockClient?: boolean;
  /** filtros próprios da página, mostrados dentro do painel (ex.: criativos rodando/parados) */
  extra?: React.ReactNode;
  extraCount?: number;
  onClearExtra?: () => void;
}) {
  const { clients } = useData();
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const f = filters;
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...f, [k]: v });
  const count = activeFilterCount(f) - (lockClient && f.clients.length ? 1 : 0) + extraCount;
  const activeClients = clients.filter((c) => c.active);
  const nameOf = (id: string) => clients.find((c) => c.id === id)?.name ?? "cliente";
  const clear = () => {
    onChange({ ...defaultFilters, period: f.period, clients: lockClient ? f.clients : [] });
    onClearExtra?.();
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => panel.current && !panel.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  // Etiquetas dos filtros ligados (cada uma com ✕)
  const tags: { key: string; label: React.ReactNode; clear: () => void }[] = [];
  if (f.platform !== "all") tags.push({ key: "pl", label: f.platform === "meta" ? "Meta Ads" : "Google Ads", clear: () => set("platform", "all") });
  if (!lockClient) f.clients.forEach((id) => tags.push({ key: "c" + id, label: nameOf(id), clear: () => set("clients", f.clients.filter((x) => x !== id)) }));
  f.statuses.forEach((s) =>
    tags.push({
      key: "s" + s,
      label: (
        <>
          <span className={`led led-${s}`} /> {statusLabels[s]}
        </>
      ),
      clear: () => set("statuses", f.statuses.filter((x) => x !== s)),
    }),
  );
  f.sources.forEach((s) => tags.push({ key: "o" + s, label: s === "api" ? "Conectadas" : "Manuais", clear: () => set("sources", f.sources.filter((x) => x !== s)) }));
  const scopeLabel = SCOPES.find(([k]) => k === f.scope)?.[1].toLowerCase();
  f.include.forEach((t) =>
    tags.push({
      key: "i" + t,
      label: (
        <>
          contém <b className="font-mono">{t}</b>
          {f.scope !== "any" && <span className="text-ash-400"> ({scopeLabel})</span>}
        </>
      ),
      clear: () => set("include", f.include.filter((x) => x !== t)),
    }),
  );
  f.exclude.forEach((t) =>
    tags.push({
      key: "e" + t,
      label: (
        <>
          não contém <b className="font-mono">{t}</b>
        </>
      ),
      clear: () => set("exclude", f.exclude.filter((x) => x !== t)),
    }),
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <PeriodSelect value={f.period} onChange={(period) => set("period", period)} />
        <Segmented<Filters["platform"]>
          layoutId="seg-platform"
          value={f.platform}
          onChange={(platform) => set("platform", platform)}
          options={[
            { value: "all", label: "Todas" },
            {
              value: "meta",
              label: (
                <>
                  <MetaIcon size={14} /> Meta
                </>
              ),
            },
            {
              value: "google",
              label: (
                <>
                  <GoogleAdsIcon size={14} /> Google
                </>
              ),
            },
          ]}
        />
        <div className="relative" ref={panel}>
          <button
            onClick={() => setOpen((o) => !o)}
            className={clsx(
              "relative grid h-[34px] w-[34px] place-items-center rounded-xl border transition-all",
              open || count ? "border-fire-500/50 bg-fire-500/15 text-white shadow-[0_0_16px_-6px_rgba(255,92,0,.9)]" : "border-white/10 bg-black/30 text-ash-300 hover:text-white",
            )}
            aria-expanded={open}
            aria-label="Filtros"
            title="Filtros"
          >
            <Filter size={15} />
            {count > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-fire-500 px-1 text-[10px] font-bold text-coal-950">{count}</span>}
          </button>

          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="absolute left-0 top-full z-40 mt-2 w-[min(560px,calc(100vw-2rem))] space-y-5 rounded-2xl border border-fire-500/25 bg-coal-900/95 p-5 shadow-[0_24px_60px_-20px_rgba(0,0,0,.9),0_0_40px_-20px_rgba(255,92,0,.6)] backdrop-blur-xl"
              >
                {extra}
                {!lockClient && activeClients.length > 0 && (
                  <div>
                    <div className="mb-2 text-xs font-medium text-ash-300">Clientes</div>
                    <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">
                      {activeClients.map((c) => (
                        <Chip key={c.id} on={f.clients.includes(c.id)} onClick={() => set("clients", toggle(f.clients, c.id))}>
                          {c.name}
                        </Chip>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <div className="mb-2 text-xs font-medium text-ash-300">Status da campanha</div>
                  <div className="flex flex-wrap gap-2">
                    {STATUSES.map((s) => (
                      <Chip key={s} on={f.statuses.includes(s)} onClick={() => set("statuses", toggle(f.statuses, s))}>
                        <span className={`led led-${s}`} /> {statusLabels[s]}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs font-medium text-ash-300">Tipo</div>
                  <div className="flex flex-wrap gap-2">
                    <Chip on={f.sources.includes("api")} onClick={() => set("sources", toggle(f.sources, "api"))}>
                      Conectadas (Meta/Google)
                    </Chip>
                    <Chip on={f.sources.includes("manual")} onClick={() => set("sources", toggle(f.sources, "manual"))}>
                      Manuais
                    </Chip>
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-ash-300">
                      Nome ou ID <b className="text-good">contém</b> <span className="text-ash-500">(qualquer um)</span>
                    </span>
                    <div className="inline-flex rounded-lg border border-white/5 bg-black/30 p-0.5 text-[11px]">
                      {SCOPES.map(([k, l]) => (
                        <button key={k} onClick={() => set("scope", k)} className={clsx("rounded-md px-2 py-1", f.scope === k ? "bg-fire-500/20 text-white" : "text-ash-400 hover:text-white")}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <ChipsInput mono value={f.include} onChange={(v) => set("include", v)} placeholder="@STY, @APN, segmentação… (Enter)" />
                </div>
                <div>
                  <div className="mb-2 text-xs font-medium text-ash-300">
                    Nome ou ID <b className="text-bad">não contém</b>
                  </div>
                  <ChipsInput mono value={f.exclude} onChange={(v) => set("exclude", v)} placeholder="teste, [OFF]… (Enter)" />
                </div>
                <p className="text-[11px] leading-relaxed text-ash-500">
                  Os filtros se somam. Maiúsculas e acentos são ignorados. Quando o termo é procurado em conjunto ou anúncio, só aparecem os criativos que batem, mas os números continuam sendo da campanha inteira.
                </p>
                <div className="flex justify-between border-t border-white/5 pt-3">
                  <button className="text-xs text-ash-400 hover:text-fire-300" onClick={clear}>
                    Limpar filtros
                  </button>
                  <button className="btn-fire !py-1.5 !text-xs" onClick={() => setOpen(false)}>
                    Pronto
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {(tags.length > 0 || extraCount > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {tags.map((t) => (
            <span key={t.key} className="inline-flex items-center gap-1.5 rounded-full border border-fire-500/30 bg-fire-500/10 py-1 pl-3 pr-1.5 text-xs text-fire-200">
              {t.label}
              <button onClick={t.clear} className="grid h-4 w-4 place-items-center rounded-full text-fire-300 hover:bg-fire-500/30 hover:text-white" aria-label="Remover filtro">
                <X size={11} />
              </button>
            </span>
          ))}
          <button className="text-xs text-ash-400 underline-offset-2 hover:text-fire-300 hover:underline" onClick={clear}>
            Limpar filtros
          </button>
        </div>
      )}
    </div>
  );
}
