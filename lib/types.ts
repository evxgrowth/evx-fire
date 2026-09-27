// Tipos centrais da plataforma. Quando as APIs reais (Meta / Google) forem
// conectadas, os dados delas serão convertidos para estes mesmos formatos,
// então as telas não precisam mudar.

export type Platform = "meta" | "google";
export type CampaignStatus = "active" | "learning" | "paused" | "ended";
export type CreativeFormat = "image" | "video" | "carousel" | "search";

export interface DailyPoint {
  date: string; // ISO yyyy-mm-dd
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
}

export interface Creative {
  id: string;
  name: string;
  format: CreativeFormat;
  headline: string;
  media?: { type: "image" | "video"; url: string }[];
  videoUrl?: string;
  cta?: string;
  body: string;
  hue: number; // usado para gerar a prévia enquanto não há imagem real
  imageUrl?: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  active: boolean;
}

export type Source = "api" | "manual";

export interface Campaign {
  id: string;
  clientId: string;
  platform: Platform;
  source: Source;
  name: string;
  objective: string;
  status: CampaignStatus;
  dailyBudget: number;
  reach: number;
  daily: DailyPoint[];
  creatives: Creative[];
}

export interface Client {
  id: string;
  name: string;
  segment: string;
  active: boolean;
  notes?: string;
  metaAccountId?: string;
  googleCustomerId?: string;
}

export interface Manager {
  id: string;
  name: string;
  agency: string;
  email: string;
  plan: "Starter" | "Pro" | "Agency";
  status: "active" | "trial" | "suspended";
  clients: number;
  spendManaged: number;
  lastSeen: string;
  isOwner?: boolean;
}

export interface Totals {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  conversions: number;
  revenue: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cpa: number;
  roas: number;
}
