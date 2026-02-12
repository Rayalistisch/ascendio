import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { copy, platform, imageUrl } = body;

  const { data: existing } = await supabase
    .from("asc_social_posts")
    .select("status")
    .eq("id", postId)
    .eq("user_id", user.id)
    .single();

  if (!existing) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  if (existing.status !== "pending") return NextResponse.json({ error: "Can only edit pending posts" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (copy) updates.copy = copy;
  if (platform) updates.platform = platform;
  if (imageUrl !== undefined) updates.image_url = imageUrl;

  const { data, error } = await supabase.from("asc_social_posts").update(updates).eq("id", postId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ post: data });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  void request;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: existing } = await supabase.from("asc_social_posts").select("status").eq("id", postId).eq("user_id", user.id).single();
  if (!existing) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  if (existing.status !== "pending") return NextResponse.json({ error: "Can only delete pending posts" }, { status: 400 });

  await supabase.from("asc_social_posts").delete().eq("id", postId);
  return NextResponse.json({ success: true });
}
