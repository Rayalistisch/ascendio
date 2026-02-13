import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const clusterId = searchParams.get("clusterId");
  if (!clusterId) return NextResponse.json({ error: "Missing clusterId" }, { status: 400 });

  const { data, error } = await supabase
    .from("asc_cluster_topics")
    .select("*")
    .eq("cluster_id", clusterId)
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ topics: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { clusterId, title, description, targetKeywords, sortOrder } = body;

  if (!clusterId || !title) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Verify ownership through cluster
  const { data: cluster } = await supabase
    .from("asc_clusters")
    .select("id")
    .eq("id", clusterId)
    .eq("user_id", user.id)
    .single();
  if (!cluster) return NextResponse.json({ error: "Cluster not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("asc_cluster_topics")
    .insert({
      cluster_id: clusterId,
      user_id: user.id,
      title,
      description: description || null,
      target_keywords: targetKeywords || [],
      sort_order: sortOrder ?? 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ topic: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id, title, description, targetKeywords, sortOrder, status } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (targetKeywords !== undefined) updates.target_keywords = targetKeywords;
  if (sortOrder !== undefined) updates.sort_order = sortOrder;
  if (status !== undefined) updates.status = status;

  const { data, error } = await supabase
    .from("asc_cluster_topics")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ topic: data });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase
    .from("asc_cluster_topics")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
