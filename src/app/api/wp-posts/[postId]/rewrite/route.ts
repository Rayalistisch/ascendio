import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rewriteContentWithPrompt } from "@/lib/openai";

export async function POST(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { prompt, keywords } = body;
  if (!prompt) return NextResponse.json({ error: "Missing prompt" }, { status: 400 });

  const { data: post } = await supabase
    .from("asc_wp_posts")
    .select("*")
    .eq("id", postId)
    .eq("user_id", user.id)
    .single();

  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const result = await rewriteContentWithPrompt(post.content || "", prompt, keywords);

  // Only save locally — publish happens via the PATCH "Opslaan & Publiceren" endpoint
  const { data: updated } = await supabase.from("asc_wp_posts").update({
    content: result.htmlContent,
    meta_description: result.metaDescription,
  }).eq("id", postId).select().single();

  return NextResponse.json({ post: updated });
}
