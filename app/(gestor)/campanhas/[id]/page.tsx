import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { audienceOf } from "@/lib/fire/snapshot";
import { GOAL_LABELS } from "@/lib/meta/results";
import CampaignDetail, { type AdSetView } from "./CampaignDetail";
import ManualPanel from "./ManualPanel";

const UUID = /^[0-9a-f-]{36}$/i;

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireManager();
  if (!UUID.test(id)) return <CampaignDetail id={id} adsets={[]} />; // dados de demonstração

  const db = await createClient();
  const [{ data: camp }, { data: sets }] = await Promise.all([
    db.from("campaigns").select("*, ad_accounts(client_id)").eq("id", id).eq("agency_id", me.agencyId).maybeSingle(),
    db.from("ad_sets").select("*").eq("campaign_id", id).order("name"),
  ]);

  const adsets: AdSetView[] = (sets ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    active: s.effective_status === "ACTIVE",
    goal: GOAL_LABELS[s.optimization_goal] ?? s.optimization_goal,
    dailyBudget: Number(s.daily_budget),
    audience: audienceOf(s.targeting, s.audience_notes)?.summary ?? null,
  }));

  if (camp?.source !== "manual") return <CampaignDetail id={id} adsets={adsets} />;

  const [{ data: entries }, { data: ads }, { data: clients }] = await Promise.all([
    db.from("manual_entries").select("*").eq("campaign_id", id).order("start_date", { ascending: false }),
    db.from("creatives").select("id, ad_set_id, name, headline, body, cta, link_url, media, active").eq("campaign_id", id).order("created_at"),
    db.from("clients").select("id, name").eq("agency_id", me.agencyId).eq("active", true).order("name"),
  ]);
  const account = (Array.isArray(camp.ad_accounts) ? camp.ad_accounts[0] : camp.ad_accounts) as { client_id: string } | null;

  return (
    <CampaignDetail
      id={id}
      adsets={adsets}
      manualPanel={
        <ManualPanel
          agencyId={me.agencyId}
          campaign={{
            id: camp.id,
            clientId: account?.client_id ?? "",
            platform: camp.platform,
            name: camp.name,
            objective: camp.objective,
            status: camp.status,
            dailyBudget: Number(camp.daily_budget),
            lifetimeBudget: Number(camp.lifetime_budget),
            startDate: camp.start_time ? new Date(camp.start_time).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) : "",
            endDate: camp.stop_time ? new Date(camp.stop_time).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) : "",
            resultLabel: camp.result_label,
            notes: camp.notes,
          }}
          clients={clients ?? []}
          entries={entries ?? []}
          adsets={(sets ?? []).map((s) => ({
            id: s.id,
            name: s.name,
            active: s.effective_status === "ACTIVE",
            optimizationGoal: s.optimization_goal,
            dailyBudget: Number(s.daily_budget),
            ageMin: s.targeting?.age_min ?? 18,
            ageMax: s.targeting?.age_max ?? 65,
            genders: s.targeting?.genders ?? [],
            locations: (s.targeting?.geo_locations?.cities ?? []).map((c: { name: string }) => c.name),
            interests: (s.targeting?.flexible_spec?.[0]?.interests ?? []).map((c: { name: string }) => c.name),
            customAudiences: (s.targeting?.custom_audiences ?? []).map((c: { name: string }) => c.name),
            excludedAudiences: (s.targeting?.excluded_custom_audiences ?? []).map((c: { name: string }) => c.name),
            placements: s.targeting?.publisher_platforms ?? [],
            notes: s.audience_notes ?? "",
          }))}
          ads={(ads ?? []).map((a) => ({
            id: a.id,
            adSetId: a.ad_set_id ?? "",
            name: a.name,
            active: a.active,
            headline: a.headline,
            body: a.body,
            cta: a.cta ?? "",
            link: a.link_url ?? "",
            media: a.media ?? [],
          }))}
        />
      }
    />
  );
}
