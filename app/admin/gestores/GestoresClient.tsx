"use client";

import { useActionState, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Loader2, Plus, X } from "lucide-react";
import ManagersTable from "@/components/ManagersTable";
import { Panel } from "@/components/ui";
import type { Manager } from "@/lib/types";
import { createManager, toggleAgency, type CreateResult } from "../actions";

export default function GestoresClient({ managers }: { managers: Manager[] }) {
  const [open, setOpen] = useState(false);
  const [result, action, pending] = useActionState<CreateResult, FormData>(createManager, null);
  const [, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  const credentials = result?.ok ? `Acesso EVX Fire\nEndereço: ${window.location.origin}/login\nE-mail: ${result.email}\nSenha provisória: ${result.password}` : "";

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button className="btn-fire" onClick={() => setOpen(true)}>
          <Plus size={16} /> Novo gestor
        </button>
      </div>
      <Panel>
        <ManagersTable managers={managers} onToggle={(id) => startTransition(() => toggleAgency(id))} />
      </Panel>

      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div initial={{ scale: 0.94, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 20 }} className="glass neon-ring w-full max-w-md rounded-3xl p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-white">Novo gestor</h2>
                <button type="button" onClick={() => setOpen(false)} className="text-ash-400 hover:text-white" aria-label="Fechar">
                  <X size={18} />
                </button>
              </div>

              {result?.ok ? (
                <div className="space-y-4">
                  <p className="text-sm text-ash-300">Gestor cadastrado! Envie estes dados para ele. A senha não será mostrada de novo.</p>
                  <pre className="whitespace-pre-wrap rounded-xl border border-fire-500/25 bg-black/50 p-4 font-mono text-xs text-fire-200">{credentials}</pre>
                  <button
                    className="btn-ghost w-full"
                    onClick={() => {
                      navigator.clipboard?.writeText(credentials);
                      setCopied(true);
                    }}
                  >
                    {copied ? <Check size={15} className="text-good" /> : <Copy size={15} />} {copied ? "Copiado" : "Copiar dados de acesso"}
                  </button>
                  <button className="btn-fire w-full" onClick={() => location.reload()}>
                    Concluir
                  </button>
                </div>
              ) : (
                <form action={action} className="space-y-3">
                  <input name="name" className="input" placeholder="Nome completo" required />
                  <input name="agency" className="input" placeholder="Agência / empresa" />
                  <input name="email" className="input" type="email" placeholder="E-mail de acesso" required />
                  <select name="plan" className="input" defaultValue="Pro">
                    <option>Starter</option>
                    <option>Pro</option>
                    <option>Agency</option>
                  </select>
                  {result && !result.ok && <p className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad">{result.error}</p>}
                  <p className="text-xs text-ash-400">Uma senha provisória será gerada para você enviar ao gestor.</p>
                  <button type="submit" className="btn-fire w-full" disabled={pending}>
                    {pending ? <Loader2 size={16} className="animate-spin" /> : "Cadastrar gestor"}
                  </button>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
