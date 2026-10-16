// Conferência do contrato do CRM: o pacote montado pela versão anterior (função snapshot_data)
// e pela atual (snapshot_data2) tem que ser IDÊNTICO, byte a byte, para todas as contas.
// Uso (na pasta evx-fire):
//   git show <versão anterior>:lib/fire/snapshot.ts > lib/fire/_old-snapshot.ts   (apagar depois)
//   NODE_OPTIONS="--experimental-websocket --conditions=react-server" npx tsx scripts/verify-crm.mts
// Só leitura.

import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { buildAccountPayloads, loadAgencyNames, loadAgencyTree } from "../lib/fire/snapshot";
import * as old from "../lib/fire/_old-snapshot";
import { lastDays } from "../lib/repo";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1).trim()]),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: agencies } = await db.from("agencies").select("id, name").neq("name", "LAB CARGA (apagar)");
const { data: dests } = await db.from("destinations").select("agency_id, filters");
let fails = 0;
for (const ag of agencies ?? []) {
  const filterSets = [null, ...(dests ?? []).filter((d) => d.agency_id === ag.id).map((d) => d.filters)];
  for (const [label, since] of [["90 dias", lastDays(90)[0]], ["13 meses", lastDays(395)[0]]] as const) {
    const [a, b] = await Promise.all([old.loadAgencyTree(db, ag.id, { since }), loadAgencyTree(db, ag.id, { since })]);
    for (const f of filterSets) {
      const pa = JSON.stringify(old.buildAccountPayloads(a, f));
      const pb = JSON.stringify(buildAccountPayloads(b, f));
      const same = pa === pb;
      if (!same) fails++;
      console.log(`${ag.name} | ${label} | filtros ${f ? "do destino" : "padrão"} | ${pa.length.toLocaleString("pt-BR")} bytes | ${same ? "IDÊNTICO" : "DIFERENTE"}`);
      if (!same) for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) { console.log("  antes:", pa.slice(i - 120, i + 120), "\n  agora:", pb.slice(i - 120, i + 120)); break; }
    }
  }
}
// A árvore só de nomes (tela do destino) tem que ser igual à árvore do pacote
for (const ag of agencies ?? []) {
  const [full, names] = await Promise.all([loadAgencyTree(db, ag.id, { withDaily: false }), loadAgencyNames(db, ag.id)]);
  const same = JSON.stringify(full.tree) === JSON.stringify(names);
  if (!same) fails++;
  console.log(`${ag.name} | árvore de nomes do destino | ${same ? "IDÊNTICA" : "DIFERENTE"}`);
}
console.log(fails ? `\n${fails} DIFERENÇA(S)` : "\nContrato do CRM: idêntico em todos os casos");
process.exit(fails ? 1 : 0);
