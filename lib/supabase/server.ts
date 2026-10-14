import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient } from "@supabase/supabase-js";

/**
 * Medição (desligada por padrão). Com FIRE_DB_TRACE=1, cada chamada ao Supabase vira
 * uma linha no log: método, caminho e bytes recebidos. Serve para comparar antes/depois.
 */
const traced: typeof fetch | undefined =
  process.env.FIRE_DB_TRACE === "1"
    ? async (input, init) => {
        const res = await fetch(input, init);
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        const bytes = Number(res.headers.get("content-length") ?? 0);
        console.log(`[db] ${init?.method ?? "GET"} ${url.pathname} ${res.status} ${bytes}B`);
        return res;
      }
    : undefined;

/** Cliente com a sessão do usuário logado (respeita as regras de segurança do banco). */
export async function createClient() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    ...(traced ? { global: { fetch: traced } } : {}),
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // chamado de um Server Component: o middleware renova a sessão
        }
      },
    },
  });
}

/** Cliente administrativo (chave secreta). Usar SOMENTE no servidor. */
export function createAdminClient() {
  return createPlainClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(traced ? { global: { fetch: traced } } : {}),
  });
}
