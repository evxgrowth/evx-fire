import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC = ["/login", "/setup", "/share", "/api/meta/callback"];

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  // getClaims valida o token localmente (chaves ES256): não vai ao servidor de login a cada clique.
  // Só faz uma chamada quando a sessão precisa ser renovada (~1x por hora).
  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims?.sub;

  const path = req.nextUrl.pathname;
  const isPublic = path === "/" || PUBLIC.some((p) => path === p || path.startsWith(p + "/"));
  if (!signedIn && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = {
  // Rotas que não usam sessão nem passam por aqui: arquivos, API pública, agendador e páginas legais
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|api/v1|api/cron|politica-de-privacidade|termos-de-uso|exclusao-de-dados|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
