import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchAllPosts } from "@/lib/wordpress";
import { decrypt } from "@/lib/encryption";

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
        typeof wp.excerpt === "object" && wp.excerpt?.rendered
          ? wp.excerpt.rendered
          : String(wp.excerpt || "");

      const content =
        typeof wp.content === "object" && wp.content?.rendered
          ? wp.content.rendered
          : String(wp.content || "");

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
