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
    .from("asc_social_posts")
    .select("*")
    .eq("user_id", user.id)
    .eq("site_id", siteId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ posts: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { siteId, wpPostUrl, articleTitle, copy, platform, imageUrl, webhookUrl } = body;

  if (!siteId || !wpPostUrl || !articleTitle || !copy) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  let finalWebhookUrl = webhookUrl;
  if (!finalWebhookUrl) {
    const { data: site } = await supabase.from("asc_sites").select("social_webhook_url").eq("id", siteId).single();
    finalWebhookUrl = site?.social_webhook_url;
  }

  const { data, error } = await supabase
    .from("asc_social_posts")
    .insert({
      user_id: user.id,
      site_id: siteId,
      wp_post_url: wpPostUrl,
      article_title: articleTitle,
      copy,
      platform: platform || "generic",
      image_url: imageUrl || null,
      webhook_url: finalWebhookUrl || null,
      status: "pending",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ post: data }, { status: 201 });
}
