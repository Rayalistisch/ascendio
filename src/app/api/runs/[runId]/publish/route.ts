import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";
import { updatePost } from "@/lib/wordpress";
import { publishArticle as publishShopifyArticle, publishPage as publishShopifyPage } from "@/lib/shopify";

// POST /api/runs/[runId]/publish — publiceer een concept-run alsnog live
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: run } = await supabase
    .from("asc_runs")
    .select("id, site_id, status, wp_post_id, wp_post_url, cluster_topic_id")
    .eq("id", runId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!run) return NextResponse.json({ error: "Run niet gevonden" }, { status: 404 });
  if (!run.wp_post_id) {
    return NextResponse.json({ error: "Deze run heeft geen gepubliceerd item" }, { status: 400 });
  }
  if (run.status !== "draft") {
    return NextResponse.json({ error: "Deze run is geen concept" }, { status: 400 });
  }

  const { data: site } = await supabase
    .from("asc_sites")
    .select("platform, wp_base_url, wp_username, wp_app_password_encrypted, shopify_shop_domain, shopify_access_token_encrypted, shopify_blog_id")
    .eq("id", run.site_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!site) {
    return NextResponse.json({ error: "Site niet gevonden" }, { status: 404 });
  }

  const platform = site.platform || "wordpress";
  let url = run.wp_post_url;

  if (platform === "shopify") {
    if (!site.shopify_access_token_encrypted) {
      return NextResponse.json({ error: "Shopify-gegevens ontbreken" }, { status: 400 });
    }
    const shopifyCreds = {
      shopDomain: site.shopify_shop_domain!,
      accessToken: decrypt(site.shopify_access_token_encrypted),
      blogId: site.shopify_blog_id ?? null,
    };
    const itemId = Number(run.wp_post_id);
    // We weten niet zeker of het een artikel of pagina is — probeer artikel, val terug op pagina.
    try {
      await publishShopifyArticle(shopifyCreds, itemId);
    } catch {
      try {
        await publishShopifyPage(shopifyCreds, itemId);
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Publiceren mislukt" },
          { status: 502 }
        );
      }
    }
  } else {
    if (!site.wp_app_password_encrypted) {
      return NextResponse.json({ error: "WordPress-gegevens ontbreken" }, { status: 400 });
    }
    const creds = {
      baseUrl: site.wp_base_url,
      username: site.wp_username,
      appPassword: decrypt(site.wp_app_password_encrypted),
    };
    const wpPostId = Number(run.wp_post_id);

    // We weten niet zeker of het een post of pagina is — probeer posts, val terug op pages.
    let published: { id: number; url: string } | null = null;
    try {
      published = await updatePost(creds, wpPostId, { status: "publish" }, { collection: "posts" });
    } catch {
      try {
        published = await updatePost(creds, wpPostId, { status: "publish" }, { collection: "pages" });
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Publiceren mislukt" },
          { status: 502 }
        );
      }
    }

    url = published?.url || run.wp_post_url;
  }

  await supabase
    .from("asc_runs")
    .update({ status: "published", wp_post_url: url })
    .eq("id", runId)
    .eq("user_id", user.id);

  await supabase
    .from("asc_wp_posts")
    .update({ status: "publish", last_synced_at: new Date().toISOString() })
    .eq("site_id", run.site_id)
    .eq("wp_post_id", Number(run.wp_post_id));

  if (run.cluster_topic_id) {
    await supabase
      .from("asc_cluster_topics")
      .update({ status: "published" })
      .eq("id", run.cluster_topic_id);
  }

  return NextResponse.json({ ok: true, url });
}
