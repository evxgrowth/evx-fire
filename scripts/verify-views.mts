// Conferência: o cálculo do banco (fire_view) dá o MESMO resultado do cálculo antigo das telas
// (filterCampaigns & cia., feito sobre a base inteira) para muitas combinações de filtros.
// Uso (na pasta evx-fire): NODE_OPTIONS=--experimental-websocket npx tsx scripts/verify-views.mts [quantidade]
// Só leitura. Usa a chave de serviço de .env.local.

import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { defaultFilters, type Filters } from "../lib/data";
import { unpack, type Packed } from "../lib/packed";
import { PERIODS } from "../lib/period";
import { computeView, normalizeView, resolveView, type ViewRequest } from "../lib/views";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1).trim()]),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const N = Number(process.argv[2] ?? 300);

// gerador previsível (mesma sequência a cada execução)
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const some = <T,>(a: T[], max = 2) => [...new Set(Array.from({ length: Math.floor(rnd() * (max + 1)) }, () => pick(a)))];

/** Compara com tolerância numérica (o banco soma em decimal exato; o navegador, em ponto flutuante). */
function diff(a: unknown, b: unknown, path = ""): string | null {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b)) ? null : `${path}: ${a} ≠ ${b}`;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return a === b || (a == null && b == null) ? null : `${path}: ${JSON.stringify(a)?.slice(0, 80)} ≠ ${JSON.stringify(b)?.slice(0, 80)}`;
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: tipo diferente`;
  if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length) return `${path}: ${a.length} itens ≠ ${b.length} itens`;
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
  for (const k of keys) {
    const va = (a as Record<string, unknown>)[k];
    const vb = (b as Record<string, unknown>)[k];
    if (va === undefined && vb === undefined) continue;
    const d = diff(va, vb, `${path}.${k}`);
    if (d) return d;
  }
  return null;
}

const { data: agencies } = await db.from("agencies").select("id, name").neq("status", "suspended");
let total = 0;
let fails = 0;
let filled = 0;
for (const ag of agencies ?? []) {
  // links de cliente: os clientes com mais campanhas
  const { data: withCamps } = await db.rpc("fire_view", { p_agency: ag.id, p_client: null, a: resolveView({ view: "clients" }) });
  const top = Object.entries((withCamps?.stats ?? {}) as Record<string, { count: number }>)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 2)
    .map(([id]) => id);
  const scopes: (string | null)[] = [null, ...top];
  for (const only of scopes) {
    const hist = resolveView({ view: "dashboard" }).hist_since;
    const { data: packed } = await db.rpc("gestor_data", { p_agency: ag.id, p_client: only, p_since: hist });
    if (!packed) continue;
    const base = unpack(packed as Packed);
    const all = base.campaigns;
    // termos reais tirados dos nomes (campanha, conjunto, anúncio), em pedaços e com/sem acento
    const words = [...new Set(all.flatMap((c) => [c.name, ...(c.adsets ?? []).map((s) => s.name), ...c.creatives.map((cr) => cr.name)]).flatMap((n) => n.split(/[\s|\-_[\]()@]+/)).filter((w) => w.length >= 3))];
    const terms = [...words.slice(0, 400), "ção", "SAUDE", "zzz-nada", all[0]?.id.slice(0, 8) ?? "abc"];
    const clientIds = base.clients.filter((c) => c.active).map((c) => c.id);
    const cases: ViewRequest[] = [
      { view: "clients" },
      ...all.slice(0, 5).map((c) => ({ view: "campaign" as const, id: c.id })),
    ];
    for (let i = 0; i < N; i++) {
      const filters: Filters = {
        ...defaultFilters,
        period: pick(PERIODS).key,
        platform: pick(["all", "all", "meta", "google"] as const),
        clients: only ? [only] : rnd() < 0.3 ? some(clientIds) : [],
        statuses: rnd() < 0.3 ? some(["active", "learning", "paused", "ended"] as const) : [],
        sources: rnd() < 0.2 ? some(["api", "manual"] as const, 1) : [],
        include: rnd() < 0.5 ? some(terms) : [],
        exclude: rnd() < 0.35 ? some(terms) : [],
        scope: pick(["any", "campaign", "adset", "ad"] as const),
      };
      const view = pick(["dashboard", "report", "campaigns", "creatives"] as const);
      cases.push({
        view,
        filters,
        limit: pick([50, 100, 2000]),
        top: view === "report" ? 9 : 4,
        search: rnd() < 0.3 ? pick(terms) : "",
        state: pick(["all", "active", "inactive"] as const),
      });
    }
    for (const req of cases) {
      const r = resolveView(req);
      const { data, error } = await db.rpc("fire_view", { p_agency: ag.id, p_client: only, a: r });
      total++;
      if (error) {
        fails++;
        console.log("ERRO no banco", req.view, error.message);
        continue;
      }
      const got = normalizeView(req.view, data);
      const want = computeView(all, r);
      // o detalhe de campanha traz o nome do cliente (o cálculo antigo não tinha esse campo)
      if (req.view === "campaign" && got && want) (want as { campaign: { clientName: string | null } }).campaign.clientName = (got as { campaign: { clientName: string | null } }).campaign.clientName;
      const size = (want as { count?: number; tableTotal?: number } | null)?.count ?? (want ? 1 : 0);
      if (size > 0) filled++;
      const d = diff(want, got, req.view);
      if (d) {
        fails++;
        if (fails <= 15) console.log("DIFERENÇA", ag.name, only ? "(link do cliente)" : "", JSON.stringify({ ...req, filters: req.filters }), "\n   ", d);
      }
    }
    console.log(`${ag.name}${only ? " / cliente " + only.slice(0, 8) : ""}: ${cases.length} combinações conferidas`);
  }
}
console.log(`\nTOTAL: ${total} combinações (${filled} com resultado não vazio), ${fails} diferença(s)`);
process.exit(fails ? 1 : 0);
