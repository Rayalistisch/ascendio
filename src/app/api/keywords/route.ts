import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkFeatureAccess } from "@/lib/billing";
import { checkCredits, deductCredits, CREDIT_COSTS } from "@/lib/credits";
import { researchKeyword } from "@/lib/keyword-research";

// GET /api/keywords?siteId=... — list saved keyword opportunities for a site
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const siteId = new URL(request.url).searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  const { data, error } = await supabase
    .from("asc_keyword_opportunities")
    .select("*")
    .eq("user_id", user.id)
    .eq("site_id", siteId)
    .neq("status", "dismissed")
    .order("gap_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ opportunities: data ?? [] });
}

// POST /api/keywords — research one seed keyword via Serper and save it
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
  const { siteId, seed } = (body ?? {}) as { siteId?: string; seed?: string };
  if (!siteId || !seed || !seed.trim()) {
    return NextResponse.json({ error: "siteId en zoekwoord zijn verplicht" }, { status: 400 });
  }

  const { data: site } = await supabase
    .from("asc_sites")
    .select("id")
    .eq("id", siteId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!site) return NextResponse.json({ error: "Site niet gevonden" }, { status: 404 });

  const { enough } = await checkCredits(supabase, user.id, CREDIT_COSTS.keyword_research);
  if (!enough) {
    return NextResponse.json({ error: "insufficient_credits" }, { status: 402 });
  }

  const research = await researchKeyword(seed);

  // Deduct only after a successful lookup that returned SERP context.
  if (research.serpTitles.length > 0 || research.paa.length > 0) {
    await deductCredits(supabase, user.id, "keyword_research", siteId);
  }

  const { data: saved, error } = await supabase
    .from("asc_keyword_opportunities")
    .upsert(
      {
        user_id: user.id,
        site_id: siteId,
        keyword: research.keyword,
        source: "serper",
        intent: research.intent,
        volume: research.volume,
        difficulty: research.difficulty,
        paa: research.paa,
        related: research.related,
        serp_titles: research.serpTitles,
        status: "saved",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "site_id,keyword" }
    )
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ opportunity: saved, serperConfigured: research.serpTitles.length > 0 });
}
