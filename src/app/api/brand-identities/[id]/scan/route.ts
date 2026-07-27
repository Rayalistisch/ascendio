import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkFeatureAccess } from "@/lib/billing";
import { checkCredits, deductCredits, CREDIT_COSTS } from "@/lib/credits";
import { fullBrandScan } from "@/lib/brand-scan";

// POST /api/brand-identities/[id]/scan — (re)scan the website and update fields
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await checkFeatureAccess(supabase, user.id, "brand_identity");
  if (!access.allowed) {
    return NextResponse.json({ error: "Upgrade naar Pro om merkidentiteiten te gebruiken" }, { status: 403 });
  }

  const { data: existing } = await supabase
    .from("asc_brand_identities")
    .select("id, website_url")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const url = (body?.url as string) || existing.website_url;
  if (!url) return NextResponse.json({ error: "Geen website-URL om te scannen" }, { status: 400 });

  const { enough } = await checkCredits(supabase, user.id, CREDIT_COSTS.brand_scan);
  if (!enough) return NextResponse.json({ error: "insufficient_credits" }, { status: 402 });

  const result = await fullBrandScan(url);
  if (!result) {
    await supabase
      .from("asc_brand_identities")
      .update({ scan_status: "failed", scan_error: "Scan mislukt", updated_at: new Date().toISOString() })
      .eq("id", id);
    return NextResponse.json({ error: "Website kon niet worden gescand" }, { status: 502 });
  }
  await deductCredits(supabase, user.id, "brand_scan", id);

  const { scan, voice } = result;
  const { data, error } = await supabase
    .from("asc_brand_identities")
    .update({
      website_url: scan.websiteUrl,
      language: scan.language,
      business_name: voice?.businessName || scan.businessName,
      tagline: voice?.tagline || scan.tagline,
      description: voice?.description || scan.description,
      primary_color: scan.primaryColor,
      secondary_color: scan.secondaryColor,
      accent_color: scan.accentColor,
      logo_url: scan.logoUrl,
      heading_font: scan.headingFont,
      body_font: scan.bodyFont,
      tone_of_voice: voice?.toneOfVoice ?? null,
      scan_status: "succeeded",
      scan_error: null,
      scanned_pages: scan.scannedPages,
      html_bytes: scan.htmlBytes,
      scanned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ brandIdentity: data });
}
