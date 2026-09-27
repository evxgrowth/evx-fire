"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { createSuperAdmin } from "./actions";

export default function SetupForm() {
  const [error, action, pending] = useActionState(createSuperAdmin, null);
  return (
    <form action={action} className="mt-6 space-y-3">
      <input name="name" className="input" placeholder="Seu nome" required />
      <input name="agency" className="input" placeholder="Nome da sua agência" defaultValue="EVX Growth Studio" required />
      <input name="email" type="email" className="input" placeholder="Seu e-mail de acesso" required />
      <input name="password" type="password" className="input" placeholder="Crie uma senha (mín. 8 caracteres)" minLength={8} required />
      {error && <p className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad">{error}</p>}
      <button className="btn-fire w-full !py-3" disabled={pending}>
        {pending ? <Loader2 size={16} className="animate-spin" /> : "Criar Super Admin"}
      </button>
    </form>
  );
}
