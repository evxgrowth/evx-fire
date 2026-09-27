const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
const num = new Intl.NumberFormat("pt-BR");
const numCompact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

export const fmtMoney = (v: number) => brl.format(v);
export const fmtMoneyShort = (v: number) => brlCompact.format(v);
export const fmtNum = (v: number) => num.format(Math.round(v));
export const fmtNumShort = (v: number) => numCompact.format(v);
export const fmtPct = (v: number, digits = 2) => `${v.toFixed(digits).replace(".", ",")}%`;
export const fmtX = (v: number) => `${v.toFixed(2).replace(".", ",")}x`;
export const fmtDay = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};
