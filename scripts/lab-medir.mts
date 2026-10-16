// Mede o tempo (dentro do banco) e o tamanho da resposta de cada tela na agência de laboratório.
// Uso: npx tsx scripts/lab-medir.mts   (depois de criar o laboratório com scripts/lab-carga.sql)

import { sql } from "./supa.mjs";
import { defaultFilters, type Filters } from "../lib/data";
import { REPORT_ROWS, resolveView, type ViewRequest } from "../lib/views";

const [ag] = (await sql("select id from agencies where name = 'LAB CARGA (apagar)'")) as { id: string }[];
if (!ag) throw new Error("Crie o laboratório antes: node scripts/supa.mjs -f scripts/lab-carga.sql");
const [cl] = (await sql(`select id from clients where agency_id = '${ag.id}' order by name limit 1`)) as { id: string }[];
const [cp] = (await sql(`select id from campaigns where agency_id = '${ag.id}' and status = 'active' limit 1`)) as { id: string }[];

const f = (o: Partial<Filters> = {}): Filters => ({ ...defaultFilters, ...o });
const cases: [string, ViewRequest, string | null][] = [
  ["Painel – este mês", { view: "dashboard", filters: f(), top: 4, limit: 50 }, null],
  ["Painel – 90 dias", { view: "dashboard", filters: f({ period: "90" }), top: 4, limit: 50 }, null],
  ["Painel – contém 'vendas' (qualquer nível)", { view: "dashboard", filters: f({ period: "30", include: ["vendas"] }), top: 4, limit: 50 }, null],
  ["Painel – não contém 'promoção' (anúncio)", { view: "dashboard", filters: f({ period: "30", exclude: ["promoção"], scope: "ad" }), top: 4, limit: 50 }, null],
  ["Painel – 3 clientes + só Meta + ativas", { view: "dashboard", filters: f({ period: "7", platform: "meta", statuses: ["active"] }), top: 4, limit: 50 }, null],
  ["Relatório PDF – 30 dias", { view: "report", filters: f({ period: "30" }), top: 9, limit: REPORT_ROWS }, null],
  ["Campanhas – página 1", { view: "campaigns", filters: f({ period: "30" }), limit: 50 }, null],
  ["Campanhas – busca 'recife'", { view: "campaigns", filters: f({ period: "30" }), search: "recife", limit: 50 }, null],
  ["Campanhas – 10 páginas (500)", { view: "campaigns", filters: f({ period: "30" }), limit: 500 }, null],
  ["Criativos – página 1", { view: "creatives", filters: f({ period: "30" }), state: "all", limit: 40 }, null],
  ["Criativos – busca 'depoimento' rodando", { view: "creatives", filters: f({ period: "30" }), state: "active", search: "depoimento", limit: 40 }, null],
  ["Clientes (20)", { view: "clients" }, null],
  ["Detalhe de campanha", { view: "campaign", id: cp.id }, null],
  ["Link do cliente – painel", { view: "dashboard", filters: f({ clients: [cl.id] }), top: 4, limit: 50 }, cl.id],
];

console.log("Agência de laboratório: 20 clientes, 10.000 campanhas (2.000 ativas), 90 dias\n");
console.log("Tela".padEnd(44), "tempo no banco", "  resposta");
for (const [label, req, client] of cases) {
  const a = JSON.stringify(resolveView(req)).replace(/'/g, "''");
  const call = `public.fire_view('${ag.id}', ${client ? `'${client}'` : "null"}, '${a}'::jsonb)`;
  // 1ª execução aquece o cache do banco; mede a 2ª (como num uso normal)
  await sql(`select length(${call}::text)`);
  const plan = (await sql(`explain (analyze, format json) select ${call}`)) as { "QUERY PLAN": { "Execution Time": number }[] }[];
  const ms = plan[0]["QUERY PLAN"][0]["Execution Time"];
  const [{ n }] = (await sql(`select length(${call}::text) as n`)) as { n: number }[];
  console.log(label.padEnd(44), `${ms.toFixed(0).padStart(6)} ms`, `${(n / 1024).toFixed(1).padStart(9)} KB`);
}
