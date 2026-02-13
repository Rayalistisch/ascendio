import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  const { data: clusters, error } = await supabase
    .from("asc_clusters")
    .select("*, asc_cluster_topics(id, status)")
    .eq("user_id", user.id)
    .eq("site_id", siteId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Compute topic counts per cluster
  const enriched = (clusters ?? []).map((c) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const topics = (c as any).asc_cluster_topics ?? [];
    return {
      ...c,
      asc_cluster_topics: undefined,
      topic_count: topics.length,
      published_count: topics.filter((t: { status: string }) => t.status === "published").length,
    };
  });

  return NextResponse.json({ clusters: enriched });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { siteId, name, pillarTopic, pillarDescription, pillarKeywords, templateId } = body;

  if (!siteId || !name || !pillarTopic) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { data: site } = await supabase
    .from("asc_sites")
    .select("id")
    .eq("id", siteId)
    .eq("user_id", user.id)
    .single();
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("asc_clusters")
    .insert({
      user_id: user.id,
      site_id: siteId,
      name,
      pillar_topic: pillarTopic,
      pillar_description: pillarDescription || null,
      pillar_keywords: pillarKeywords || [],
      template_id: templateId || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cluster: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.name !== undefined) updates.name = fields.name;
  if (fields.pillarTopic !== undefined) updates.pillar_topic = fields.pillarTopic;
  if (fields.pillarDescription !== undefined) updates.pillar_description = fields.pillarDescription;
  if (fields.pillarKeywords !== undefined) updates.pillar_keywords = fields.pillarKeywords;
  if (fields.templateId !== undefined) updates.template_id = fields.templateId || null;
  if (fields.status !== undefined) updates.status = fields.status;

  const { data, error } = await supabase
    .from("asc_clusters")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cluster: data });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase
    .from("asc_clusters")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
