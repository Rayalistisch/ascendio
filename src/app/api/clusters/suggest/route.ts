import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { suggestClusterTopics } from "@/lib/openai";
import { decrypt } from "@/lib/encryption";
import { fetchPost, fetchPostOrPageBySlug } from "@/lib/wordpress";

const PILLAR_WP_FETCH_TIMEOUT_MS = 2500;

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSlugFromUrl(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    const segments = path.split("/").filter(Boolean);
    if (segments.length === 0) return null;
    return segments[segments.length - 1];
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { siteId, clusterId, pillarTopic, existingTopics } = body;

  if (!pillarTopic) {
    return NextResponse.json({ error: "Missing pillarTopic" }, { status: 400 });
  }

  // Get site language
  let language = "Dutch";
  let pillarDescription: string | null = null;
  let pillarKeywords: string[] = [];
  let pillarContent = "";
  let pillarContentTitle = "";

  if (siteId) {
    const { data: site } = await supabase
      .from("asc_sites")
      .select("default_language, wp_base_url, wp_username, wp_app_password_encrypted")
      .eq("id", siteId)
      .eq("user_id", user.id)
      .single();
    if (site?.default_language) language = site.default_language;

    if (clusterId) {
      const { data: cluster } = await supabase
        .from("asc_clusters")
        .select("pillar_description, pillar_keywords, pillar_wp_post_id, pillar_wp_post_url")
        .eq("id", clusterId)
        .eq("site_id", siteId)
        .eq("user_id", user.id)
        .single();

      if (cluster) {
        pillarDescription = cluster.pillar_description;
        pillarKeywords = cluster.pillar_keywords ?? [];

        // Prefer local cache first (if synced)
        if (cluster.pillar_wp_post_id) {
          const { data: cached } = await supabase
            .from("asc_wp_posts")
            .select("title, content")
            .eq("site_id", siteId)
            .eq("user_id", user.id)
            .eq("wp_post_id", cluster.pillar_wp_post_id)
            .single();

          if (cached?.content) {
            pillarContent = stripHtml(cached.content).substring(0, 3000);
            pillarContentTitle = cached.title || "";
          }
        }

        // Fallback: fetch from WP live if cache is missing
        if (!pillarContent && site?.wp_base_url && site?.wp_username && site?.wp_app_password_encrypted) {
          try {
            const creds = {
              baseUrl: site.wp_base_url,
              username: site.wp_username,
              appPassword: decrypt(site.wp_app_password_encrypted),
            };

            let wpPost: Record<string, any> | null = null;

            if (cluster.pillar_wp_post_id) {
              try {
                wpPost = await fetchPost(creds, Number(cluster.pillar_wp_post_id), {
                  timeoutMs: PILLAR_WP_FETCH_TIMEOUT_MS,
                });
              } catch {
                wpPost = null;
              }
            }

            if (!wpPost && cluster.pillar_wp_post_url) {
              const slug = getSlugFromUrl(cluster.pillar_wp_post_url);
              if (slug) {
                wpPost = await fetchPostOrPageBySlug(creds, slug, {
                  timeoutMs: PILLAR_WP_FETCH_TIMEOUT_MS,
                });
              }
            }

            if (wpPost) {
              const wpTitle =
                typeof wpPost.title === "object" ? wpPost.title?.rendered : wpPost.title;
              const wpContent =
                typeof wpPost.content === "object" ? wpPost.content?.rendered : wpPost.content;

              pillarContent = stripHtml(String(wpContent || "")).substring(0, 3000);
              pillarContentTitle = String(wpTitle || "");
            }
          } catch {
            // Fallback gracefully to topic-only suggestions
          }
        }
      }
    }
  }

  const suggestions = await suggestClusterTopics(pillarTopic, language, existingTopics, {
    pillarDescription: pillarDescription || undefined,
    pillarKeywords,
    pillarContent: pillarContent || undefined,
    pillarContentTitle: pillarContentTitle || undefined,
  });
  return NextResponse.json({ suggestions });
}
