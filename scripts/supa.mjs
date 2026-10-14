// Ferramenta interna: executa SQL no banco da Fire pela API de gerenciamento do Supabase.
// Uso:  node scripts/supa.mjs "select 1"        (SQL na linha)
//       node scripts/supa.mjs -f arquivo.sql    (SQL de um arquivo)
//       node scripts/supa.mjs --api /v1/projects/{ref}/...   (GET na API de gerenciamento)
// Lê SUPABASE_ACCESS_TOKEN e NEXT_PUBLIC_SUPABASE_URL do .env.local (nunca vai para o GitHub).
import fs from "fs";

const env = Object.fromEntries(
  fs
    .readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1).trim()]),
);
const token = env.SUPABASE_ACCESS_TOKEN;
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
if (!token) throw new Error("SUPABASE_ACCESS_TOKEN vazio no .env.local");

export async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`SQL falhou (${r.status}): ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

export async function api(path, init = {}) {
  const r = await fetch(`https://api.supabase.com${path.replace("{ref}", ref)}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`API falhou (${r.status}): ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const [flag, value] = process.argv.slice(2);
  const out = flag === "--api" ? await api(value) : await sql(flag === "-f" ? fs.readFileSync(value, "utf8") : flag);
  console.log(JSON.stringify(out, null, 1));
}
