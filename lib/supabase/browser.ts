import { createBrowserClient } from "@supabase/ssr";

/** Cliente do navegador (usado só para enviar arquivos de criativos ao Storage). */
export function createBrowser() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
