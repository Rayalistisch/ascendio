import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rewriteContentWithPrompt } from "@/lib/openai";
import { updatePost } from "@/lib/wordpress";
import { decrypt } from "@/lib/encryption";

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
    .select("*, asc_sites(wp_base_url, wp_username, wp_app_password_encrypted)")
    .eq("id", postId)
    .eq("user_id", user.id)
    .single();

  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const result = await rewriteContentWithPrompt(post.content || "", prompt, keywords);

  // Push to WordPress
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const site = Array.isArray(post.asc_sites) ? post.asc_sites[0] : post.asc_sites as any;
  if (site) {
    const creds = { baseUrl: site.wp_base_url, username: site.wp_username, appPassword: decrypt(site.wp_app_password_encrypted) };
    await updatePost(creds, post.wp_post_id, { content: result.htmlContent, excerpt: result.metaDescription });
  }

  const { data: updated } = await supabase.from("asc_wp_posts").update({
    content: result.htmlContent,
    meta_description: result.metaDescription,
  }).eq("id", postId).select().single();

  return NextResponse.json({ post: updated });
}
