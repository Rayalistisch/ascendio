import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { uploadMedia, updatePost } from "@/lib/wordpress";
import { decrypt } from "@/lib/encryption";

export async function POST(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
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

  const creds = {
    baseUrl: site.wp_base_url,
    username: site.wp_username,
    appPassword: decrypt(site.wp_app_password_encrypted),
  };

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const filename = file.name || "uploaded-image.png";

  const media = await uploadMedia(creds, buffer, filename);
  await updatePost(creds, post.wp_post_id, { featured_media: media.id } as Record<string, unknown> as { title?: string });
  await supabase.from("asc_wp_posts").update({ featured_image_url: media.url }).eq("id", postId);

  return NextResponse.json({ imageUrl: media.url });
}
