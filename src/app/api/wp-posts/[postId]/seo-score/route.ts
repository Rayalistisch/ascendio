import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeContentSEO } from "@/lib/openai";

export async function POST(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let keywords: string[] | undefined;
  try {
    const body = await request.json();
    keywords = body.keywords;
  } catch {
    // No body sent — that's fine, keywords are optional
  }

  const { data: post } = await supabase
    .from("asc_wp_posts")
    .select("*")
    .eq("id", postId)
    .eq("user_id", user.id)
    .single();

  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const analysis = await analyzeContentSEO(
    post.content || "",
    post.title,
    post.meta_description || "",
    keywords
  );

  await supabase.from("asc_wp_posts").update({ seo_score: analysis.score }).eq("id", postId);

  return NextResponse.json(analysis);
}
