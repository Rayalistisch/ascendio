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
const MIN_CACHED_POSTS_FOR_LINKING = 10;
const BOOTSTRAP_SYNC_MAX_PAGES = 2;
const BOOTSTRAP_SYNC_TIMEOUT_MS = 4000;
const INLINE_IMAGE_CONCURRENCY = 2;
const MAX_INLINE_IMAGES_PER_RUN = 1;
const WORKER_SOFT_TIMEOUT_MS = 165000;
const MIN_TIME_FOR_INLINE_IMAGES_MS = 60000;
const MIN_TIME_FOR_YOUTUBE_MS = 35000;
const FEATURED_IMAGE_TIMEOUT_MS = 45000;
const FEATURED_ALT_TIMEOUT_MS = 12000;
const INLINE_IMAGE_TIMEOUT_MS = 30000;
const INLINE_ALT_TIMEOUT_MS = 10000;
const YOUTUBE_SEARCH_TIMEOUT_MS = 8000;
const STYLE_REFERENCE_POST_LOOKBACK = 12;
const STYLE_REFERENCE_MAX_ITEMS = 3;
const STYLE_REFERENCE_MAX_CHARS = 900;
const STYLE_REFERENCE_MIN_CHARS = 120;

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateAtWordBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const sliced = text.slice(0, maxChars);
  const breakAt = sliced.lastIndexOf(" ");
  if (breakAt > Math.floor(maxChars * 0.6)) {
    return `${sliced.slice(0, breakAt).trim()}...`;
  }
  return `${sliced.trim()}...`;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const workerStartedAt = Date.now();
  const remainingMs = () => WORKER_SOFT_TIMEOUT_MS - (Date.now() - workerStartedAt);
  const hasTime = (requiredMs: number) => remainingMs() > requiredMs;

  // Verify QStash signature
  const signature = request.headers.get("upstash-signature");
  const valid = await verifyQStashSignature(signature, rawBody);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);
  const { runId, siteId, userId, clusterId, clusterTopicId, templateId } = body;

  if (!runId || !siteId || !userId) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: run } = await supabase
    .from("asc_runs")
    .select("id, site_id, user_id")
    .eq("id", runId)
    .eq("user_id", userId)
    .single();

  if (!run) {
    return NextResponse.json({ error: "Run niet gevonden" }, { status: 404 });
  }

  if (run.site_id !== siteId) {
    return NextResponse.json({ error: "Run/site mismatch" }, { status: 400 });
  }

  // Mark run as running
  await supabase
    .from("asc_runs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("user_id", userId);

  await logStep(supabase, runId, "info", "Run gestart");

  try {
    // 1. Get site credentials
    const { data: site } = await supabase
      .from("asc_sites")
      .select("*")
      .eq("id", siteId)
      .eq("user_id", userId)
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

    // 2. Load cached posts for internal linking (fast path)
    await logStep(supabase, runId, "info", "Interne links laden uit cache...");
    let existingPosts: { slug: string; title: string }[] = [];
    try {
      const { data: cachedPosts } = await supabase
        .from("asc_wp_posts")
        .select("slug, title")
        .eq("site_id", siteId)
        .eq("user_id", userId)
        .eq("status", "publish")
        .order("last_synced_at", { ascending: false })
        .limit(300);

      existingPosts = (cachedPosts ?? [])
        .filter((p) => p.slug && p.title)
        .map((p) => ({ slug: p.slug, title: p.title }));

      await logStep(supabase, runId, "info", `${existingPosts.length} interne link-kandidaten uit cache geladen`);

      // Bootstrap a small sync only when cache is too small.
      if (existingPosts.length < MIN_CACHED_POSTS_FOR_LINKING) {
        await logStep(supabase, runId, "info", "Cache beperkt, beperkte WP sync uitvoeren...");
        const wpPosts = await fetchAllPosts(creds, {
          fields: ["id", "title", "slug", "link", "excerpt", "status", "date", "modified"],
          maxPages: BOOTSTRAP_SYNC_MAX_PAGES,
          timeoutMs: BOOTSTRAP_SYNC_TIMEOUT_MS,
        });

        if (wpPosts.length > 0) {
          existingPosts = wpPosts
            .filter((p) => p.slug)
            .map((p) => ({
              slug: p.slug,
              title: typeof p.title === "object" ? p.title.rendered : p.title,
            }));

          const upsertRows = wpPosts.map((p) => {
            const postTitle = typeof p.title === "object" ? p.title.rendered : p.title;
            const postExcerpt = typeof p.excerpt === "object" ? p.excerpt.rendered : p.excerpt;
            return {
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
            };
          });

          await supabase.from("asc_wp_posts").upsert(upsertRows, {
            onConflict: "site_id,wp_post_id",
          });
          await logStep(supabase, runId, "info", `${wpPosts.length} posts beperkt gesynchroniseerd`);
        }
      }
    } catch (syncErr) {
      await logStep(supabase, runId, "warn", "WP cache/sync overgeslagen: " + (syncErr instanceof Error ? syncErr.message : "onbekend"));
    }

    // 2.5. Load recent published content as writing style references
    let styleReferences: { title: string; textSample: string }[] = [];
    try {
      const { data: recentPosts } = await supabase
        .from("asc_wp_posts")
        .select("title, content, excerpt")
        .eq("site_id", siteId)
        .eq("user_id", userId)
        .eq("status", "publish")
        .order("wp_modified_at", { ascending: false })
        .order("last_synced_at", { ascending: false })
        .limit(STYLE_REFERENCE_POST_LOOKBACK);

      styleReferences = (recentPosts ?? [])
        .map((p) => {
          const rawText = p.content || p.excerpt || "";
          const cleaned = stripHtml(rawText);
          const sample = truncateAtWordBoundary(cleaned, STYLE_REFERENCE_MAX_CHARS);
          return {
            title: p.title || "",
            textSample: sample,
          };
        })
        .filter(
          (sample) =>
            Boolean(sample.title) &&
            sample.textSample.length >= STYLE_REFERENCE_MIN_CHARS
        )
        .slice(0, STYLE_REFERENCE_MAX_ITEMS);

      await logStep(
        supabase,
        runId,
        "info",
        `${styleReferences.length} stijlreferenties geladen uit recente artikelen`
      );
    } catch (styleErr) {
      await logStep(
        supabase,
        runId,
        "warn",
        "Stijlreferenties overgeslagen: " +
          (styleErr instanceof Error ? styleErr.message : "onbekend")
      );
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

    // 3.5. Load template, cluster context, and preferred domains
    let structureTemplate = undefined;
    let clusterContext = undefined;
    let forcedTopic = undefined;
    let forcedTitle = undefined;
    let targetKeywords: string[] | undefined;

    // Load article template
    const effectiveTemplateId = templateId || undefined;
    if (effectiveTemplateId) {
      const { data: template } = await supabase
        .from("asc_article_templates")
        .select("structure")
        .eq("id", effectiveTemplateId)
        .single();
      if (template) {
        structureTemplate = { sections: template.structure };
        await logStep(supabase, runId, "info", "Artikeltemplate geladen");
      }
    } else if (clusterId) {
      // Check if cluster has a template
      const { data: clusterForTemplate } = await supabase
        .from("asc_clusters")
        .select("template_id")
        .eq("id", clusterId)
        .single();
      if (clusterForTemplate?.template_id) {
        const { data: template } = await supabase
          .from("asc_article_templates")
          .select("structure")
          .eq("id", clusterForTemplate.template_id)
          .single();
        if (template) structureTemplate = { sections: template.structure };
      }
    }

    // Load cluster context
    if (clusterId) {
      const { data: cluster } = await supabase
        .from("asc_clusters")
        .select("*")
        .eq("id", clusterId)
        .single();

      if (cluster) {
        const { data: clusterTopics } = await supabase
          .from("asc_cluster_topics")
          .select("*")
          .eq("cluster_id", clusterId);

        const publishedSiblings = (clusterTopics || [])
          .filter((t) => t.wp_post_url && t.id !== clusterTopicId)
          .map((t) => ({
            slug: t.wp_post_url!.split("/").filter(Boolean).pop() || "",
            title: t.title,
            url: t.wp_post_url!,
          }));

        const isPillar = !clusterTopicId;
        const currentTopic = clusterTopicId
          ? clusterTopics?.find((t) => t.id === clusterTopicId)
          : null;

        clusterContext = {
          pillarTopic: cluster.pillar_topic,
          pillarUrl: cluster.pillar_wp_post_url || undefined,
          siblingArticles: publishedSiblings,
          isPillarArticle: isPillar,
        };

        if (currentTopic) {
          forcedTopic = currentTopic.title;
          targetKeywords = currentTopic.target_keywords;
        } else if (isPillar) {
          forcedTopic = cluster.pillar_topic;
          targetKeywords = cluster.pillar_keywords;
        }

        await logStep(supabase, runId, "info", `Cluster context geladen: ${cluster.name}`, {
          isPillar,
          siblings: publishedSiblings.length,
        });
      }
    }

    // Load preferred external domains
    const { data: preferredDomains } = await supabase
      .from("asc_preferred_domains")
      .select("domain, label")
      .eq("site_id", siteId)
      .order("priority", { ascending: false });

    // 4. Generate enhanced article
    await logStep(supabase, runId, "info", "Artikel genereren via OpenAI...");
    const article = await generateEnhancedArticle({
      niche: site.name,
      language,
      sourceContent,
      sourceTitle,
      existingPosts,
      styleReferences,
      siteBaseUrl: site.wp_base_url.replace(/\/+$/, ""),
      structureTemplate,
      clusterContext,
      preferredDomains: preferredDomains?.map((d) => ({ domain: d.domain, label: d.label })),
      forcedTopic,
      forcedTitle,
      targetKeywords,
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
      .eq("id", runId)
      .eq("user_id", userId);

    await logStep(supabase, runId, "info", "Artikel gegenereerd", {
      title: article.title,
      internalLinks: article.internalLinksUsed.length,
      externalLinks: article.externalLinksUsed.length,
      faqItems: article.faqItems.length,
    });

    // 5. Generate featured image
    const slug = article.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const filename = `${slug}-featured.png`;
    let media: { id: number; url: string } | null = null;

    if (hasTime(MIN_TIME_FOR_INLINE_IMAGES_MS)) {
      try {
        await logStep(supabase, runId, "info", "Uitgelichte afbeelding genereren...");
        const [imageBuffer, featuredAltText] = await Promise.all([
          withTimeout(
            generateFeaturedImage(article.topic, article.title),
            FEATURED_IMAGE_TIMEOUT_MS,
            "Featured image generation"
          ),
          withTimeout(
            generateAltText(article.topic, article.title),
            FEATURED_ALT_TIMEOUT_MS,
            "Featured image alt text"
          ),
        ]);
        media = await uploadMedia(creds, imageBuffer, filename);
        await updateMedia(creds, media.id, { alt_text: featuredAltText });
        await logStep(supabase, runId, "info", "Uitgelichte afbeelding geüpload", {
          mediaId: media.id,
        });
      } catch (featuredErr) {
        await logStep(
          supabase,
          runId,
          "warn",
          "Uitgelichte afbeelding overgeslagen: " +
            (featuredErr instanceof Error ? featuredErr.message : "onbekend")
        );
      }
    } else {
      await logStep(supabase, runId, "warn", "Uitgelichte afbeelding overgeslagen wegens tijdslimiet");
    }

    // 6. Replace image markers with in-article images
    let htmlContent = article.htmlContent;
    let imagesCount = media ? 1 : 0;
    const imageResults: Array<{ marker: string; html: string }> = [];
    const markersToProcess = hasTime(MIN_TIME_FOR_INLINE_IMAGES_MS)
      ? article.imageMarkers.slice(0, MAX_INLINE_IMAGES_PER_RUN)
      : [];

    if (article.imageMarkers.length > markersToProcess.length) {
      await logStep(
        supabase,
        runId,
        "warn",
        `In-article afbeeldingen beperkt naar ${markersToProcess.length} wegens tijdslimiet`
      );
    }

    for (let i = 0; i < markersToProcess.length; i += INLINE_IMAGE_CONCURRENCY) {
      if (!hasTime(MIN_TIME_FOR_YOUTUBE_MS)) {
        await logStep(supabase, runId, "warn", "In-article afbeeldingen vroegtijdig gestopt wegens tijdslimiet");
        break;
      }
      const batch = markersToProcess.slice(i, i + INLINE_IMAGE_CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async (marker, idx) => {
          const markerIndex = i + idx + 1;
          try {
            await logStep(supabase, runId, "info", `In-article afbeelding genereren: ${marker.substring(0, 50)}...`);
            const [inArticleBuffer, inArticleAlt] = await Promise.all([
              withTimeout(
                generateInArticleImage(
                  article.topic,
                  marker,
                  article.htmlContent.substring(0, 500)
                ),
                INLINE_IMAGE_TIMEOUT_MS,
                "Inline image generation"
              ),
              withTimeout(
                generateAltText(marker, article.title),
                INLINE_ALT_TIMEOUT_MS,
                "Inline image alt text"
              ),
            ]);
            const inArticleFilename = `${slug}-inline-${markerIndex}.png`;
            const inArticleMedia = await uploadMedia(creds, inArticleBuffer, inArticleFilename);
            await updateMedia(creds, inArticleMedia.id, { alt_text: inArticleAlt });

            return {
              marker,
              html: `<figure class="wp-block-image"><img src="${inArticleMedia.url}" alt="${inArticleAlt}" /><figcaption>${marker}</figcaption></figure>`,
            };
          } catch (imgErr) {
            await logStep(supabase, runId, "warn", `In-article afbeelding overgeslagen: ${imgErr instanceof Error ? imgErr.message : "onbekend"}`);
            return {
              marker,
              html: "",
            };
          }
        })
      );

      imageResults.push(...batchResults);
    }

    for (const result of imageResults) {
      htmlContent = htmlContent.replace(`<!-- IMAGE:${result.marker} -->`, result.html);
    }
    for (const marker of article.imageMarkers) {
      if (!imageResults.some((result) => result.marker === marker)) {
        htmlContent = htmlContent.replace(`<!-- IMAGE:${marker} -->`, "");
      }
    }

    imagesCount += imageResults.filter((r) => r.html).length;

    // 7. Replace YouTube markers with embeds
    if (hasTime(MIN_TIME_FOR_YOUTUBE_MS)) {
      for (const query of article.youtubeMarkers) {
        try {
          const videos = await withTimeout(
            searchYouTubeVideos(query),
            YOUTUBE_SEARCH_TIMEOUT_MS,
            "YouTube lookup"
          );
          const videoHtml = videos.length > 0 ? videos[0].embedHtml : "";
          htmlContent = htmlContent.replace(
            `<!-- YOUTUBE:${query} -->`,
            videoHtml
          );
        } catch {
          htmlContent = htmlContent.replace(`<!-- YOUTUBE:${query} -->`, "");
        }
      }
    } else {
      await logStep(supabase, runId, "warn", "YouTube embeds overgeslagen wegens tijdslimiet");
      for (const query of article.youtubeMarkers) {
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
      .eq("id", runId)
      .eq("user_id", userId);

    // 10. Publish post to WordPress
    await logStep(supabase, runId, "info", "Post publiceren op WordPress...");
    const post = await createPost(creds, {
      title: article.title,
      content: htmlContent,
      excerpt: article.metaDescription,
      featuredMediaId: media?.id,
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
        content: htmlContent,
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
      .eq("id", runId)
      .eq("user_id", userId);

    // 12.5. Update cluster topic status if applicable
    if (clusterTopicId) {
      await supabase
        .from("asc_cluster_topics")
        .update({
          status: "published",
          wp_post_id: post.id,
          wp_post_url: post.url,
          run_id: runId,
        })
        .eq("id", clusterTopicId);
      await logStep(supabase, runId, "info", "Cluster topic bijgewerkt naar published");
    }
    if (clusterId && !clusterTopicId) {
      // This was a pillar article generation
      await supabase
        .from("asc_clusters")
        .update({
          pillar_wp_post_id: post.id,
          pillar_wp_post_url: post.url,
          pillar_run_id: runId,
        })
        .eq("id", clusterId);
      await logStep(supabase, runId, "info", "Cluster pillar bijgewerkt");
    }

    // Check if all cluster topics are published → mark cluster as complete
    if (clusterId) {
      const { data: remainingTopics } = await supabase
        .from("asc_cluster_topics")
        .select("id")
        .eq("cluster_id", clusterId)
        .neq("status", "published");
      if (remainingTopics && remainingTopics.length === 0) {
        await supabase
          .from("asc_clusters")
          .update({ status: "complete", updated_at: new Date().toISOString() })
          .eq("id", clusterId);
      }
    }

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
            image_url: media?.url || null,
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

    if (clusterTopicId) {
      await supabase
        .from("asc_cluster_topics")
        .update({ status: "failed" })
        .eq("id", clusterTopicId);
    }

    await supabase
      .from("asc_runs")
      .update({
        status: "failed",
        error_message: errorMessage,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId)
      .eq("user_id", userId);

    // Return 500 so QStash retries
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
