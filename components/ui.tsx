"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import clsx from "clsx";

export function Panel({
  title,
  subtitle,
  action,
  children,
  className,
  delay = 0,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.55, ease: "easeOut" }}
      className={clsx("glass relative overflow-hidden p-5", className)}
    >
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h3 className="font-display text-[15px] font-semibold text-white">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-ash-400">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </motion.section>
  );
}

function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
}

/** Indicador "ao vivo" com o tempo desde a última sincronização. */
export function LiveBadge({ lastSync }: { lastSync?: string | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const stale = lastSync && now ? now - new Date(lastSync).getTime() > 3 * 3600 * 1000 : false;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider",
        stale ? "border-warn/25 bg-warn/10 text-warn" : "border-good/25 bg-good/10 text-good",
      )}
    >
      <span className={clsx("led", stale ? "led-learning" : "led-active")} />
      Ao vivo
      {lastSync && now && (
        <span className="hidden font-normal normal-case tracking-normal text-ash-300 sm:inline">· atualizado há {ago(lastSync, now)}</span>
      )}
    </span>
  );
}

/** Botão "Sincronizar agora". */
export function SyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={async () => {
        setBusy(true);
        try {
          await fetch("/api/sync", { method: "POST" });
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      disabled={busy}
      className="grid h-9 w-9 place-items-center rounded-xl border border-white/5 bg-white/[0.03] text-ash-300 hover:text-fire-300 disabled:opacity-60"
      title="Sincronizar agora"
      aria-label="Sincronizar agora"
    >
      <RefreshCw size={16} className={busy ? "animate-spin text-fire-400" : ""} />
    </button>
  );
}

export function PageHeader({ title, subtitle, children }: { title: React.ReactNode; subtitle?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="font-display text-2xl font-bold tracking-tight text-white md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ash-400">{subtitle}</p>}
      </motion.div>
      {children}
    </div>
  );
}

export function Pill({ children, tone = "fire" }: { children: React.ReactNode; tone?: "fire" | "good" | "warn" | "bad" | "muted" }) {
  const tones = {
    fire: "border-fire-500/30 bg-fire-500/10 text-fire-300",
    good: "border-good/30 bg-good/10 text-good",
    warn: "border-warn/30 bg-warn/10 text-warn",
    bad: "border-bad/30 bg-bad/10 text-bad",
    muted: "border-white/10 bg-white/5 text-ash-300",
  };
  return <span className={clsx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium", tones[tone])}>{children}</span>;
}
