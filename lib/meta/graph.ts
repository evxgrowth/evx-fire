import "server-only";

export const GRAPH_VERSION = "v23.0";
const BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export class MetaError extends Error {
  constructor(message: string, public code?: number) {
    super(message);
  }
}

async function call<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new MetaError(json.error?.message ?? `Erro ${res.status} na Meta`, json.error?.code);
  }
  return json as T;
}

export function graphUrl(path: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params);
  return `${BASE}/${path.replace(/^\//, "")}?${qs}`;
}

export async function graphGet<T>(path: string, params: Record<string, string>) {
  return call<T>(graphUrl(path, params));
}

const TOO_MUCH = /reduce the amount of data/i;
const TRANSIENT = new Set([1, 2, 4, 17, 341]); // erros temporários / limite de chamadas da Meta

/**
 * Busca todas as páginas de um endpoint de lista.
 * Se a Meta pedir "menos dados", diminui o lote pela metade e tenta de novo;
 * em erro temporário, espera um pouco e repete.
 */
export async function graphList<T>(path: string, params: Record<string, string>, maxPages = 60): Promise<T[]> {
  const out: T[] = [];
  let limit = Number(params.limit ?? 200);
  let url: string | undefined = graphUrl(path, { ...params, limit: String(limit) });
  let retries = 0;
  for (let i = 0; url && i < maxPages; ) {
    const current: string = url;
    try {
      const page: { data: T[]; paging?: { next?: string } } = await call(current);
      out.push(...page.data);
      url = page.paging?.next;
      i++;
      retries = 0;
    } catch (e) {
      const err = e as MetaError;
      if (TOO_MUCH.test(err.message) && limit > 5) {
        limit = Math.max(5, Math.floor(limit / 2));
        const u = new URL(current);
        u.searchParams.set("limit", String(limit));
        url = u.toString();
        continue;
      }
      if ((TRANSIENT.has(err.code ?? -1) || /unknown error/i.test(err.message)) && retries < 3) {
        retries++;
        await new Promise((r) => setTimeout(r, 1500 * retries));
        continue;
      }
      throw e;
    }
  }
  return out;
}

// ---------- OAuth ----------

export function redirectUri(origin: string) {
  return `${origin}/api/meta/callback`;
}

export function loginDialogUrl(origin: string, state: string) {
  const qs = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: redirectUri(origin),
    config_id: process.env.META_LOGIN_CONFIG_ID!,
    response_type: "code",
    override_default_response_type: "true",
    state,
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${qs}`;
}

export async function exchangeCode(origin: string, code: string) {
  const short = await graphGet<{ access_token: string; expires_in?: number }>("oauth/access_token", {
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    redirect_uri: redirectUri(origin),
    code,
  });
  // Troca por um token de longa duração (~60 dias). Se a configuração já
  // gerar um token sem expiração, a Meta apenas devolve outro equivalente.
  try {
    const long = await graphGet<{ access_token: string; expires_in?: number }>("oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: process.env.META_APP_ID!,
      client_secret: process.env.META_APP_SECRET!,
      fb_exchange_token: short.access_token,
    });
    return long;
  } catch {
    return short;
  }
}
