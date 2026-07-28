import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";
import { fetchPostRawContent, fetchPostOrPageBySlug } from "@/lib/wordpress";
import { detectContentProfile, describeProfile } from "@/lib/content-profile";

function slugFromReference(reference: string): string {
  try {
    const path = new URL(reference).pathname.replace(/\/+$/, "");
    return path.split("/").filter(Boolean).pop() || reference;
  } catch {
    return reference.replace(/\/+$/, "").split("/").filter(Boolean).pop() || reference;
  }
}

// POST /api/sites/analyze-structure
// Haalt een referentiepagina op, detecteert het content-formaat en slaat het
// profiel op de site op. Body: { siteId, reference } — reference = post-ID of URL.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const { siteId, reference } = (body ?? {}) as { siteId?: string; reference?: string };
  if (!siteId || !reference) {
    return NextResponse.json({ error: "siteId en referentie zijn verplicht" }, { status: 400 });
  }

  const { data: site } = await supabase
    .from("asc_sites")
    .select("wp_base_url, wp_username, wp_app_password_encrypted, platform")
    .eq("id", siteId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!site?.wp_app_password_encrypted) {
    return NextResponse.json({ error: "Site of WordPress-gegevens niet gevonden" }, { status: 404 });
  }
  if (site.platform === "ibvision") {
    return NextResponse.json({ error: "Alleen beschikbaar voor WordPress-sites" }, { status: 400 });
  }

  const creds = {
    baseUrl: site.wp_base_url,
    username: site.wp_username,
    appPassword: decrypt(site.wp_app_password_encrypted),
  };

  // Resolve de referentie naar een post-ID.
  let postId: number | null = null;
  const ref = String(reference).trim();
  if (/^\d+$/.test(ref)) {
    postId = Number(ref);
  } else {
    const found = await fetchPostOrPageBySlug(creds, slugFromReference(ref));
    if (found?.id) postId = Number(found.id);
  }
  if (!postId) {
    return NextResponse.json({ error: "Kon de referentiepagina niet vinden" }, { status: 404 });
  }

  const rawResult = await fetchPostRawContent(creds, postId);
  if (!rawResult || !rawResult.raw.trim()) {
    return NextResponse.json({ error: "Kon de opbouw van de pagina niet ophalen" }, { status: 502 });
  }

  const profile = detectContentProfile(rawResult.raw, ref);

  const { error } = await supabase
    .from("asc_sites")
    .update({ content_profile: profile })
    .eq("id", siteId)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ profile, summary: describeProfile(profile) });
}
