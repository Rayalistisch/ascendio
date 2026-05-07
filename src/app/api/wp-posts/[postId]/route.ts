import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updatePost, fetchPostElementorData } from "@/lib/wordpress";
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
    .select("*, asc_sites(wp_base_url, wp_username, wp_app_password_encrypted, acf_content_fields, is_elementor_site)")
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

    const isElementor = site.is_elementor_site || post.is_elementor;
    console.log(`[publish] post ${post.wp_post_id} — isElementor: ${isElementor} (site_toggle: ${site.is_elementor_site}, post_flag: ${post.is_elementor})`);

    if (content && isElementor) {
      // Elementor-site: haal altijd de verse _elementor_data op van WP zodat we nooit
      // verouderde of ontbrekende data gebruiken, en injecteer de content in de text widget.
      const liveElementorData = await fetchPostElementorData(creds, post.wp_post_id)
        ?? (post.elementor_data as unknown[] | null);
      console.log(`[publish] elementorData source: ${liveElementorData ? (post.elementor_data ? "db-fallback or live" : "live") : "NONE"}, widgets: ${liveElementorData ? "checking..." : "N/A"}`);
      if (liveElementorData) {
        const updatedData = injectMainContent(liveElementorData, content);
        wpUpdates.meta = {
          _elementor_data: JSON.stringify(updatedData),
          // Lege string dwingt Elementor om de gegenereerde CSS te vernieuwen bij de
          // eerstvolgende page load — zonder dit kan de browser verouderde stijlen tonen.
          _elementor_css: "",
          // Zeker stellen dat Elementor deze post als "builder" post behandelt en altijd
          // uit _elementor_data rendert, niet uit post_content.
          _elementor_edit_mode: "builder",
        };
        // Stuur ook post_content mee: dit triggert wp_update_post() en save_post hooks
        // zodat caching-plugins (WP Rocket, LiteSpeed, etc.) hun cache invalideren.
        // Elementor leest voor rendering altijd _elementor_data, niet post_content.
        wpUpdates.content = content;
        console.log(`[publish] → sending via meta._elementor_data + post_content cache-bust (${JSON.stringify(updatedData).length} chars)`);
      } else {
        // Geen Elementor-data beschikbaar (API exposeert het niet) — fallback naar post_content
        console.warn(`[publish] FALLBACK post_content — _elementor_data niet beschikbaar voor post ${post.wp_post_id}`);
        wpUpdates.content = content;
      }
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

      // Verificatie: haal _elementor_data opnieuw op en controleer of onze wijziging erin zit
      if (isElementor && content) {
        const verifyData = await fetchPostElementorData(creds, post.wp_post_id);
        if (verifyData) {
          const verifyJson = JSON.stringify(verifyData);
          const firstH2 = content.match(/<h2[^>]*>(.*?)<\/h2>/i)?.[1] ?? content.slice(0, 40);
          const found = verifyJson.includes(firstH2.slice(0, 20));
          console.log(`[verify] _elementor_data na update: ${verifyJson.length} chars, bevat nieuwe H2 "${firstH2.slice(0, 30)}": ${found}`);
        } else {
          console.warn(`[verify] kon _elementor_data niet ophalen na update`);
        }
      }
    }
  }

  const dbUpdates: Record<string, unknown> = {};
  if (title) dbUpdates.title = title;
  if (content) dbUpdates.content = content;
  if (content && (site?.is_elementor_site || post.is_elementor) && post.elementor_data) {
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
