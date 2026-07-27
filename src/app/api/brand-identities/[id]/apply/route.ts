import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkFeatureAccess } from "@/lib/billing";

// POST /api/brand-identities/[id]/apply — link the brand identity to a site and
// copy its brand voice into the site's tone_of_voice.
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

  const body = await request.json().catch(() => null);
  const siteId = (body ?? {}).siteId as string | undefined;
  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  const { data: brand } = await supabase
    .from("asc_brand_identities")
    .select("id, tone_of_voice")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!brand) return NextResponse.json({ error: "Merkidentiteit niet gevonden" }, { status: 404 });

  const { data: site } = await supabase
    .from("asc_sites")
    .select("id")
    .eq("id", siteId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!site) return NextResponse.json({ error: "Site niet gevonden" }, { status: 404 });

  // Link + auto-apply the brand voice to the site's tone_of_voice.
  const { error } = await supabase
    .from("asc_sites")
    .update({
      brand_identity_id: id,
      ...(brand.tone_of_voice ? { tone_of_voice: brand.tone_of_voice } : {}),
    })
    .eq("id", siteId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, appliedVoice: Boolean(brand.tone_of_voice) });
}
