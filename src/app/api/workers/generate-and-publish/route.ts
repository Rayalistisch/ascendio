import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";
import {
  generateEnhancedArticle,
  generateFeaturedImage,
  generateInArticleImage,
  generateAltText,
  generateSocialCopy,
} from "@/lib/openai";
import {
  uploadMedia,
  createPost,
  updateMedia,
  fetchAllPosts,
} from "@/lib/wordpress";
import { searchYouTubeVideos } from "@/lib/youtube";
import { selectSourceItem, markSourceItemUsed } from "@/lib/content-sources";
import { logStep } from "@/lib/logger";
import {
  verifyQStashSignature,
  enqueueSocialPostJob,
  enqueueIndexingJob,
} from "@/lib/qstash";

export const maxDuration = 300; // 5 min for Vercel Pro

export async function POST(request: Request) {
  const rawBody = await request.text();

  // Verify QStash signature
  const signature = request.headers.get("upstash-signature");
  const valid = await verifyQStashSignature(signature, rawBody);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);
  const { runId, siteId, userId } = body;

  if (!runId || !siteId || !userId) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Mark run as running
  await supabase
    .from("asc_runs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", runId);

  await logStep(supabase, runId, "info", "Run gestart");

  try {
    // 1. Get site credentials
    const { data: site } = await supabase
      .from("asc_sites")
      .select("*")
      .eq("id", siteId)
      .single();

    if (!site) throw new Error("Site niet gevonden");

    const wpAppPassword = decrypt(site.wp_app_password_encrypted);
    const creds = {
      baseUrl: site.wp_base_url,
      username: site.wp_username,
      appPassword: wpAppPassword,
    };
    const language = site.default_language || "Dutch";

    await logStep(supabase, runId, "info", "Site-gegevens geladen", {
      site: site.name,
    });

    // 2. Sync WP posts for internal linking
    await logStep(supabase, runId, "info", "WordPress posts synchroniseren...");
    let existingPosts: { slug: string; title: string }[] = [];
    try {
      const wpPosts = await fetchAllPosts(creds, {
        fields: ["id", "title", "slug", "link", "excerpt", "status", "date", "modified"],
      });
      existingPosts = wpPosts.map((p) => ({
        slug: p.slug,
        title: typeof p.title === "object" ? p.title.rendered : p.title,
      }));

      // Cache posts in asc_wp_posts
      for (const p of wpPosts) {
        const postTitle = typeof p.title === "object" ? p.title.rendered : p.title;
        const postExcerpt = typeof p.excerpt === "object" ? p.excerpt.rendered : p.excerpt;
        await supabase.from("asc_wp_posts").upsert(
          {
            user_id: userId,
            site_id: siteId,
            wp_post_id: p.id,
            title: postTitle || "",
            slug: p.slug || "",
            url: p.link || "",
            excerpt: postExcerpt || "",
            status: p.status || "publish",
            last_synced_at: new Date().toISOString(),
            wp_created_at: p.date,
            wp_modified_at: p.modified,
          },
          { onConflict: "site_id,wp_post_id" }
        );
      }

      await logStep(supabase, runId, "info", `${wpPosts.length} posts gesynchroniseerd`);
    } catch (syncErr) {
      await logStep(supabase, runId, "warn", "WP sync overgeslagen: " + (syncErr instanceof Error ? syncErr.message : "onbekend"));
    }

    // 3. Select source item (if content sources are configured)
    let sourceContent: string | undefined;
    let sourceTitle: string | undefined;
    let sourceItemId: string | undefined;

    const sourceItem = await selectSourceItem(supabase, siteId);
    if (sourceItem) {
      sourceContent = sourceItem.raw_content || sourceItem.summary || "";
      sourceTitle = sourceItem.title;
      sourceItemId = sourceItem.id;
      await markSourceItemUsed(supabase, sourceItem.id);
      await logStep(supabase, runId, "info", "Bronitem geselecteerd", {
        source: sourceTitle,
      });
    }

    // 4. Generate enhanced article
    await logStep(supabase, runId, "info", "Artikel genereren via OpenAI...");
    const article = await generateEnhancedArticle({
      niche: site.name,
      language,
      sourceContent,
      sourceTitle,
      existingPosts,
      siteBaseUrl: site.wp_base_url.replace(/\/+$/, ""),
    });

    await supabase
      .from("asc_runs")
      .update({
        topic: article.topic,
        article_title: article.title,
        meta_description: article.metaDescription,
        schema_markup: article.schemaMarkup,
        source_item_id: sourceItemId || null,
        internal_links_added: article.internalLinksUsed.length,
        external_links_added: article.externalLinksUsed.length,
      })
      .eq("id", runId);

    await logStep(supabase, runId, "info", "Artikel gegenereerd", {
      title: article.title,
      internalLinks: article.internalLinksUsed.length,
      externalLinks: article.externalLinksUsed.length,
      faqItems: article.faqItems.length,
    });

    // 5. Generate featured image
    await logStep(supabase, runId, "info", "Uitgelichte afbeelding genereren...");
    const imageBuffer = await generateFeaturedImage(article.topic, article.title);
    const featuredAltText = await generateAltText(article.topic, article.title);

    const slug = article.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const filename = `${slug}-featured.png`;

    const media = await uploadMedia(creds, imageBuffer, filename);
    await updateMedia(creds, media.id, { alt_text: featuredAltText });

    await logStep(supabase, runId, "info", "Uitgelichte afbeelding geüpload", {
      mediaId: media.id,
    });

    // 6. Replace image markers with in-article images
    let htmlContent = article.htmlContent;
    let imagesCount = 1; // Start with 1 for featured image

    for (const marker of article.imageMarkers) {
      try {
        await logStep(supabase, runId, "info", `In-article afbeelding genereren: ${marker.substring(0, 50)}...`);
        const inArticleBuffer = await generateInArticleImage(
          article.topic,
          marker,
          article.htmlContent.substring(0, 500)
        );
        const inArticleAlt = await generateAltText(marker, article.title);
        const inArticleFilename = `${slug}-inline-${imagesCount}.png`;
        const inArticleMedia = await uploadMedia(creds, inArticleBuffer, inArticleFilename);
        await updateMedia(creds, inArticleMedia.id, { alt_text: inArticleAlt });

        htmlContent = htmlContent.replace(
          `<!-- IMAGE:${marker} -->`,
          `<figure class="wp-block-image"><img src="${inArticleMedia.url}" alt="${inArticleAlt}" /><figcaption>${marker}</figcaption></figure>`
        );
        imagesCount++;
      } catch (imgErr) {
        await logStep(supabase, runId, "warn", `In-article afbeelding overgeslagen: ${imgErr instanceof Error ? imgErr.message : "onbekend"}`);
        htmlContent = htmlContent.replace(`<!-- IMAGE:${marker} -->`, "");
      }
    }

    // 7. Replace YouTube markers with embeds
    for (const query of article.youtubeMarkers) {
      try {
        const videos = await searchYouTubeVideos(query);
        const videoHtml = videos.length > 0 ? videos[0].embedHtml : "";
        htmlContent = htmlContent.replace(
          `<!-- YOUTUBE:${query} -->`,
          videoHtml
        );
      } catch {
        htmlContent = htmlContent.replace(`<!-- YOUTUBE:${query} -->`, "");
      }
    }

    // 8. Build Table of Contents
    if (article.tableOfContents.length > 0) {
      const tocHtml = `<nav class="toc-block"><h2>Inhoudsopgave</h2><ul>${article.tableOfContents
        .map(
          (entry) =>
            `<li class="toc-level-${entry.level}"><a href="#${entry.id}">${entry.text}</a></li>`
        )
        .join("")}</ul></nav>`;
      htmlContent = tocHtml + htmlContent;
    }

    // 9. Add schema markup as script tag
    const schemaScript = `<script type="application/ld+json">${JSON.stringify(article.schemaMarkup)}</script>`;
    htmlContent = htmlContent + schemaScript;

    await supabase
      .from("asc_runs")
      .update({ images_count: imagesCount })
      .eq("id", runId);

    // 10. Publish post to WordPress
    await logStep(supabase, runId, "info", "Post publiceren op WordPress...");
    const post = await createPost(creds, {
      title: article.title,
      content: htmlContent,
      excerpt: article.metaDescription,
      featuredMediaId: media.id,
      status: "publish",
    });

    await logStep(supabase, runId, "info", "Post gepubliceerd", {
      postId: post.id,
      postUrl: post.url,
    });

    // 11. Cache the new post in asc_wp_posts
    await supabase.from("asc_wp_posts").upsert(
      {
        user_id: userId,
        site_id: siteId,
        wp_post_id: post.id,
        title: article.title,
        slug,
        url: post.url,
        excerpt: article.metaDescription,
        meta_description: article.metaDescription,
        schema_markup: article.schemaMarkup,
        status: "publish",
        last_synced_at: new Date().toISOString(),
        wp_created_at: new Date().toISOString(),
      },
      { onConflict: "site_id,wp_post_id" }
    );

    // 12. Mark run as published
    await supabase
      .from("asc_runs")
      .update({
        status: "published",
        wp_post_id: String(post.id),
        wp_post_url: post.url,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);

    // 13. Auto-enqueue social media post if enabled
    if (site.social_auto_post && site.social_webhook_url) {
      try {
        const socialCopy = await generateSocialCopy(
          article.title,
          article.metaDescription
        );

        const { data: socialPost } = await supabase
          .from("asc_social_posts")
          .insert({
            user_id: userId,
            site_id: siteId,
            run_id: runId,
            wp_post_url: post.url,
            article_title: article.title,
            copy: socialCopy,
            image_url: media.url,
            webhook_url: site.social_webhook_url,
            status: "pending",
          })
          .select()
          .single();

        if (socialPost) {
          await enqueueSocialPostJob({
            socialPostId: socialPost.id,
            siteId,
            userId,
          });
          await logStep(supabase, runId, "info", "Social media post ingepland");
        }
      } catch (socialErr) {
        await logStep(supabase, runId, "warn", "Social media post overgeslagen: " + (socialErr instanceof Error ? socialErr.message : "onbekend"));
      }
    }

    // 14. Auto-enqueue Google indexing if enabled
    if (site.google_indexing_enabled) {
      try {
        const { data: indexReq } = await supabase
          .from("asc_indexing_requests")
          .insert({
            user_id: userId,
            site_id: siteId,
            run_id: runId,
            url: post.url,
            status: "pending",
          })
          .select()
          .single();

        if (indexReq) {
          await enqueueIndexingJob({
            requestId: indexReq.id,
            siteId,
            userId,
          });
          await logStep(supabase, runId, "info", "Google indexering ingepland");
        }
      } catch (indexErr) {
        await logStep(supabase, runId, "warn", "Google indexering overgeslagen: " + (indexErr instanceof Error ? indexErr.message : "onbekend"));
      }
    }

    await logStep(supabase, runId, "info", "Run succesvol afgerond");

    return NextResponse.json({ success: true, postUrl: post.url });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Onbekende fout";

    await logStep(supabase, runId, "error", `Run mislukt: ${errorMessage}`);

    await supabase
      .from("asc_runs")
      .update({
        status: "failed",
        error_message: errorMessage,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);

    // Return 500 so QStash retries
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
