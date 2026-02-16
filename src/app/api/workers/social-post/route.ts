import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyQStashSignature } from "@/lib/qstash";
import { postToWebhook } from "@/lib/social-media";

export const maxDuration = 30;

export async function POST(request: Request) {
  const rawBody = await request.text();
  const sig = request.headers.get("upstash-signature");
  if (!(await verifyQStashSignature(sig, rawBody))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const { socialPostId, userId } = JSON.parse(rawBody);
  if (!socialPostId || !userId) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }
  const supabase = createAdminClient();

  const { data: post } = await supabase
    .from("asc_social_posts")
    .select("*")
    .eq("id", socialPostId)
    .eq("user_id", userId)
    .single();
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  if (!post.webhook_url) {
    await supabase
      .from("asc_social_posts")
      .update({ status: "failed", error_message: "No webhook URL" })
      .eq("id", socialPostId)
      .eq("user_id", userId);
    return NextResponse.json({ error: "No webhook URL" }, { status: 400 });
  }

  const result = await postToWebhook(post.webhook_url, {
    articleTitle: post.article_title ?? post.copy?.substring(0, 50) ?? "",
    articleUrl: post.wp_post_url ?? "",
    socialCopy: post.copy,
    imageUrl: post.image_url ?? undefined,
  });

  if (result.success) {
    await supabase
      .from("asc_social_posts")
      .update({ status: "sent", posted_at: new Date().toISOString() })
      .eq("id", socialPostId)
      .eq("user_id", userId);
  } else {
    await supabase
      .from("asc_social_posts")
      .update({ status: "failed", error_message: result.error })
      .eq("id", socialPostId)
      .eq("user_id", userId);
  }

  return NextResponse.json(result);
}
