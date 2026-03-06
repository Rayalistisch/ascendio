import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updatePost } from "@/lib/wordpress";
import { decrypt } from "@/lib/encryption";
import { normalizeGenerationSettings } from "@/lib/generation-settings";
import { injectMainContent } from "@/app/api/wp-posts/sync/route";

/**
 * Split HTML content across `count` buckets by H2 section boundaries.
 * Each H2 tag and everything up to the next H2 (or end) is one "section".
 * Sections are distributed as evenly as possible by character count.
 */
function splitHtmlByH2(html: string, count: number): string[] {
  if (count <= 1) return [html];

  // Split on H2 opening tags, keeping the delimiter
  const parts = html.split(/(?=<h2[\s>])/i);

  // If no H2 found or only one chunk, distribute by character midpoints
  if (parts.length <= 1) {
    const mid = Math.floor(html.length / count);
    const chunks: string[] = [];
    let offset = 0;
    for (let i = 0; i < count; i++) {
      const end = i < count - 1 ? offset + mid : html.length;
      chunks.push(html.slice(offset, end));
      offset = end;
    }
    return chunks;
  }

  // Distribute sections into buckets evenly by total character length
  const totalLen = html.length;
  const targetLen = totalLen / count;
  const buckets: string[][] = Array.from({ length: count }, () => []);
  let bucket = 0;
  let bucketLen = 0;

  for (const part of parts) {
    if (bucket < count - 1 && bucketLen + part.length > targetLen * (bucket + 1)) {
      bucket++;
      bucketLen = 0;
    }
    buckets[bucket].push(part);
    bucketLen += part.length;
  }

  return buckets.map((b) => b.join(""));
}

export async function GET(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("asc_wp_posts")
    .select("*")
    .eq("id", postId)
    .eq("user_id", user.id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  return NextResponse.json({ post: data });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { title, content, excerpt, metaTitle, metaDescription, generationSettings } = body;

  const { data: post } = await supabase
    .from("asc_wp_posts")
    .select("*, asc_sites(wp_base_url, wp_username, wp_app_password_encrypted, acf_content_fields)")
    .eq("id", postId)
    .eq("user_id", user.id)
    .single();

  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const site = Array.isArray(post.asc_sites) ? post.asc_sites[0] : post.asc_sites as any;
  if (site) {
    const creds = {
      baseUrl: site.wp_base_url,
      username: site.wp_username,
      appPassword: decrypt(site.wp_app_password_encrypted),
    };
    const wpUpdates: { title?: string; content?: string; excerpt?: string; meta?: Record<string, string>; acf?: Record<string, string> } = {};
    if (title) wpUpdates.title = title;
    if (excerpt) wpUpdates.excerpt = excerpt;

    const acfFields = site.acf_content_fields
      ? site.acf_content_fields.split(",").map((f: string) => f.trim()).filter(Boolean)
      : [];

    if (content && post.is_elementor && post.elementor_data) {
      // Elementor-site: injecteer content terug in de text-editor widget JSON
      const updatedData = injectMainContent(post.elementor_data as unknown[], content);
      wpUpdates.meta = { _elementor_data: JSON.stringify(updatedData) };
      // post_content wordt door Elementor genegeerd — niet meesturen
    } else if (content && acfFields.length > 0) {
      // ACF-site: verdeel content over alle geconfigureerde WYSIWYG velden
      const chunks = splitHtmlByH2(content, acfFields.length);
      wpUpdates.acf = Object.fromEntries(
        acfFields.map((field: string, i: number) => [field, chunks[i] ?? ""])
      );
    } else if (content) {
      wpUpdates.content = content;
    }

    if (Object.keys(wpUpdates).length > 0) {
      await updatePost(creds, post.wp_post_id, wpUpdates);
    }
  }

  const dbUpdates: Record<string, unknown> = {};
  if (title) dbUpdates.title = title;
  if (content) dbUpdates.content = content;
  if (content && post.is_elementor && post.elementor_data) {
    dbUpdates.elementor_data = injectMainContent(post.elementor_data as unknown[], content);
  }
  if (excerpt) dbUpdates.excerpt = excerpt;
  if (metaTitle) dbUpdates.meta_title = metaTitle;
  if (metaDescription) dbUpdates.meta_description = metaDescription;
  if (generationSettings !== undefined) {
    dbUpdates.generation_settings = normalizeGenerationSettings(generationSettings);
  }

  const { data: updated, error } = await supabase
    .from("asc_wp_posts")
    .update(dbUpdates)
    .eq("id", postId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ post: updated });
}
