"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { AlertTriangle, HelpCircle, Pencil } from "lucide-react";

// Janelas próprias da plataforma (substituem confirm() e prompt() do navegador).

interface ConfirmOpts {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** vermelho, para exclusões e ações que não têm volta */
  danger?: boolean;
}
interface PromptOpts {
  title: string;
  message?: React.ReactNode;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
}

type Pending =
  | ({ kind: "confirm"; resolve: (v: boolean) => void } & ConfirmOpts)
  | ({ kind: "prompt"; resolve: (v: string | null) => void } & PromptOpts);

const Ctx = createContext<{ confirm: (o: ConfirmOpts) => Promise<boolean>; prompt: (o: PromptOpts) => Promise<string | null> } | null>(null);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [d, setD] = useState<Pending | null>(null);
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const confirmBtn = useRef<HTMLButtonElement>(null);

  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setD({ kind: "confirm", resolve, ...o })), []);
  const prompt = useCallback(
    (o: PromptOpts) =>
      new Promise<string | null>((resolve) => {
        setText(o.defaultValue ?? "");
        setD({ kind: "prompt", resolve, ...o });
      }),
    [],
  );

  const close = (ok: boolean) => {
    if (!d) return;
    if (d.kind === "confirm") d.resolve(ok);
    else d.resolve(ok && text.trim() ? text.trim() : null);
    setD(null);
  };

  useEffect(() => {
    if (!d) return;
    const t = setTimeout(() => (d.kind === "prompt" ? input.current?.select() : confirmBtn.current?.focus()), 60);
    const key = (e: KeyboardEvent) => e.key === "Escape" && close(false);
    document.addEventListener("keydown", key);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  const danger = d?.kind === "confirm" && d.danger;
  const Icon = d?.kind === "prompt" ? Pencil : danger ? AlertTriangle : HelpCircle;

  return (
    <Ctx.Provider value={{ confirm, prompt }}>
      {children}
      <AnimatePresence>
        {d && (
          <motion.div
            className="fixed inset-0 z-[200] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(e) => e.target === e.currentTarget && close(false)}
          >
            <motion.form
              role="alertdialog"
              aria-modal
              aria-labelledby="dlg-title"
              initial={{ scale: 0.94, y: 14 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 8, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              onSubmit={(e) => {
                e.preventDefault();
                close(true);
              }}
              className={clsx("glass w-full max-w-md rounded-3xl p-6", danger ? "border-bad/30 shadow-[0_0_60px_-20px_rgba(255,77,79,.6)]" : "neon-ring")}
            >
              <div className="flex items-start gap-4">
                <span className={clsx("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", danger ? "bg-bad/15 text-bad" : "bg-fire-500/15 text-fire-400")}>
                  <Icon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id="dlg-title" className="font-display text-lg font-bold text-white">
                    {d.title}
                  </h2>
                  {d.message && <div className="mt-1.5 text-sm leading-relaxed text-ash-300">{d.message}</div>}
                  {d.kind === "prompt" && (
                    <label className="mt-4 block">
                      {d.label && <span className="mb-1.5 block text-xs font-medium text-ash-300">{d.label}</span>}
                      <input ref={input} className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={d.placeholder} />
                    </label>
                  )}
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button type="button" className="btn-ghost" onClick={() => close(false)}>
                  {(d.kind === "confirm" && d.cancelLabel) || "Cancelar"}
                </button>
                <button
                  ref={confirmBtn}
                  type="submit"
                  disabled={d.kind === "prompt" && !text.trim()}
                  className={clsx(
                    danger ? "inline-flex items-center justify-center gap-2 rounded-xl bg-bad px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_30px_-8px_rgba(255,77,79,.8)] hover:brightness-110" : "btn-fire",
                    "disabled:opacity-50",
                  )}
                >
                  {d.confirmLabel ?? (danger ? "Excluir" : "Confirmar")}
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}

/** const { confirm, prompt } = useDialog(); if (await confirm({ title, danger: true })) … */
export function useDialog() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDialog precisa do <DialogProvider>");
  return ctx;
}
