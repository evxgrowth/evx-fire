"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { ImagePlus, Loader2, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import ChipsInput from "@/components/ChipsInput";
import CampaignForm from "@/components/manual/CampaignForm";
import { Panel } from "@/components/ui";
import { createBrowser } from "@/lib/supabase/browser";
import { fmtMoney, fmtNum } from "@/lib/format";
import { GOAL_LABELS } from "@/lib/meta/results";
import {
  addEntry,
  deleteAd,
  deleteAdSet,
  deleteEntry,
  deleteManualCampaign,
  saveAd,
  saveAdSet,
  updateManualCampaign,
  type AdInput,
  type AdSetInput,
  type CampaignInput,
  type EntryInput,
} from "../manual-actions";

interface EntryRow {
  id: string;
  period: "day" | "week" | "month";
  start_date: string;
  end_date: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  results: number;
  revenue: number;
  notes: string;
}

const CTAS: [string, string][] = [
  ["", "Sem botão"],
  ["LEARN_MORE", "Saiba mais"],
  ["WHATSAPP_MESSAGE", "Enviar mensagem no WhatsApp"],
  ["MESSAGE_PAGE", "Enviar mensagem"],
  ["SHOP_NOW", "Comprar agora"],
  ["SIGN_UP", "Cadastre-se"],
  ["BOOK_NOW", "Agendar / Reservar"],
  ["CONTACT_US", "Fale conosco"],
  ["GET_QUOTE", "Solicitar orçamento"],
  ["CALL_NOW", "Ligar agora"],
  ["APPLY_NOW", "Candidatar-se"],
  ["SUBSCRIBE", "Assinar"],
  ["DOWNLOAD", "Baixar"],
  ["ORDER_NOW", "Pedir agora"],
];
const CTA_LABEL = Object.fromEntries(CTAS);
const PLACEMENTS = [
  ["facebook", "Facebook"],
  ["instagram", "Instagram"],
  ["messenger", "Messenger"],
  ["audience_network", "Audience Network"],
  ["whatsapp", "WhatsApp"],
  ["youtube", "YouTube"],
  ["search", "Pesquisa Google"],
  ["display", "Display Google"],
];
const PERIOD_LABEL = { day: "Dia", week: "Semana", month: "Mês" };
const fmtD = (s: string) => s.split("-").reverse().join("/");

const Label = ({ children }: { children: React.ReactNode }) => <span className="mb-1.5 block text-xs font-medium text-ash-300">{children}</span>;

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div initial={{ scale: 0.96, y: 16 }} animate={{ scale: 1, y: 0 }} className="glass neon-ring mx-auto my-8 w-full max-w-2xl rounded-3xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-white">{title}</h2>
          <button type="button" onClick={onClose} className="text-ash-400 hover:text-white" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

// ---------- Resultados ----------
function EntriesTab({ campaignId, entries, resultLabel }: { campaignId: string; entries: EntryRow[]; resultLabel: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const empty: EntryInput = { period: "day", date: new Date().toISOString().slice(0, 10), spend: 0, impressions: 0, reach: 0, clicks: 0, results: 0, revenue: 0, notes: "" };
  const [v, setV] = useState<EntryInput>(empty);
  const num = (k: keyof EntryInput) => ({
    value: (v[k] as number) || "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setV((x) => ({ ...x, [k]: Number(e.target.value) })),
  });

  return (
    <div className="space-y-5">
      <form
        className="rounded-2xl border border-dashed border-fire-500/25 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          start(async () => {
            const r = await addEntry(campaignId, { ...v, date: v.period === "month" && v.date.length === 7 ? v.date + "-01" : v.date });
            if (!r.ok) setErr(r.error);
            else setV({ ...empty, period: v.period });
          });
        }}
      >
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div>
            <Label>Período do lançamento</Label>
            <div className="inline-flex rounded-xl border border-white/5 bg-black/30 p-1 text-xs">
              {(["day", "week", "month"] as const).map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => setV((x) => ({ ...x, period: p, date: p === "month" ? x.date.slice(0, 7) : x.date.length === 7 ? x.date + "-01" : x.date }))}
                  className={clsx("rounded-lg px-3 py-1.5 font-medium", v.period === p ? "bg-fire-500/20 text-white" : "text-ash-400 hover:text-white")}
                >
                  {PERIOD_LABEL[p]}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <Label>{v.period === "day" ? "Data" : v.period === "week" ? "Início da semana" : "Mês"}</Label>
            <input className="input" type={v.period === "month" ? "month" : "date"} value={v.date} onChange={(e) => setV((x) => ({ ...x, date: e.target.value }))} required />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <label className="block">
            <Label>Valor gasto (R$)</Label>
            <input className="input" type="number" min={0} step="0.01" {...num("spend")} />
          </label>
          <label className="block">
            <Label>{resultLabel || "Resultados"}</Label>
            <input className="input" type="number" min={0} step="1" {...num("results")} />
          </label>
          <label className="block">
            <Label>Receita (R$)</Label>
            <input className="input" type="number" min={0} step="0.01" {...num("revenue")} />
          </label>
          <label className="block">
            <Label>Impressões</Label>
            <input className="input" type="number" min={0} {...num("impressions")} />
          </label>
          <label className="block">
            <Label>Alcance</Label>
            <input className="input" type="number" min={0} {...num("reach")} />
          </label>
          <label className="block">
            <Label>Cliques</Label>
            <input className="input" type="number" min={0} {...num("clicks")} />
          </label>
        </div>
        <input className="input mt-3" placeholder="Observação (opcional)" value={v.notes} onChange={(e) => setV((x) => ({ ...x, notes: e.target.value }))} />
        {err && <p className="mt-3 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</p>}
        <div className="mt-3 flex items-center gap-3">
          <button className="btn-fire" disabled={pending}>
            {pending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Lançar
          </button>
          <span className="text-[11px] text-ash-500">Lançamentos de semana e mês são divididos igualmente pelos dias, para os gráficos ficarem corretos.</span>
        </div>
      </form>

      {!entries.length ? (
        <p className="py-6 text-center text-sm text-ash-400">Nenhum lançamento ainda.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs [&_td]:px-3 [&_th]:px-3">
            <thead>
              <tr className="border-b border-white/5 text-left text-[10px] uppercase tracking-wider text-ash-400">
                <th className="py-2 font-medium">Período</th>
                <th className="py-2 text-right font-medium">Gasto</th>
                <th className="py-2 text-right font-medium">{resultLabel || "Resultados"}</th>
                <th className="py-2 text-right font-medium">Receita</th>
                <th className="py-2 text-right font-medium">Impressões</th>
                <th className="py-2 text-right font-medium">Alcance</th>
                <th className="py-2 text-right font-medium">Cliques</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-white/[0.04]">
                  <td className="py-2">
                    <span className="mr-2 rounded bg-fire-500/10 px-1.5 py-0.5 text-[10px] text-fire-300">{PERIOD_LABEL[e.period]}</span>
                    <span className="text-ash-200">{e.start_date === e.end_date ? fmtD(e.start_date) : `${fmtD(e.start_date)} → ${fmtD(e.end_date)}`}</span>
                    {e.notes && <div className="text-[10px] text-ash-500">{e.notes}</div>}
                  </td>
                  <td className="py-2 text-right text-white">{fmtMoney(Number(e.spend))}</td>
                  <td className="py-2 text-right text-white">{fmtNum(Number(e.results))}</td>
                  <td className="py-2 text-right text-ash-200">{fmtMoney(Number(e.revenue))}</td>
                  <td className="py-2 text-right text-ash-200">{fmtNum(Number(e.impressions))}</td>
                  <td className="py-2 text-right text-ash-200">{fmtNum(Number(e.reach))}</td>
                  <td className="py-2 text-right text-ash-200">{fmtNum(Number(e.clicks))}</td>
                  <td className="py-2 text-right">
                    <button className="text-ash-500 hover:text-bad" aria-label="Excluir lançamento" onClick={() => confirm("Excluir este lançamento?") && start(() => deleteEntry(campaignId, e.id))}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------- Públicos (conjuntos) ----------
function AdSetForm({ campaignId, initial, onClose }: { campaignId: string; initial: AdSetInput; onClose: () => void }) {
  const [v, setV] = useState<AdSetInput>(initial);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof AdSetInput>(k: K, val: AdSetInput[K]) => setV((x) => ({ ...x, [k]: val }));
  const gender = v.genders.length === 1 ? v.genders[0] : 0;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveAdSet(campaignId, v);
          if (r.ok) onClose();
          else setErr(r.error);
        });
      }}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block md:col-span-2">
          <Label>Nome do conjunto</Label>
          <input className="input" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Mulheres 25-45 | Natal 5km" required />
        </label>
        <label className="block">
          <Label>Meta de otimização</Label>
          <select className="input" value={v.optimizationGoal} onChange={(e) => set("optimizationGoal", e.target.value)}>
            <option value="">—</option>
            {Object.entries(GOAL_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <Label>Orçamento diário do conjunto (R$)</Label>
          <input className="input" type="number" min={0} step="0.01" value={v.dailyBudget || ""} onChange={(e) => set("dailyBudget", Number(e.target.value))} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <Label>Idade mínima</Label>
            <input className="input" type="number" min={13} max={65} value={v.ageMin} onChange={(e) => set("ageMin", Number(e.target.value))} />
          </label>
          <label className="block">
            <Label>Idade máxima</Label>
            <input className="input" type="number" min={13} max={65} value={v.ageMax} onChange={(e) => set("ageMax", Number(e.target.value))} />
          </label>
        </div>
        <div>
          <Label>Gênero</Label>
          <div className="flex gap-2">
            {(
              [
                [0, "Todos"],
                [1, "Homens"],
                [2, "Mulheres"],
              ] as const
            ).map(([g, l]) => (
              <button
                type="button"
                key={g}
                onClick={() => set("genders", g ? [g] : [])}
                className={clsx("flex-1 rounded-xl border px-3 py-2.5 text-sm", gender === g ? "border-fire-500/50 bg-fire-500/15 text-white" : "border-white/10 text-ash-300")}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="md:col-span-2">
          <Label>Locais (cidades, bairros, raio)</Label>
          <ChipsInput value={v.locations} onChange={(x) => set("locations", x)} placeholder="Natal (+5 km), Parnamirim…" />
        </div>
        <div className="md:col-span-2">
          <Label>Interesses e comportamentos</Label>
          <ChipsInput value={v.interests} onChange={(x) => set("interests", x)} placeholder="Academia, Pilates, Musculação…" />
        </div>
        <div>
          <Label>Públicos personalizados / semelhantes</Label>
          <ChipsInput value={v.customAudiences} onChange={(x) => set("customAudiences", x)} placeholder="Lookalike 1% compradores…" />
        </div>
        <div>
          <Label>Públicos excluídos</Label>
          <ChipsInput value={v.excludedAudiences} onChange={(x) => set("excludedAudiences", x)} placeholder="Alunos ativos…" />
        </div>
        <div className="md:col-span-2">
          <Label>Posicionamentos</Label>
          <div className="flex flex-wrap gap-2">
            {PLACEMENTS.map(([k, l]) => (
              <button
                type="button"
                key={k}
                onClick={() => set("placements", v.placements.includes(k) ? v.placements.filter((x) => x !== k) : [...v.placements, k])}
                className={clsx("rounded-full border px-3 py-1.5 text-xs", v.placements.includes(k) ? "border-fire-500/50 bg-fire-500/15 text-white" : "border-white/10 text-ash-300")}
              >
                {l}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-ash-500">Nenhum marcado = posicionamentos automáticos.</p>
        </div>
        <label className="block md:col-span-2">
          <Label>Estratégia e observações do público</Label>
          <textarea className="input min-h-[80px]" value={v.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Ex.: público frio, remarketing de 30 dias, teste A/B de oferta…" />
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-ash-200">
          <input type="checkbox" checked={v.active} onChange={(e) => set("active", e.target.checked)} className="accent-fire-500" /> Conjunto ativo
        </label>
      </div>
      {err && <p className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</p>}
      <button className="btn-fire" disabled={pending}>
        {pending ? <Loader2 size={16} className="animate-spin" /> : "Salvar conjunto"}
      </button>
    </form>
  );
}

// ---------- Criativos (anúncios) ----------
function AdForm({ campaignId, agencyId, adsets, initial, onClose }: { campaignId: string; agencyId: string; adsets: { id: string; name: string }[]; initial: AdInput; onClose: () => void }) {
  const [v, setV] = useState<AdInput>(initial);
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const set = <K extends keyof AdInput>(k: K, val: AdInput[K]) => setV((x) => ({ ...x, [k]: val }));

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setErr(null);
    const sb = createBrowser();
    for (const file of Array.from(files)) {
      const type = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
      if (!type) {
        setErr(`"${file.name}" não é imagem nem vídeo.`);
        continue;
      }
      if (file.size > 50 * 1024 * 1024) {
        setErr(`"${file.name}" passa de 50 MB.`);
        continue;
      }
      setUploading((n) => n + 1);
      const safe = file.name.normalize("NFD").replace(/[^\w.-]+/g, "-").slice(-60);
      const path = `${agencyId}/${campaignId}/${crypto.randomUUID()}-${safe}`;
      const { error } = await sb.storage.from("creatives").upload(path, file, { contentType: file.type, upsert: false });
      setUploading((n) => n - 1);
      if (error) {
        setErr(`Falha ao enviar "${file.name}": ${error.message}`);
        continue;
      }
      const url = sb.storage.from("creatives").getPublicUrl(path).data.publicUrl;
      setV((x) => ({ ...x, media: [...x.media, { type, url, path }] }));
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveAd(campaignId, v);
          if (r.ok) onClose();
          else setErr(r.error);
        });
      }}
    >
      <div
        className="rounded-2xl border border-dashed border-fire-500/30 p-4 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          upload(e.dataTransfer.files);
        }}
      >
        {v.media.length > 0 && (
          <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {v.media.map((m, i) => (
              <div key={m.url} className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-black">
                {m.type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <video src={m.url} className="h-full w-full object-cover" muted />
                )}
                <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[9px] text-white">{i + 1}</span>
                <button
                  type="button"
                  onClick={() => set("media", v.media.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100"
                  aria-label="Remover arquivo"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <input ref={input} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => upload(e.target.files)} />
        <button type="button" className="btn-ghost" onClick={() => input.current?.click()} disabled={uploading > 0}>
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />} {uploading ? "Enviando…" : "Adicionar imagens ou vídeo"}
        </button>
        <p className="mt-2 text-[11px] text-ash-500">Arraste os arquivos aqui. Várias imagens = carrossel. Até 50 MB por arquivo.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block">
          <Label>Nome do anúncio</Label>
          <input className="input" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: VID_01 | Depoimento" required />
        </label>
        <label className="block">
          <Label>Conjunto de anúncios</Label>
          <select className="input" value={v.adSetId} onChange={(e) => set("adSetId", e.target.value)}>
            <option value="">— sem conjunto —</option>
            {adsets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block md:col-span-2">
          <Label>Título</Label>
          <input className="input" value={v.headline} onChange={(e) => set("headline", e.target.value)} placeholder="Ex.: Sua primeira aula é por nossa conta" />
        </label>
        <label className="block md:col-span-2">
          <Label>Legenda (texto principal)</Label>
          <textarea className="input min-h-[110px]" value={v.body} onChange={(e) => set("body", e.target.value)} />
        </label>
        <label className="block">
          <Label>Botão (CTA)</Label>
          <select className="input" value={v.cta} onChange={(e) => set("cta", e.target.value)}>
            {CTAS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <Label>Link de destino</Label>
          <input className="input" value={v.link} onChange={(e) => set("link", e.target.value)} placeholder="https://… ou link do WhatsApp" />
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-ash-200">
          <input type="checkbox" checked={v.active} onChange={(e) => set("active", e.target.checked)} className="accent-fire-500" /> Anúncio ativo
        </label>
      </div>
      {err && <p className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</p>}
      <button className="btn-fire" disabled={pending || uploading > 0}>
        {pending ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Salvar anúncio
      </button>
    </form>
  );
}

// ---------- Painel ----------
export default function ManualPanel({
  agencyId,
  campaign,
  clients,
  entries,
  adsets,
  ads,
}: {
  agencyId: string;
  campaign: CampaignInput & { id: string };
  clients: { id: string; name: string }[];
  entries: EntryRow[];
  adsets: (AdSetInput & { id: string })[];
  ads: (AdInput & { id: string })[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"results" | "audiences" | "ads" | "data">("results");
  const [setModal, setSetModal] = useState<AdSetInput | null>(null);
  const [adModal, setAdModal] = useState<AdInput | null>(null);
  const [pending, start] = useTransition();

  const newSet: AdSetInput = { name: "", active: true, optimizationGoal: "", dailyBudget: 0, ageMin: 18, ageMax: 65, genders: [], locations: [], interests: [], customAudiences: [], excludedAudiences: [], placements: [], notes: "" };
  const newAd: AdInput = { adSetId: adsets[0]?.id ?? "", name: "", active: true, headline: "", body: "", cta: "", link: "", media: [] };

  return (
    <Panel className="mb-5" title="Gestão da campanha manual" subtitle="Os dados lançados aqui aparecem nos painéis, no link do cliente e são enviados aos destinos (CRM) como qualquer outra campanha.">
      <div className="mb-5 inline-flex flex-wrap rounded-xl border border-white/5 bg-black/30 p-1 text-xs">
        {(
          [
            ["results", `Resultados (${entries.length})`],
            ["audiences", `Públicos (${adsets.length})`],
            ["ads", `Criativos (${ads.length})`],
            ["data", "Dados da campanha"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={clsx("rounded-lg px-4 py-2 font-medium", tab === k ? "bg-fire-500/20 text-white shadow-[0_0_16px_-4px_rgba(255,92,0,.7)]" : "text-ash-400 hover:text-white")}>
            {l}
          </button>
        ))}
      </div>

      {tab === "results" && <EntriesTab campaignId={campaign.id} entries={entries} resultLabel={campaign.resultLabel} />}

      {tab === "audiences" && (
        <div className="space-y-3">
          {adsets.map((s) => (
            <div key={s.id} className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className={`led ${s.active ? "led-active" : "led-paused"}`} />
                <span className="font-medium text-white">{s.name}</span>
                <div className="ml-auto flex gap-1">
                  <button className="grid h-7 w-7 place-items-center rounded-lg text-ash-500 hover:text-fire-300" onClick={() => setSetModal(s)} aria-label="Editar conjunto">
                    <Pencil size={13} />
                  </button>
                  <button className="grid h-7 w-7 place-items-center rounded-lg text-ash-500 hover:text-bad" onClick={() => confirm("Excluir este conjunto?") && start(() => deleteAdSet(campaign.id, s.id))} aria-label="Excluir conjunto">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <p className="mt-1 text-xs text-ash-400">
                {s.ageMin}–{s.ageMax} anos · {s.genders[0] === 1 ? "Homens" : s.genders[0] === 2 ? "Mulheres" : "Todos"}
                {s.locations.length ? ` · ${s.locations.join(", ")}` : ""}
                {s.interests.length ? ` · ${s.interests.join(", ")}` : ""}
              </p>
            </div>
          ))}
          <button className="btn-ghost" onClick={() => setSetModal(newSet)}>
            <Plus size={16} /> Novo conjunto / público
          </button>
        </div>
      )}

      {tab === "ads" && (
        <div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {ads.map((a) => {
              const first = a.media[0];
              return (
                <div key={a.id} className="overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02]">
                  <div className="relative aspect-[4/3] bg-black">
                    {first?.type === "image" && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={first.url} alt="" className="h-full w-full object-cover" />
                    )}
                    {first?.type === "video" && <video src={first.url} className="h-full w-full object-cover" controls muted />}
                    {!first && <div className="grid h-full place-items-center text-xs text-ash-500">sem arquivo</div>}
                    {a.media.length > 1 && <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">{a.media.length} itens</span>}
                  </div>
                  <div className="space-y-1 p-3">
                    <div className="flex items-center gap-2">
                      <span className={`led ${a.active ? "led-active" : "led-paused"}`} />
                      <span className="truncate text-sm font-medium text-white">{a.name}</span>
                    </div>
                    {a.headline && <div className="truncate text-xs text-ash-200">{a.headline}</div>}
                    {a.cta && <div className="text-[11px] text-fire-300">{CTA_LABEL[a.cta] ?? a.cta}</div>}
                    <div className="flex gap-1 pt-1">
                      <button className="btn-ghost !px-2 !py-1 !text-[11px]" onClick={() => setAdModal(a)}>
                        <Pencil size={12} /> Editar
                      </button>
                      <button className="btn-ghost !px-2 !py-1 !text-[11px] hover:!text-bad" onClick={() => confirm("Excluir este anúncio e seus arquivos?") && start(() => deleteAd(campaign.id, a.id))}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <button className="btn-ghost mt-4" onClick={() => setAdModal(newAd)}>
            <Plus size={16} /> Novo anúncio / criativo
          </button>
        </div>
      )}

      {tab === "data" && (
        <div className="space-y-6">
          <CampaignForm
            clients={clients}
            initial={campaign}
            submitLabel="Salvar alterações"
            onSubmit={async (v) => {
              const r = await updateManualCampaign(campaign.id, v);
              router.refresh();
              return r;
            }}
          />
          <div className="border-t border-white/5 pt-4">
            <button
              className="inline-flex items-center gap-2 text-xs text-ash-500 hover:text-bad"
              disabled={pending}
              onClick={() =>
                confirm("Excluir esta campanha manual com todos os lançamentos, públicos e criativos?") &&
                start(async () => {
                  await deleteManualCampaign(campaign.id);
                  router.push("/campanhas");
                })
              }
            >
              <Trash2 size={14} /> Excluir campanha
            </button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {setModal && (
          <Modal title={setModal.id ? "Editar conjunto" : "Novo conjunto / público"} onClose={() => setSetModal(null)}>
            <AdSetForm campaignId={campaign.id} initial={setModal} onClose={() => setSetModal(null)} />
          </Modal>
        )}
        {adModal && (
          <Modal title={adModal.id ? "Editar anúncio" : "Novo anúncio / criativo"} onClose={() => setAdModal(null)}>
            <AdForm campaignId={campaign.id} agencyId={agencyId} adsets={adsets} initial={adModal} onClose={() => setAdModal(null)} />
          </Modal>
        )}
      </AnimatePresence>
    </Panel>
  );
}
