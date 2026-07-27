import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkFeatureAccess } from "@/lib/billing";
import { scanSiteForRefresh } from "@/lib/refresh-scan";

// POST /api/refresh/scan — run decay/stuck detection now for a site
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await checkFeatureAccess(supabase, user.id, "content_refresh");
  if (!access.allowed) {
    return NextResponse.json({ error: "Upgrade naar Pro om de refresh-loop te gebruiken" }, { status: 403 });
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

  try {
    const result = await scanSiteForRefresh(supabase, user.id, siteId);
    if (!result.scanned) {
      return NextResponse.json(
        { error: "Search Console is niet gekoppeld voor deze site" },
        { status: 400 }
      );
    }
    return NextResponse.json({ inserted: result.inserted });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scan mislukt" },
      { status: 502 }
    );
  }
}
