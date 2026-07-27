import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkFeatureAccess } from "@/lib/billing";
import { decrypt } from "@/lib/encryption";
import {
  refreshSearchConsoleAccessToken,
  querySearchConsoleRows,
} from "@/lib/google-search-console";
import { gscQuickWins } from "@/lib/keyword-research";

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// POST /api/keywords/gsc-opportunities — pull page-2 "quick win" queries from
// Google Search Console and upsert them as keyword opportunities. Free (no
// credit cost) since it uses the site's own GSC data.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await checkFeatureAccess(supabase, user.id, "keyword_research");
  if (!access.allowed) {
    return NextResponse.json(
      { error: "Upgrade naar Pro om keyword-onderzoek te gebruiken" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const siteId = (body ?? {}).siteId as string | undefined;
  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  const { data: site } = await supabase
    .from("asc_sites")
    .select("id")
    .eq("id", siteId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!site) return NextResponse.json({ error: "Site niet gevonden" }, { status: 404 });

  const { data: connection } = await supabase
    .from("asc_search_console_connections")
    .select("property_url, refresh_token_encrypted")
    .eq("site_id", siteId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!connection?.property_url || !connection.refresh_token_encrypted) {
    return NextResponse.json(
      { error: "Search Console is niet gekoppeld voor deze site" },
      { status: 400 }
    );
  }

  let rows;
  try {
    const refreshToken = decrypt(connection.refresh_token_encrypted);
    const token = await refreshSearchConsoleAccessToken(refreshToken);

    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 2);
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - 27); // ~28 dagen

    rows = await querySearchConsoleRows({
      accessToken: token.access_token,
      propertyUrl: connection.property_url,
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      dimensions: ["query"],
      rowLimit: 250,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search Console query mislukt" },
      { status: 502 }
    );
  }

  const opportunities = gscQuickWins(
    rows.map((r) => ({
      query: r.keys[0] || "",
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    }))
  ).slice(0, 50);

  if (opportunities.length === 0) {
    return NextResponse.json({ inserted: 0, opportunities: [] });
  }

  const records = opportunities.map((o) => ({
    user_id: user.id,
    site_id: siteId,
    keyword: o.keyword,
    source: "gsc",
    intent: null,
    position: o.position,
    impressions: o.impressions,
    clicks: o.clicks,
    ctr: o.ctr,
    gap_score: o.gapScore,
    status: "new",
    updated_at: new Date().toISOString(),
  }));

  // Upsert: refresh metrics for keywords we've seen before, add new ones.
  const { data: saved, error } = await supabase
    .from("asc_keyword_opportunities")
    .upsert(records, { onConflict: "site_id,keyword" })
    .select("*");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ inserted: saved?.length ?? 0, opportunities: saved ?? [] });
}
