// Períodos do filtro de datas (fuso de São Paulo). Arquivo puro: vale no navegador e no servidor.

export type PeriodKey = "today" | "yesterday" | "week" | "month" | "7" | "14" | "30" | "60" | "90";

export const PERIODS: { key: PeriodKey; label: string; short: string }[] = [
  { key: "today", label: "Hoje", short: "Hoje" },
  { key: "yesterday", label: "Ontem", short: "Ontem" },
  { key: "week", label: "Esta semana", short: "Esta semana" },
  { key: "month", label: "Este mês", short: "Este mês" },
  { key: "7", label: "Últimos 7 dias", short: "7 dias" },
  { key: "14", label: "Últimos 14 dias", short: "14 dias" },
  { key: "30", label: "Últimos 30 dias", short: "30 dias" },
  { key: "60", label: "Últimos 60 dias", short: "60 dias" },
  { key: "90", label: "Últimos 90 dias", short: "90 dias" },
];

export const DEFAULT_PERIOD: PeriodKey = "month";

export function todaySP() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

const shift = (iso: string, days: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const diffDays = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);

export interface Range {
  since: string;
  until: string;
  days: number;
}

/** Intervalo de datas de um período. "Esta semana" começa no domingo; "Este mês" no dia 1º. */
export function periodRange(key: PeriodKey, today = todaySP()): Range {
  let since = today;
  let until = today;
  if (key === "yesterday") since = until = shift(today, -1);
  else if (key === "week") since = shift(today, -new Date(today + "T12:00:00Z").getUTCDay());
  else if (key === "month") since = today.slice(0, 8) + "01";
  else if (key !== "today") since = shift(today, -(Number(key) - 1));
  return { since, until, days: diffDays(since, until) + 1 };
}

/** O período imediatamente anterior, com o mesmo número de dias (para as setas "vs anterior"). */
export function previousRange(r: Range): Range {
  const until = shift(r.since, -1);
  return { since: shift(until, -(r.days - 1)), until, days: r.days };
}

/** Aceita valores antigos salvos (7, 14, 30, 90 em número) e desconhecidos. */
export function normalizePeriod(v: unknown): PeriodKey {
  const s = String(v ?? "");
  return (PERIODS.some((p) => p.key === s) ? s : DEFAULT_PERIOD) as PeriodKey;
}

export function periodLabel(key: PeriodKey) {
  return PERIODS.find((p) => p.key === key)?.label ?? "";
}

export const fmtBR = (iso: string) => iso.split("-").reverse().join("/");
