import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { exchangeCode, graphGet, graphList } from "@/lib/meta/graph";
import { syncMeta } from "@/lib/meta/sync";
import { dispatchAgency } from "@/lib/fire/dispatch";

export const maxDuration = 300;

/** Retorno da Meta depois que o gestor autorizou. */
export async function GET(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/integracoes?${q}`, req.url));
  const p = req.nextUrl.searchParams;

  if (p.get("error")) return back("meta=cancelado");
  const me = await getMe();
  if (!me?.agencyId) return NextResponse.redirect(new URL("/login", req.url));
  if (!p.get("state") || p.get("state") !== req.cookies.get("meta_oauth_state")?.value) return back("meta=erro&msg=estado-invalido");

  try {
    const token = await exchangeCode(req.nextUrl.origin, p.get("code")!);
    const user = await graphGet<{ id: string; name: string }>("me", { access_token: token.access_token, fields: "id,name" });
    const accounts = await graphList<{ id: string; name: string; currency: string; account_status: number }>("me/adaccounts", {
      access_token: token.access_token,
      fields: "id,name,currency,account_status",
    });

    const db = createAdminClient();
    const { data: conn, error } = await db
      .from("platform_connections")
      .upsert(
        {
          agency_id: me.agencyId,
          platform: "meta",
          external_user_id: user.id,
          external_user_name: user.name,
          access_token: token.access_token,
          token_expires_at: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null,
        },
        { onConflict: "agency_id,platform,external_user_id" },
      )
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Contas já existentes mantêm cliente e preferência; as novas ganham um cliente com o mesmo nome.
    const { data: existing } = await db.from("ad_accounts").select("external_id").eq("agency_id", me.agencyId).eq("platform", "meta");
    const known = new Set((existing ?? []).map((e) => e.external_id));

    for (const a of accounts) {
      if (known.has(a.id)) {
        await db.from("ad_accounts").update({ connection_id: conn.id, name: a.name, currency: a.currency }).eq("agency_id", me.agencyId).eq("external_id", a.id);
        continue;
      }
      const { data: client } = await db.from("clients").insert({ agency_id: me.agencyId, name: a.name }).select("id").single();
      await db.from("ad_accounts").insert({
        agency_id: me.agencyId,
        connection_id: conn.id,
        client_id: client?.id ?? null,
        platform: "meta",
        external_id: a.id,
        name: a.name,
        currency: a.currency,
        sync_enabled: a.account_status === 1,
      });
    }

    await syncMeta(db, me.agencyId);
    await dispatchAgency(db, me.agencyId).catch(() => null);
    const res = back(`meta=ok&contas=${accounts.length}`);
    res.cookies.delete("meta_oauth_state");
    return res;
  } catch (e) {
    return back(`meta=erro&msg=${encodeURIComponent(e instanceof Error ? e.message : "erro")}`);
  }
}
