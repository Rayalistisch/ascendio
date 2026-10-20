import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";
import { createPost, createPage } from "@/lib/wordpress";
import {
  createArticle as createShopifyArticle,
  createPage as createShopifyPage,
} from "@/lib/shopify";
import { publishContent as publishToIBVision, slugify } from "@/lib/ibvision";

// POST /api/clusters/topics/[id]/publish
// Publiceert de (bewerkte) concept-content van een cluster-topic naar de CMS.
// De content staat in Ascendio (generated_content); hier wordt hij in de CMS
// aangemaakt. Optioneel stuurt de editor een laatste versie mee in de body.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const editedContent = typeof body?.content === "string" ? body.content : null;
  const editedTitle =
    typeof body?.title === "string" && body.title.trim() ? body.title.trim() : null;

  const { data: topic } = await supabase
    .from("asc_cluster_topics")
    .select(
      "id, cluster_id, user_id, title, slug, status, generated_content, generated_title, generated_meta, ibvision_url"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!topic) return NextResponse.json({ error: "Topic niet gevonden" }, { status: 404 });

  const content = editedContent ?? topic.generated_content;
  const title = editedTitle ?? topic.generated_title ?? topic.title;
  if (!content) {
    return NextResponse.json(
      { error: "Geen gegenereerde content om te publiceren" },
      { status: 400 }
    );
  }

  const { data: cluster } = await supabase
    .from("asc_clusters")
    .select("id, site_id, content_type, ibvision_url_prefix")
    .eq("id", topic.cluster_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!cluster) return NextResponse.json({ error: "Cluster niet gevonden" }, { status: 404 });

  const { data: site } = await supabase
    .from("asc_sites")
    .select(
      "platform, default_language, wp_base_url, wp_username, wp_app_password_encrypted, shopify_shop_domain, shopify_access_token_encrypted, shopify_blog_id, ibvision_base_url, ibvision_api_key_encrypted, ibvision_url_prefix"
    )
    .eq("id", cluster.site_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!site) return NextResponse.json({ error: "Site niet gevonden" }, { status: 404 });

  const platform = site.platform || "wordpress";
  const contentType = cluster.content_type || "posts";
  const slug = topic.slug || slugify(title);
  const excerpt = topic.generated_meta || "";

  let postId: string | number;
  let url: string;

  try {
    if (platform === "ibvision") {
      if (!site.ibvision_base_url || !site.ibvision_api_key_encrypted) {
        return NextResponse.json({ error: "IBVision-gegevens ontbreken" }, { status: 400 });
      }
      const res = await publishToIBVision(
        {
          baseUrl: site.ibvision_base_url,
          apiKey: decrypt(site.ibvision_api_key_encrypted),
          urlPrefix: cluster.ibvision_url_prefix || site.ibvision_url_prefix || "/",
        },
        {
          title,
          htmlContent: content,
          language: site.default_language || "Dutch",
          slug,
          customUrlPath: topic.ibvision_url || undefined,
        }
      );
      postId = res.docid;
      url = res.testUrl;
    } else if (platform === "shopify") {
      if (!site.shopify_access_token_encrypted) {
        return NextResponse.json({ error: "Shopify-gegevens ontbreken" }, { status: 400 });
      }
      const creds = {
        shopDomain: site.shopify_shop_domain!,
        accessToken: decrypt(site.shopify_access_token_encrypted),
        blogId: site.shopify_blog_id ?? null,
      };
      const res =
        contentType === "pages"
          ? await createShopifyPage(creds, { title, bodyHtml: content, published: true, slug })
          : await createShopifyArticle(creds, {
              title,
              bodyHtml: content,
              summaryHtml: excerpt || undefined,
              published: true,
              slug,
            });
      postId = res.id;
      url = res.url;
    } else {
      if (!site.wp_app_password_encrypted) {
        return NextResponse.json({ error: "WordPress-gegevens ontbreken" }, { status: 400 });
      }
      const creds = {
        baseUrl: site.wp_base_url,
        username: site.wp_username,
        appPassword: decrypt(site.wp_app_password_encrypted),
      };
      const res =
        contentType === "pages"
          ? await createPage(creds, { title, content, excerpt, status: "publish", slug })
          : await createPost(creds, { title, content, excerpt, status: "publish" });
      postId = res.id;
      url = res.url;
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Publiceren mislukt" },
      { status: 502 }
    );
  }

  // Persist (eventueel bewerkte) content + markeer als gepubliceerd.
  await supabase
    .from("asc_cluster_topics")
    .update({
      status: "published",
      generated_content: content,
      generated_title: title,
      wp_post_id: Number(postId),
      wp_post_url: url,
    })
    .eq("id", topic.id);

  return NextResponse.json({ ok: true, url, postId: String(postId) });
}
