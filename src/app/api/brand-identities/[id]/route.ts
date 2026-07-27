import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/brand-identities/[id]
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("asc_brand_identities")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });

  // Which sites are linked to this brand identity?
  const { data: linkedSites } = await supabase
    .from("asc_sites")
    .select("id, name")
    .eq("user_id", user.id)
    .eq("brand_identity_id", id);

  return NextResponse.json({ brandIdentity: data, linkedSites: linkedSites ?? [] });
}

const EDITABLE: Record<string, string> = {
  name: "name",
  businessName: "business_name",
  tagline: "tagline",
  description: "description",
  primaryColor: "primary_color",
  secondaryColor: "secondary_color",
  accentColor: "accent_color",
  logoUrl: "logo_url",
  headingFont: "heading_font",
  bodyFont: "body_font",
  language: "language",
  websiteUrl: "website_url",
  toneOfVoice: "tone_of_voice",
};

// PATCH /api/brand-identities/[id] — edit fields
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const [key, col] of Object.entries(EDITABLE)) {
    if (body[key] !== undefined) updates[col] = body[key];
  }

  const { data, error } = await supabase
    .from("asc_brand_identities")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ brandIdentity: data });
}

// DELETE /api/brand-identities/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("asc_brand_identities")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
