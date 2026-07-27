import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkFeatureAccess } from "@/lib/billing";
import { checkCredits, deductCredits, CREDIT_COSTS } from "@/lib/credits";
import { fullBrandScan } from "@/lib/brand-scan";

// GET /api/brand-identities — list the user's brand identities
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await checkFeatureAccess(supabase, user.id, "brand_identity");
  if (!access.allowed) {
    return NextResponse.json({ error: "Upgrade naar Pro om merkidentiteiten te gebruiken" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("asc_brand_identities")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ brandIdentities: data ?? [] });
}

// POST /api/brand-identities — create a brand identity, optionally by scanning a URL
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await checkFeatureAccess(supabase, user.id, "brand_identity");
  if (!access.allowed) {
    return NextResponse.json({ error: "Upgrade naar Pro om merkidentiteiten te gebruiken" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const { name, scanUrl } = (body ?? {}) as { name?: string; scanUrl?: string };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row: Record<string, any> = { user_id: user.id, name: name || "Naamloze merkidentiteit" };

  if (scanUrl && scanUrl.trim()) {
    const { enough } = await checkCredits(supabase, user.id, CREDIT_COSTS.brand_scan);
    if (!enough) return NextResponse.json({ error: "insufficient_credits" }, { status: 402 });

    const result = await fullBrandScan(scanUrl);
    if (!result) {
      return NextResponse.json({ error: "Website kon niet worden gescand" }, { status: 502 });
    }
    await deductCredits(supabase, user.id, "brand_scan");

    const { scan, voice } = result;
    Object.assign(row, {
      name: voice?.businessName || scan.businessName || name || "Naamloze merkidentiteit",
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
      scanned_pages: scan.scannedPages,
      html_bytes: scan.htmlBytes,
      scanned_at: new Date().toISOString(),
    });
  }

  const { data, error } = await supabase
    .from("asc_brand_identities")
    .insert(row)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ brandIdentity: data }, { status: 201 });
}
