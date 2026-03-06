import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchAllPosts } from "@/lib/wordpress";
import { decrypt } from "@/lib/encryption";

// ── Elementor helpers ─────────────────────────────────────────

type ElementorElement = {
  elType?: string;
  widgetType?: string;
  settings?: Record<string, unknown>;
  elements?: ElementorElement[];
};

function collectTextWidgets(elements: ElementorElement[]): ElementorElement[] {
  const result: ElementorElement[] = [];
  for (const el of elements) {
    if (el.elType === "widget" && el.widgetType === "text-editor") result.push(el);
    if (el.elements?.length) result.push(...collectTextWidgets(el.elements));
  }
  return result;
}

function extractMainContent(elements: unknown[]): string {
  const widgets = collectTextWidgets(elements as ElementorElement[]);
  if (widgets.length === 0) return "";
  const best = widgets.reduce((a, b) =>
    String(b.settings?.editor ?? "").length > String(a.settings?.editor ?? "").length ? b : a
  );
  return String(best.settings?.editor ?? "");
}

export function injectMainContent(elements: unknown[], newHtml: string): unknown[] {
  const cloned = JSON.parse(JSON.stringify(elements)) as ElementorElement[];
  const widgets = collectTextWidgets(cloned);
  if (widgets.length === 0) return cloned;
  const best = widgets.reduce((a, b) =>
    String(b.settings?.editor ?? "").length > String(a.settings?.editor ?? "").length ? b : a
  );
  if (best.settings) best.settings.editor = newHtml;
  return cloned;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { siteId } = body;

  if (!siteId) {
    return NextResponse.json(
      { error: "Missing siteId" },
      { status: 400 }
    );
  }

  // Get site credentials
  const { data: site } = await supabase
    .from("asc_sites")
    .select("*")
    .eq("id", siteId)
    .eq("user_id", user.id)
    .single();

  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const creds = {
    baseUrl: site.wp_base_url,
    username: site.wp_username,
    appPassword: decrypt(site.wp_app_password_encrypted),
  };

  try {
    const wpPosts = await fetchAllPosts(creds);

    let syncedCount = 0;

    for (const wp of wpPosts) {
      const title =
        typeof wp.title === "object" && wp.title?.rendered
          ? wp.title.rendered
          : String(wp.title || "");

      const excerpt =
        typeof wp.excerpt === "object"
          ? (wp.excerpt?.rendered || wp.excerpt?.raw || "")
          : String(wp.excerpt || "");

      // Elementor detection — site toggle overrides auto-detection
      const rawMeta = wp.meta as Record<string, unknown> | undefined;
      const isElementor = site.is_elementor_site || rawMeta?._elementor_edit_mode === "builder";
      const rawElementorData = isElementor && typeof rawMeta?._elementor_data === "string"
        ? rawMeta._elementor_data as string : null;

      let elementorData: unknown[] | null = null;
      if (rawElementorData && rawElementorData.length > 2) {
        try { elementorData = JSON.parse(rawElementorData); } catch { /* ignore */ }
      }

      // ACF: als de site acf_content_fields heeft geconfigureerd,
      // lees content uit die ACF WYSIWYG velden i.p.v. post_content.
      const acfFields = site.acf_content_fields
        ? site.acf_content_fields.split(",").map((f: string) => f.trim()).filter(Boolean)
        : [];
      const acfData = wp.acf && typeof wp.acf === "object" ? wp.acf as Record<string, unknown> : {};
      const acfContent = acfFields.length > 0
        ? acfFields.map((f: string) => (typeof acfData[f] === "string" ? acfData[f] as string : "")).filter(Boolean).join("\n\n")
        : "";

      const content = acfContent ||
        (isElementor && elementorData
          ? (extractMainContent(elementorData) || (typeof wp.content === "object" ? (wp.content?.rendered || "") : String(wp.content || "")))
          : (typeof wp.content === "object"
              ? (wp.content?.rendered || wp.content?.raw || "")
              : String(wp.content || "")));

      const featuredImageUrl =
        wp.featured_media_url || wp._embedded?.["wp:featuredmedia"]?.[0]?.source_url || null;

      const { error: upsertError } = await supabase
        .from("asc_wp_posts")
        .upsert(
          {
            user_id: user.id,
            site_id: siteId,
            wp_post_id: wp.id,
            title,
            slug: wp.slug || "",
            url: wp.link || "",
            excerpt,
            content,
            is_elementor: isElementor,
            elementor_data: elementorData ?? null,
            status: wp.status || "publish",
            categories: wp.categories || [],
            tags: wp.tags || [],
            featured_image_url: featuredImageUrl,
            last_synced_at: new Date().toISOString(),
            wp_created_at: wp.date || null,
            wp_modified_at: wp.modified || null,
          },
          {
            onConflict: "site_id,wp_post_id",
          }
        );

      if (!upsertError) {
        syncedCount++;
      }
    }

    return NextResponse.json({
      synced: syncedCount,
      total: wpPosts.length,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to sync posts from WordPress",
      },
      { status: 500 }
    );
  }
}
