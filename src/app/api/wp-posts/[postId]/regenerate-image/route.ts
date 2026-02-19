import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateFeaturedImage, generateAltText } from "@/lib/openai";
import { uploadMedia, updateMedia, updatePost } from "@/lib/wordpress";
import { decrypt } from "@/lib/encryption";
import { checkCredits, deductCredits, CREDIT_COSTS } from "@/lib/credits";

export async function POST(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  void request;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Credit pre-check
  const adminSupabase = createAdminClient();
  const creditCheck = await checkCredits(adminSupabase, user.id, CREDIT_COSTS.image_regeneration);
  if (!creditCheck.enough) {
    return NextResponse.json({ error: "Onvoldoende credits" }, { status: 402 });
  }

  const { data: post } = await supabase
    .from("asc_wp_posts")
    .select("*, asc_sites(wp_base_url, wp_username, wp_app_password_encrypted)")
    .eq("id", postId)
    .eq("user_id", user.id)
    .single();

  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const site = Array.isArray(post.asc_sites) ? post.asc_sites[0] : post.asc_sites as any;
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const creds = { baseUrl: site.wp_base_url, username: site.wp_username, appPassword: decrypt(site.wp_app_password_encrypted) };

  const imageBuffer = await generateFeaturedImage(post.title, post.title);
  const altText = await generateAltText(post.title, post.title);
  const slug = post.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const media = await uploadMedia(creds, imageBuffer, `${slug}-featured-new.png`);
  await updateMedia(creds, media.id, { alt_text: altText });
  await updatePost(creds, post.wp_post_id, { featured_media: media.id } as Record<string, unknown> as { title?: string });

  await supabase.from("asc_wp_posts").update({ featured_image_url: media.url }).eq("id", postId);

  // Deduct credits after successful image regeneration
  await deductCredits(adminSupabase, user.id, "image_regeneration", postId);

  return NextResponse.json({ imageUrl: media.url });
}
