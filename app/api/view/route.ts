import { NextResponse, type NextRequest } from "next/server";
import { unstable_cache } from "next/cache";
import { getMe } from "@/lib/auth";
import { defaultFilters, type Filters } from "@/lib/data";
import { normalizePeriod } from "@/lib/period";
import { loadView } from "@/lib/repo";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveView, stripRevenue, type DashboardData, type ViewName, type ViewRequest } from "@/lib/views";

const VIEWS: ViewName[] = ["dashboard", "report", "campaigns", "creatives", "clients", "campaign"];
const UUID = /^[0-9a-f-]{36}$/i;
const strs = (v: unknown, max = 20) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").map((x) => String(x).slice(0, 120)).slice(0, max) : []);

/** Limpa o pedido vindo do navegador (nada além do que as telas usam). */
function sanitize(raw: unknown): ViewRequest | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const view = r.view as ViewName;
  if (!VIEWS.includes(view)) return null;
  const f = (r.filters ?? {}) as Record<string, unknown>;
  const filters: Filters = {
    ...defaultFilters,
    period: normalizePeriod(f.period),
    platform: f.platform === "meta" || f.platform === "google" ? f.platform : "all",
    clients: strs(f.clients, 200).filter((x) => UUID.test(x)),
    statuses: strs(f.statuses).filter((x) => ["active", "learning", "paused", "ended"].includes(x)) as Filters["statuses"],
    sources: strs(f.sources).filter((x) => x === "api" || x === "manual") as Filters["sources"],
    include: strs(f.include),
    exclude: strs(f.exclude),
    scope: (["any", "campaign", "adset", "ad"] as const).includes(f.scope as never) ? (f.scope as Filters["scope"]) : "any",
  };
  return {
    view,
    filters,
    limit: Math.max(1, Math.min(Number(r.limit) || 50, 2000)),
    top: Math.max(0, Math.min(Number(r.top) || 0, 60)),
    search: typeof r.search === "string" ? r.search.slice(0, 100) : "",
    state: r.state === "active" || r.state === "inactive" ? r.state : "all",
    id: typeof r.id === "string" && UUID.test(r.id) ? r.id : undefined,
  };
}

/** Link do cliente validado (em cache; limpo quando links, clientes ou agências mudam). */
const shareLink = (token: string) =>
  unstable_cache(
    async () => {
      const { data } = await createAdminClient()
        .from("share_links")
        .select("agency_id, client_id, show_revenue, show_creatives, active, clients(active), agencies(status)")
        .eq("token", token)
        .maybeSingle();
      if (!data) return null;
      const agency = (Array.isArray(data.agencies) ? data.agencies[0] : data.agencies) as { status: string } | null;
      const client = (Array.isArray(data.clients) ? data.clients[0] : data.clients) as { active: boolean } | null;
      if (!data.active || agency?.status === "suspended" || client?.active === false) return null;
      return { agencyId: data.agency_id as string, clientId: data.client_id as string, showRevenue: !!data.show_revenue, showCreatives: !!data.show_creatives };
    },
    ["share-link-v1", token],
    { tags: ["share-links"], revalidate: 3600 },
  )();

/**
 * Dados prontos de uma tela. GET /api/view?q=<pedido em base64url>[&t=<token do link do cliente>]
 * Gestor: dados da agência dele. Link do cliente: só painel/relatório daquele cliente.
 */
export async function GET(req: NextRequest) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(req.nextUrl.searchParams.get("q") ?? "", "base64url").toString("utf8"));
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const request = sanitize(parsed);
  if (!request) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const token = req.nextUrl.searchParams.get("t");
  let agencyId: string;
  let clientId: string | null = null;
  let share: Awaited<ReturnType<typeof shareLink>> = null;
  if (token) {
    share = await shareLink(token.slice(0, 80));
    if (!share) return NextResponse.json({ error: "link_unavailable" }, { status: 404 });
    if (request.view !== "dashboard" && request.view !== "report") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    agencyId = share.agencyId;
    clientId = share.clientId;
    request.filters = { ...request.filters!, clients: [share.clientId] };
    if (!share.showCreatives) request.top = 0;
  } else {
    const me = await getMe();
    if (!me?.agencyId || (me.agencyStatus === "suspended" && me.role !== "super_admin")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    agencyId = me.agencyId;
  }

  try {
    let data = await loadView(agencyId, clientId, resolveView(request));
    if (share && !share.showRevenue && data && (request.view === "dashboard" || request.view === "report")) data = stripRevenue(data as DashboardData);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return NextResponse.json({ error: "internal_error", message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
