import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  const { data, error } = await supabase
    .from("asc_article_templates")
    .select("*")
    .eq("user_id", user.id)
    .eq("site_id", siteId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { siteId, name, description, structure, isDefault } = body;

  if (!siteId || !name || !structure) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Verify user owns the site
  const { data: site } = await supabase
    .from("asc_sites")
    .select("id")
    .eq("id", siteId)
    .eq("user_id", user.id)
    .single();
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  // If setting as default, unset existing default first
  if (isDefault) {
    await supabase
      .from("asc_article_templates")
      .update({ is_default: false })
      .eq("site_id", siteId)
      .eq("user_id", user.id)
      .eq("is_default", true);
  }

  const { data, error } = await supabase
    .from("asc_article_templates")
    .insert({
      user_id: user.id,
      site_id: siteId,
      name,
      description: description || null,
      structure,
      is_default: isDefault || false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id, name, description, structure, isDefault } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // If setting as default, unset existing default first
  if (isDefault) {
    const { data: existing } = await supabase
      .from("asc_article_templates")
      .select("site_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (existing) {
      await supabase
        .from("asc_article_templates")
        .update({ is_default: false })
        .eq("site_id", existing.site_id)
        .eq("user_id", user.id)
        .eq("is_default", true);
    }
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (structure !== undefined) updates.structure = structure;
  if (isDefault !== undefined) updates.is_default = isDefault;

  const { data, error } = await supabase
    .from("asc_article_templates")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase
    .from("asc_article_templates")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
