import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enqueueSocialPostJob } from "@/lib/qstash";

export async function POST(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  void request;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: post } = await supabase
    .from("asc_social_posts")
    .select("id, site_id, status")
    .eq("id", postId)
    .eq("user_id", user.id)
    .single();

  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  if (post.status !== "pending") return NextResponse.json({ error: "Post already processed" }, { status: 400 });

  const { messageId } = await enqueueSocialPostJob({ socialPostId: postId, siteId: post.site_id, userId: user.id });
  return NextResponse.json({ messageId });
}
