"use client";

import { useActionState } from "react";
import { ArrowRight, Loader2, Lock, Mail } from "lucide-react";
import { signIn } from "./actions";

export default function LoginForm({ notice }: { notice?: string }) {
  const [error, action, pending] = useActionState(signIn, null);
  const msg = error ?? notice;
  return (
    <form action={action} className="mt-8 space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-ash-300">E-mail</span>
        <div className="relative">
          <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ash-400" />
          <input name="email" className="input !pl-10" type="email" placeholder="voce@agencia.com" autoComplete="email" required />
        </div>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-ash-300">Senha</span>
        <div className="relative">
          <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ash-400" />
          <input name="password" className="input !pl-10" type="password" placeholder="••••••••" autoComplete="current-password" required />
        </div>
      </label>
      {msg && <p className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad">{msg}</p>}
      <button type="submit" disabled={pending} className="btn-fire w-full !py-3 disabled:opacity-70">
        {pending ? <Loader2 size={16} className="animate-spin" /> : <>Entrar <ArrowRight size={16} /></>}
      </button>
    </form>
  );
}
