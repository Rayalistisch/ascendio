import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updatePost, fetchPostElementorData } from "@/lib/wordpress";
import { decrypt } from "@/lib/encryption";
import { normalizeGenerationSettings } from "@/lib/generation-settings";
import { injectMainContent, buildDefaultElementorData } from "@/app/api/wp-posts/sync/route";

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
  let wpPublishPath: "elementor" | "elementor_fallback" | "acf" | "post_content" | "none" = "none";
  let elementorDataFound = false;
  let wpCollection: "posts" | "pages" = "posts";

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

    if (content) {
      const liveElementorMeta = await fetchPostElementorData(creds, post.wp_post_id);
      const rawElementorData = liveElementorMeta?.data ?? (post.elementor_data as unknown[] | null);
      elementorDataFound = rawElementorData !== null;
      // Voor nieuwe berichten op een Elementor-site: bouw een minimale structuur
      // zodat de content direct via Elementor gepubliceerd wordt.
      const liveElementorData = rawElementorData ?? (isElementor ? buildDefaultElementorData(content) : null);
      const useElementorPath = isElementor || elementorDataFound;
      wpCollection = liveElementorMeta?.collection ?? "posts";
      console.log(`[publish] liveElementorData: ${elementorDataFound ? "found" : "null"}, isNew: ${!elementorDataFound && isElementor}, template: ${liveElementorMeta?.pageTemplate ?? "unknown"}, collection: ${wpCollection}, useElementorPath: ${useElementorPath}`);

      if (useElementorPath && liveElementorData) {
        const updatedData = elementorDataFound
          ? injectMainContent(liveElementorData, content)
          : liveElementorData; // nieuw bericht: content zit al in de default structuur
        const metaUpdates: Record<string, string> = {
          _elementor_data: JSON.stringify(updatedData),
          _elementor_edit_mode: "builder",
        };
        // Voor nieuwe berichten: zet Elementor full width template.
        // Voor bestaande: bewaar de huidige template.
        metaUpdates._wp_page_template = liveElementorMeta?.pageTemplate ?? "elementor_full_width";
        try {
          await updatePost(creds, post.wp_post_id, {
            title: wpUpdates.title,
            content,
            meta: metaUpdates,
          }, { collection: wpCollection });
          wpPublishPath = "elementor";
          console.log(`[publish] ✓ Elementor meta + template (${liveElementorMeta?.pageTemplate}) via ${wpCollection} bijgewerkt`);
          // CSS-cache leegmaken als aparte call — mag falen zonder de update te breken.
          // Elementor slaat gegenereerde CSS op in _elementor_css; als die niet geleegd
          // wordt na een _elementor_data wijziging, laadt de browser verouderde stijlen.
          updatePost(creds, post.wp_post_id, { meta: { _elementor_css: "" } }, { collection: wpCollection }).catch((cssErr) => {
            console.warn(`[publish] _elementor_css clear overgeslagen: ${cssErr instanceof Error ? cssErr.message : cssErr}`);
          });
          // Purge page cache (WP Fastest Cache en andere plugins via mu-plugin endpoint).
          // Mag falen — de content-update zelf is al geslaagd.
          const purgeUrl = `${creds.baseUrl.replace(/\/+$/, "")}/wp-json/ascendio/v1/purge-post/${post.wp_post_id}`;
          fetch(purgeUrl, {
            method: "POST",
            headers: { Authorization: `Basic ${Buffer.from(`${creds.username}:${creds.appPassword}`).toString("base64")}` },
          }).then((r) => {
            console.log(`[publish] cache purge → HTTP ${r.status}`);
          }).catch((purgeErr) => {
            console.warn(`[publish] cache purge overgeslagen: ${purgeErr instanceof Error ? purgeErr.message : purgeErr}`);
          });
        } catch (metaErr) {
          console.warn(`[publish] meta-write mislukt (${metaErr instanceof Error ? metaErr.message : metaErr}), fallback naar post_content`);
          await updatePost(creds, post.wp_post_id, { title: wpUpdates.title, content }, { collection: wpCollection });
          wpPublishPath = "elementor_fallback";
        }
        Object.keys(wpUpdates).forEach((k) => delete (wpUpdates as Record<string, unknown>)[k]);
      } else if (acfFields.length > 0) {
        const chunks = splitHtmlByH2(content, acfFields.length);
        wpUpdates.acf = Object.fromEntries(
          acfFields.map((field: string, i: number) => [field, chunks[i] ?? ""])
        );
        wpPublishPath = "acf";
      } else {
        wpUpdates.content = content;
        // Herstel eventuele schade van eerdere commits die _elementor_edit_mode=builder
        // op niet-Elementor pagina's hebben gezet. Leegmaken zorgt dat WordPress
        // weer vanuit post_content rendert i.p.v. een lege Elementor-layout.
        wpUpdates.meta = { _elementor_edit_mode: "" };
        wpPublishPath = "post_content";
      }
    }

    if (Object.keys(wpUpdates).length > 0) {
      await updatePost(creds, post.wp_post_id, wpUpdates);
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
  return NextResponse.json({ post: updated, _debug: { wpPublishPath, elementorDataFound, wpCollection } });
}
