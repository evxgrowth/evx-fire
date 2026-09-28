import { defaultFilters, type Filters } from "./data";
import { normalizePeriod } from "./period";

/** Lê os filtros enviados pelo botão "Relatório PDF" (?f=...). */
export function decodeFilters(f?: string | null): Filters | null {
  if (!f) return null;
  try {
    const parsed = JSON.parse(Buffer.from(f, "base64").toString("utf8"));
    return { ...defaultFilters, ...parsed, period: normalizePeriod(parsed.period) };
  } catch {
    return null;
  }
}
