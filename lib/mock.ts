// Dados de DEMONSTRAÇÃO. Servem para visualizar a plataforma antes da
// integração real. Depois, lib/data.ts passa a buscar da Meta e do Google
// e este arquivo deixa de ser usado.

import { todaySP } from "./period";
import type { Campaign, Client, Creative, DailyPoint, Manager, Platform, CampaignStatus } from "./types";

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAYS = 90;
// A demonstração termina sempre "hoje" (fuso de São Paulo)
const END = Date.parse(todaySP() + "T12:00:00Z");

function isoDay(offset: number) {
  return new Date(END - offset * 86400000).toISOString().slice(0, 10);
}

export const clients: Client[] = [
  { id: "c1", name: "Vida Plena Home Care", segment: "Saúde", active: true, metaAccountId: "act_1029384756", googleCustomerId: "812-445-9921" },
  { id: "c2", name: "Nova Estética", segment: "Estética", active: true, metaAccountId: "act_5647382910", googleCustomerId: "633-120-4471" },
  { id: "c3", name: "Loja Brasa Store", segment: "E-commerce", active: true, metaAccountId: "act_9988776655", googleCustomerId: "445-981-2210" },
  { id: "c4", name: "Imobiliária Horizonte", segment: "Imóveis", active: true, metaAccountId: "act_1122334455" },
];

const headlines = [
  "Oferta por tempo limitado",
  "Agende sua avaliação grátis",
  "Frete grátis hoje",
  "Conheça o método que funciona",
  "Últimas unidades disponíveis",
  "Resultados reais em 30 dias",
  "Fale com um especialista",
  "Coleção nova chegou",
];

type Seed = { name: string; clientId: string; platform: Platform; objective: string; status: CampaignStatus; budget: number; ticket: number; ctr: number; cvr: number };

const seeds: Seed[] = [
  { name: "[VDP] Conversão | Cuidadores 24h", clientId: "c1", platform: "meta", objective: "Leads", status: "active", budget: 180, ticket: 450, ctr: 1.9, cvr: 6.5 },
  { name: "[VDP] Pesquisa | Home Care SP", clientId: "c1", platform: "google", objective: "Pesquisa", status: "active", budget: 220, ticket: 520, ctr: 6.8, cvr: 8.2 },
  { name: "[VDP] Remarketing | Visitantes 30d", clientId: "c1", platform: "meta", objective: "Conversões", status: "learning", budget: 60, ticket: 450, ctr: 2.4, cvr: 7.1 },
  { name: "[NE] Leads | Harmonização Facial", clientId: "c2", platform: "meta", objective: "Leads", status: "active", budget: 150, ticket: 890, ctr: 2.2, cvr: 4.8 },
  { name: "[NE] Pesquisa | Botox Zona Sul", clientId: "c2", platform: "google", objective: "Pesquisa", status: "paused", budget: 90, ticket: 780, ctr: 5.4, cvr: 5.9 },
  { name: "[NE] Alcance | Marca Setembro", clientId: "c2", platform: "meta", objective: "Alcance", status: "ended", budget: 40, ticket: 890, ctr: 0.9, cvr: 1.1 },
  { name: "[BRASA] Vendas | Catálogo Advantage+", clientId: "c3", platform: "meta", objective: "Vendas", status: "active", budget: 420, ticket: 189, ctr: 1.6, cvr: 3.4 },
  { name: "[BRASA] Performance Max | Geral", clientId: "c3", platform: "google", objective: "Performance Max", status: "active", budget: 380, ticket: 205, ctr: 3.1, cvr: 3.9 },
  { name: "[BRASA] Shopping | Mais vendidos", clientId: "c3", platform: "google", objective: "Shopping", status: "learning", budget: 160, ticket: 175, ctr: 2.7, cvr: 4.4 },
  { name: "[HZ] Leads | Lançamento Vista Mar", clientId: "c4", platform: "meta", objective: "Leads", status: "active", budget: 260, ticket: 2400, ctr: 1.3, cvr: 2.1 },
];

const formats: Record<Platform, Creative["format"][]> = {
  meta: ["image", "video", "carousel"],
  google: ["search", "image", "video"],
};

function buildCampaign(s: Seed, i: number): Campaign {
  const r = rng(1000 + i * 97);
  const daily: DailyPoint[] = [];
  let reachAcc = 0;
  for (let d = DAYS - 1; d >= 0; d--) {
    const running = s.status === "ended" ? d > 12 : s.status === "paused" ? d > 5 : true;
    const trend = 0.85 + (DAYS - d) / DAYS / 3;
    const weekday = new Date(END - d * 86400000).getUTCDay();
    const weekend = weekday === 0 || weekday === 6 ? 0.82 : 1;
    const spend = running ? s.budget * trend * weekend * (0.8 + r() * 0.35) : 0;
    const cpm = s.platform === "meta" ? 18 + r() * 14 : 30 + r() * 25;
    const impressions = running ? (spend / cpm) * 1000 : 0;
    const clicks = impressions * (s.ctr / 100) * (0.8 + r() * 0.4);
    const conversions = Math.round(clicks * (s.cvr / 100) * (0.7 + r() * 0.6));
    const closeRate = ["Vendas", "Performance Max", "Shopping"].includes(s.objective) ? 1 : 0.14;
    const revenue = conversions * closeRate * s.ticket * (0.85 + r() * 0.3);
    reachAcc += impressions * 0.28;
    daily.push({
      date: isoDay(d),
      spend: +spend.toFixed(2),
      impressions: Math.round(impressions),
      clicks: Math.round(clicks),
      conversions,
      revenue: +revenue.toFixed(2),
    });
  }

  const totalImp = daily.reduce((a, p) => a + p.impressions, 0);
  const totalClicks = daily.reduce((a, p) => a + p.clicks, 0);
  const totalSpend = daily.reduce((a, p) => a + p.spend, 0);
  const totalConv = daily.reduce((a, p) => a + p.conversions, 0);
  const nCreatives = 3 + Math.floor(r() * 3);
  const weights = Array.from({ length: nCreatives }, () => 0.3 + r());
  const wSum = weights.reduce((a, b) => a + b, 0);

  const creatives: Creative[] = weights.map((w, k) => {
    const share = w / wSum;
    const format = formats[s.platform][k % 3];
    const ctrBias = 0.7 + r() * 0.6;
    return {
      id: `cr-${i}-${k}`,
      name: `${format === "video" ? "VID" : format === "carousel" ? "CAR" : format === "search" ? "RSA" : "IMG"}_${String(k + 1).padStart(2, "0")}_${s.objective.split(" ")[0].toUpperCase()}`,
      format,
      headline: headlines[(i + k) % headlines.length],
      body: "Texto principal do anúncio aparece aqui quando a integração estiver ativa.",
      hue: Math.round(10 + r() * 30),
      impressions: Math.round(totalImp * share),
      clicks: Math.round(totalClicks * share * ctrBias),
      spend: +(totalSpend * share).toFixed(2),
      conversions: Math.round(totalConv * share * ctrBias),
      active: s.status !== "ended" && s.status !== "paused" && k < nCreatives - 1,
    };
  });

  return {
    id: `cmp-${i + 1}`,
    clientId: s.clientId,
    platform: s.platform,
    source: "api",
    name: s.name,
    objective: s.objective,
    status: s.status,
    dailyBudget: s.budget,
    reach: Math.round(reachAcc / 3), // alcance de 30 dias
    daily,
    creatives,
  };
}

export const campaigns: Campaign[] = seeds.map(buildCampaign);

export interface ShareLink {
  token: string;
  clientId: string;
  label: string;
  createdAt: string;
  views: number;
  showRevenue: boolean;
  showCreatives: boolean;
  active: boolean;
}

export const shareLinks: ShareLink[] = [
  { token: "vdp-7f3k2", clientId: "c1", label: "Relatório mensal — Vida Plena", createdAt: "2026-09-02", views: 48, showRevenue: true, showCreatives: true, active: true },
  { token: "brasa-9x1m", clientId: "c3", label: "Painel e-commerce Brasa", createdAt: "2026-08-21", views: 131, showRevenue: true, showCreatives: true, active: true },
  { token: "ne-4q8zt", clientId: "c2", label: "Nova Estética (sem receita)", createdAt: "2026-09-15", views: 9, showRevenue: false, showCreatives: true, active: false },
];

export const managers: Manager[] = [
  { id: "m1", name: "Rafael Lima", agency: "EVX Growth Studio", email: "rafael@evxgrowth.com.br", plan: "Agency", status: "active", clients: 14, spendManaged: 186400, lastSeen: "há 3 min" },
  { id: "m2", name: "Juliana Castro", agency: "Castro Performance", email: "ju@castroperf.com", plan: "Pro", status: "active", clients: 8, spendManaged: 74250, lastSeen: "há 1 h" },
  { id: "m3", name: "Bruno Almeida", agency: "Ignite Ads", email: "bruno@igniteads.com", plan: "Pro", status: "active", clients: 6, spendManaged: 51900, lastSeen: "há 4 h" },
  { id: "m4", name: "Camila Rocha", agency: "Rocha Digital", email: "camila@rochadigital.com", plan: "Starter", status: "trial", clients: 2, spendManaged: 8300, lastSeen: "ontem" },
  { id: "m5", name: "Diego Martins", agency: "DM Tráfego", email: "diego@dmtrafego.com", plan: "Starter", status: "suspended", clients: 3, spendManaged: 0, lastSeen: "há 12 dias" },
  { id: "m6", name: "Patrícia Nunes", agency: "Chama Marketing", email: "patricia@chama.mkt", plan: "Agency", status: "active", clients: 21, spendManaged: 243700, lastSeen: "há 20 min" },
];
