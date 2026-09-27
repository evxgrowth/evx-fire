"use client";

import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import clsx from "clsx";
import type { CampaignInput } from "@/app/(gestor)/campanhas/manual-actions";
import { GoogleAdsIcon, MetaIcon } from "../PlatformIcon";

export const OBJECTIVES = ["Vendas", "Leads", "Mensagens", "Tráfego", "Engajamento", "Reconhecimento", "Alcance", "Visualizações de vídeo", "App", "Outro"];
export const RESULT_LABELS = ["Leads", "Vendas", "Conversas iniciadas", "Cliques no link", "Cadastros", "Agendamentos", "Ligações", "Visitas ao perfil", "Seguidores", "Visualizações de vídeo"];

const Label = ({ children }: { children: React.ReactNode }) => <span className="mb-1.5 block text-xs font-medium text-ash-300">{children}</span>;

export default function CampaignForm({
  initial,
  clients,
  submitLabel,
  onSubmit,
}: {
  initial: CampaignInput;
  clients: { id: string; name: string }[];
  submitLabel: string;
  onSubmit: (v: CampaignInput) => Promise<{ ok: boolean; error?: string } | void>;
}) {
  const [v, setV] = useState<CampaignInput>(initial);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof CampaignInput>(k: K, val: CampaignInput[K]) => setV((x) => ({ ...x, [k]: val }));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        start(async () => {
          const r = await onSubmit(v);
          if (r && !r.ok) setErr(r.error ?? "Erro ao salvar");
        });
      }}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block md:col-span-2">
          <Label>Nome da campanha</Label>
          <input className="input" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: @XYZ | Leads | Setembro" required />
        </label>
        <label className="block">
          <Label>Cliente</Label>
          <select className="input" value={v.clientId} onChange={(e) => set("clientId", e.target.value)} required>
            <option value="">Escolha…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div>
          <Label>Onde a campanha roda</Label>
          <div className="flex gap-2">
            {(["meta", "google"] as const).map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => set("platform", p)}
                className={clsx(
                  "flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-all",
                  v.platform === p ? "border-fire-500/50 bg-fire-500/15 text-white" : "border-white/10 text-ash-300 hover:border-white/20",
                )}
              >
                {p === "meta" ? <MetaIcon size={16} /> : <GoogleAdsIcon size={16} />} {p === "meta" ? "Meta Ads" : "Google Ads"}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <Label>Objetivo</Label>
          <select className="input" value={v.objective} onChange={(e) => set("objective", e.target.value)}>
            {OBJECTIVES.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <Label>Como chamar o resultado</Label>
          <input className="input" list="result-labels" value={v.resultLabel} onChange={(e) => set("resultLabel", e.target.value)} placeholder="Ex.: Leads" />
          <datalist id="result-labels">
            {RESULT_LABELS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </label>
        <div>
          <Label>Status</Label>
          <div className="flex gap-2">
            {(
              [
                ["active", "Ativa"],
                ["paused", "Pausada"],
                ["ended", "Encerrada"],
              ] as const
            ).map(([s, l]) => (
              <button
                type="button"
                key={s}
                onClick={() => set("status", s)}
                className={clsx(
                  "flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-all",
                  v.status === s ? "border-fire-500/50 bg-fire-500/15 text-white" : "border-white/10 text-ash-300 hover:border-white/20",
                )}
              >
                <span className={`led led-${s}`} /> {l}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <Label>Orçamento diário (R$)</Label>
            <input className="input" type="number" min={0} step="0.01" value={v.dailyBudget || ""} onChange={(e) => set("dailyBudget", Number(e.target.value))} />
          </label>
          <label className="block">
            <Label>Orçamento total (R$)</Label>
            <input className="input" type="number" min={0} step="0.01" value={v.lifetimeBudget || ""} onChange={(e) => set("lifetimeBudget", Number(e.target.value))} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <Label>Início</Label>
            <input className="input" type="date" value={v.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </label>
          <label className="block">
            <Label>Término (opcional)</Label>
            <input className="input" type="date" value={v.endDate} onChange={(e) => set("endDate", e.target.value)} />
          </label>
        </div>
        <label className="block md:col-span-2">
          <Label>Observações / estratégia</Label>
          <textarea className="input min-h-[80px]" value={v.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Estratégia, oferta, observações para o time…" />
        </label>
      </div>
      {err && <p className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</p>}
      <button className="btn-fire" disabled={pending}>
        {pending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {submitLabel}
      </button>
    </form>
  );
}
