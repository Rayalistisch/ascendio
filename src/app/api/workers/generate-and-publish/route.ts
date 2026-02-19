import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";
import {
  generateEnhancedArticle,
  humanizeArticleDraft,
  generateFeaturedImage,
  generateInArticleImage,
  generateAltText,
  generateSocialCopy,
} from "@/lib/openai";
import {
  uploadMedia,
  createPost,
  createPage,
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
import { checkCredits, deductCredits, CREDIT_COSTS } from "@/lib/credits";
import {
  stripHtmlToPlainText,
  findTopSimilarityMatches,
  type SimilarityCandidate,
} from "@/lib/content-uniqueness";
import {
  findExternalPlagiarismMatches,
  type ExternalPlagiarismMatch,
} from "@/lib/external-plagiarism";
import {
  normalizeGenerationSettings,
  type GenerationSettings,
} from "@/lib/generation-settings";

export const maxDuration = 300; // 5 min for Vercel Pro
const MIN_CACHED_POSTS_FOR_LINKING = 10;
const BOOTSTRAP_SYNC_MAX_PAGES = 2;
const BOOTSTRAP_SYNC_TIMEOUT_MS = 4000;
const INLINE_IMAGE_CONCURRENCY = 2;
const MAX_INLINE_IMAGES_PER_RUN_CAP = 3;
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
const UNIQUENESS_REFERENCE_MAX_ITEMS = 18;
const UNIQUENESS_REFERENCE_MIN_CHARS = 220;
const MIN_TIME_FOR_DUPLICATE_GUARD_MS = 25000;
const DUPLICATE_GUARD_ENABLED =
  (process.env.CONTENT_DUPLICATE_GUARD || "true").toLowerCase() !== "false";
const DUPLICATE_EXTERNAL_CHECK_ENABLED =
  (process.env.CONTENT_DUPLICATE_EXTERNAL_CHECK || "true").toLowerCase() !== "false";
const HUMANIZER_MODE = (process.env.CONTENT_HUMANIZER_MODE || "auto").toLowerCase();

function parseNumericEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const DUPLICATE_HUMANIZER_TRIGGER_SCORE = parseNumericEnv(
  "CONTENT_DUPLICATE_HUMANIZER_TRIGGER_SCORE",
  55
);
const DUPLICATE_INTERNAL_BLOCK_SCORE = parseNumericEnv(
  "CONTENT_DUPLICATE_INTERNAL_BLOCK_SCORE",
  70
);
const DUPLICATE_EXTERNAL_BLOCK_SCORE = parseNumericEnv(
  "CONTENT_DUPLICATE_EXTERNAL_BLOCK_SCORE",
  72
);
const MAX_HUMANIZER_ATTEMPTS = Math.max(
  0,
  Math.floor(parseNumericEnv("CONTENT_HUMANIZER_MAX_ATTEMPTS", 2))
);

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

function sanitizeYouTubeMarker(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function canonicalizeYouTubeMarkers(html: string): string {
  return html.replace(/<!--\s*YOUTUBE:([\s\S]*?)-->/gi, (_match, rawMarker) => {
    const marker = sanitizeYouTubeMarker(String(rawMarker || ""));
    return marker ? `<!-- YOUTUBE:${marker} -->` : "";
  });
}

function extractYouTubeMarkers(html: string): string[] {
  const matches = html.matchAll(/<!--\s*YOUTUBE:([\s\S]*?)-->/gi);
  const seen = new Set<string>();
  const markers: string[] = [];
  for (const match of matches) {
    const marker = sanitizeYouTubeMarker(match[1] || "");
    if (!marker) continue;
    const key = marker.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    markers.push(marker);
  }
  return markers;
}

function deriveFallbackYouTubeMarkers(
  html: string,
  title: string,
  targetCount: number
): string[] {
  const headings = Array.from(html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi))
    .map((match) => sanitizeYouTubeMarker(stripHtml(match[1] || "")))
    .filter(Boolean);

  const derived: string[] = [];
  const seen = new Set<string>();

  for (const heading of headings) {
    const query = `${heading} uitleg`;
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    derived.push(query);
    if (derived.length >= targetCount) return derived;
  }

  for (let i = derived.length; i < targetCount; i += 1) {
    derived.push(`${sanitizeYouTubeMarker(title)} uitleg ${i + 1}`);
  }

  return derived;
}

function injectYouTubeMarkersAfterH2(html: string, markers: string[]): string {
  if (markers.length === 0) return html;
  let index = 0;
  const withInjections = html.replace(/(<h2[^>]*>[\s\S]*?<\/h2>)/gi, (match) => {
    if (index >= markers.length) return match;
    const marker = markers[index];
    index += 1;
    return `${match}\n<!-- YOUTUBE:${marker} -->`;
  });

  if (index < markers.length) {
    return `${withInjections}\n${markers
      .slice(index)
      .map((marker) => `<!-- YOUTUBE:${marker} -->`)
      .join("\n")}`;
  }

  return withInjections;
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
  const {
    runId,
    siteId,
    userId,
    clusterId,
    clusterTopicId,
    templateId,
    contentType,
    generationSettings,
  } = body;

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

  const payloadSettingsForPrecheck = generationSettings
    ? normalizeGenerationSettings(generationSettings)
    : null;
  const requestedInlineImagesForPrecheck = payloadSettingsForPrecheck
    ? Math.min(
        MAX_INLINE_IMAGES_PER_RUN_CAP,
        payloadSettingsForPrecheck.images.inlineImageCount
      )
    : MAX_INLINE_IMAGES_PER_RUN_CAP;
  const precheckCost =
    CREDIT_COSTS.blog_post_with_images +
    requestedInlineImagesForPrecheck * CREDIT_COSTS.inline_image_generation;

  // Credit pre-check (worst-case for this run including inline images)
  const creditCheck = await checkCredits(supabase, userId, precheckCost);
  if (!creditCheck.enough) {
    await supabase.from("asc_runs").update({
      status: "failed",
      error_message: "Onvoldoende credits",
      finished_at: new Date().toISOString(),
    }).eq("id", runId).eq("user_id", userId);
    return NextResponse.json(
      {
        error: "Onvoldoende credits",
        required: precheckCost,
        remaining: creditCheck.remaining,
      },
      { status: 402 }
    );
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

    // 2.1. Load sitemap URLs for enriching article generation
    let sitemapUrls: Array<{ url: string; title?: string }> = [];
    try {
      const { data: sitemapData } = await supabase
        .from("asc_sitemap_urls")
        .select("url, title")
        .eq("site_id", siteId)
        .order("scraped_at", { ascending: false })
        .limit(50);
      sitemapUrls = (sitemapData ?? []).filter((s) => s.url);
    } catch {
      // Sitemap data is best-effort
    }

    // 2.5. Load recent published content as writing style references + uniqueness references
    let styleReferences: { title: string; textSample: string }[] = [];
    let uniquenessReferences: SimilarityCandidate[] = [];
    try {
      const { data: recentPosts } = await supabase
        .from("asc_wp_posts")
        .select("title, content, excerpt, url")
        .eq("site_id", siteId)
        .eq("user_id", userId)
        .eq("status", "publish")
        .order("wp_modified_at", { ascending: false })
        .order("last_synced_at", { ascending: false })
        .limit(Math.max(STYLE_REFERENCE_POST_LOOKBACK, UNIQUENESS_REFERENCE_MAX_ITEMS));

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

      uniquenessReferences = (recentPosts ?? [])
        .map((p) => {
          const rawText = p.content || p.excerpt || "";
          const cleaned = stripHtmlToPlainText(String(rawText || ""));
          return {
            title: String(p.title || ""),
            url: String(p.url || ""),
            text: cleaned,
          };
        })
        .filter(
          (item) =>
            Boolean(item.title) &&
            item.text.length >= UNIQUENESS_REFERENCE_MIN_CHARS
        )
        .slice(0, UNIQUENESS_REFERENCE_MAX_ITEMS);

      await logStep(
        supabase,
        runId,
        "info",
        `${styleReferences.length} stijlreferenties geladen uit recente artikelen`
      );
      if (uniquenessReferences.length > 0) {
        await logStep(
          supabase,
          runId,
          "info",
          `${uniquenessReferences.length} unieke contentreferenties geladen`
        );
      }
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
    const payloadGenerationSettings: GenerationSettings | null = generationSettings
      ? normalizeGenerationSettings(generationSettings)
      : null;
    let runGenerationSettings: GenerationSettings =
      payloadGenerationSettings || normalizeGenerationSettings(undefined);

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
        if (!payloadGenerationSettings) {
          runGenerationSettings = normalizeGenerationSettings(
            cluster.generation_settings
          );
        }

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

    const mergedKeywords = Array.from(
      new Set(
        [
          ...(targetKeywords || []),
          ...runGenerationSettings.details.includeKeywords,
          runGenerationSettings.details.focusKeyword || "",
        ]
          .map((keyword) => keyword.trim())
          .filter(Boolean)
      )
    ).slice(0, 15);
    targetKeywords = mergedKeywords.length > 0 ? mergedKeywords : undefined;

    if (!forcedTopic && runGenerationSettings.details.focusKeyword) {
      forcedTopic = runGenerationSettings.details.focusKeyword;
    }

    if (runGenerationSettings.knowledge.mode === "no_extra") {
      sourceContent = undefined;
      sourceTitle = undefined;
      await logStep(
        supabase,
        runId,
        "info",
        "Knowledge mode: no_extra (externe broncontent uitgeschakeld)"
      );
    }

    // Load preferred external domains
    const { data: preferredDomains } = await supabase
      .from("asc_preferred_domains")
      .select("domain, label")
      .eq("site_id", siteId)
      .order("priority", { ascending: false });

    // 4. Generate enhanced article
    await logStep(supabase, runId, "info", "Artikel genereren via OpenAI...");
    let article = await generateEnhancedArticle({
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
      existingSitemapUrls: sitemapUrls.length > 0 ? sitemapUrls : undefined,
      toneOfVoice: site.tone_of_voice ?? null,
      generationSettings: runGenerationSettings,
    });

    const runUniquenessGuard = async (
      candidateHtml: string
    ): Promise<{
      topInternalScore: number;
      internalMatches: ReturnType<typeof findTopSimilarityMatches>;
      topExternalScore: number;
      externalMatches: ExternalPlagiarismMatch[];
    }> => {
      if (!DUPLICATE_GUARD_ENABLED || uniquenessReferences.length === 0) {
        return {
          topInternalScore: 0,
          internalMatches: [],
          topExternalScore: 0,
          externalMatches: [],
        };
      }

      const plainText = stripHtmlToPlainText(candidateHtml);
      const internalMatches = findTopSimilarityMatches(
        plainText,
        uniquenessReferences,
        1,
        3
      );
      const topInternalScore = internalMatches[0]?.score || 0;

      let externalMatches: ExternalPlagiarismMatch[] = [];
      if (
        DUPLICATE_EXTERNAL_CHECK_ENABLED &&
        plainText.length >= UNIQUENESS_REFERENCE_MIN_CHARS &&
        hasTime(MIN_TIME_FOR_DUPLICATE_GUARD_MS)
      ) {
        try {
          const map = await findExternalPlagiarismMatches([
            {
              id: 1,
              pageUrl: site.wp_base_url,
              title: article.title,
              textContent: plainText,
            },
          ]);
          externalMatches = map.get(1) || [];
        } catch {
          externalMatches = [];
        }
      }
      const topExternalScore = externalMatches[0]?.score || 0;

      return {
        topInternalScore,
        internalMatches,
        topExternalScore,
        externalMatches,
      };
    };

    let uniquenessCheck = await runUniquenessGuard(article.htmlContent);
    if (DUPLICATE_GUARD_ENABLED && uniquenessReferences.length > 0) {
      await logStep(supabase, runId, "info", "Duplicate guard score berekend", {
        internalScore: uniquenessCheck.topInternalScore,
        externalScore: uniquenessCheck.topExternalScore,
      });
    }

    const humanizerEnabled = HUMANIZER_MODE !== "off";
    const shouldTriggerHumanizer =
      humanizerEnabled &&
      (uniquenessCheck.topInternalScore >= DUPLICATE_HUMANIZER_TRIGGER_SCORE ||
        uniquenessCheck.topExternalScore >= DUPLICATE_HUMANIZER_TRIGGER_SCORE);

    if (shouldTriggerHumanizer && MAX_HUMANIZER_ATTEMPTS > 0) {
      for (let attempt = 1; attempt <= MAX_HUMANIZER_ATTEMPTS; attempt++) {
        await logStep(
          supabase,
          runId,
          "warn",
          `Humanizer pass ${attempt}/${MAX_HUMANIZER_ATTEMPTS} gestart vanwege overlap-risico`
        );

        const overlapSnippets = [
          ...uniquenessCheck.internalMatches.map((m) => m.snippet),
          ...uniquenessCheck.externalMatches.map((m) =>
            (m.sourceSnippet || "").replace(/\s+/g, " ").trim()
          ),
        ].filter(Boolean);

        const humanizedDraft = await humanizeArticleDraft({
          language,
          topic: article.topic,
          title: article.title,
          targetKeywords,
          draft: {
            metaDescription: article.metaDescription,
            htmlContent: article.htmlContent,
            tableOfContents: article.tableOfContents,
            internalLinksUsed: article.internalLinksUsed,
            externalLinksUsed: article.externalLinksUsed,
            faqItems: article.faqItems,
            imageMarkers: article.imageMarkers,
            youtubeMarkers: article.youtubeMarkers,
          },
          avoidOverlapSnippets: overlapSnippets,
          toneOfVoice: site.tone_of_voice ?? null,
          mode: HUMANIZER_MODE === "aggressive" ? "aggressive" : "auto",
        });

        article = {
          ...article,
          ...humanizedDraft,
          internalLinksUsed: Array.from(new Set(humanizedDraft.internalLinksUsed)),
          externalLinksUsed: Array.from(new Set(humanizedDraft.externalLinksUsed)),
        };

        uniquenessCheck = await runUniquenessGuard(article.htmlContent);
        await logStep(supabase, runId, "info", "Humanizer pass afgerond", {
          attempt,
          internalScore: uniquenessCheck.topInternalScore,
          externalScore: uniquenessCheck.topExternalScore,
        });

        const stillHigh =
          uniquenessCheck.topInternalScore >= DUPLICATE_HUMANIZER_TRIGGER_SCORE ||
          uniquenessCheck.topExternalScore >= DUPLICATE_HUMANIZER_TRIGGER_SCORE;
        if (!stillHigh) break;
      }
    }

    if (
      DUPLICATE_GUARD_ENABLED &&
      (uniquenessCheck.topInternalScore >= DUPLICATE_INTERNAL_BLOCK_SCORE ||
        uniquenessCheck.topExternalScore >= DUPLICATE_EXTERNAL_BLOCK_SCORE)
    ) {
      const internal = uniquenessCheck.internalMatches[0];
      const external = uniquenessCheck.externalMatches[0];
      const reasonParts: string[] = [];
      if (uniquenessCheck.topInternalScore >= DUPLICATE_INTERNAL_BLOCK_SCORE && internal) {
        reasonParts.push(
          `interne overlap ${uniquenessCheck.topInternalScore}% met "${internal.title}"`
        );
      }
      if (uniquenessCheck.topExternalScore >= DUPLICATE_EXTERNAL_BLOCK_SCORE && external) {
        reasonParts.push(
          `externe overlap ${uniquenessCheck.topExternalScore}% met ${external.sourceUrl}`
        );
      }
      const reason = reasonParts.join(" + ") || "onvoldoende uniek";
      throw new Error(`Publish geblokkeerd: duplicate-content risico te hoog (${reason})`);
    }

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

    const featuredImageEnabled = runGenerationSettings.images.featuredEnabled;
    const maxInlineImagesRequested = Math.min(
      MAX_INLINE_IMAGES_PER_RUN_CAP,
      runGenerationSettings.images.inlineImageCount
    );
    const youtubeEnabled = runGenerationSettings.images.youtubeEnabled;
    const maxYoutubeEmbedsRequested = Math.min(
      3,
      runGenerationSettings.images.youtubeCount
    );

    // 5. Generate featured image
    const slug = article.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const filename = `${slug}-featured.png`;
    let media: { id: number; url: string } | null = null;

    if (featuredImageEnabled && hasTime(MIN_TIME_FOR_INLINE_IMAGES_MS)) {
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
    } else if (!featuredImageEnabled) {
      await logStep(
        supabase,
        runId,
        "info",
        "Uitgelichte afbeelding overgeslagen volgens generation settings"
      );
    } else {
      await logStep(supabase, runId, "warn", "Uitgelichte afbeelding overgeslagen wegens tijdslimiet");
    }

    // 6. Replace image markers with in-article images
    let htmlContent = article.htmlContent;
    let imagesCount = media ? 1 : 0;
    const imageResults: Array<{ marker: string; html: string }> = [];
    const markersToProcess = hasTime(MIN_TIME_FOR_INLINE_IMAGES_MS)
      ? article.imageMarkers.slice(0, maxInlineImagesRequested)
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

    const inlineImagesGenerated = imageResults.filter((r) => r.html).length;
    imagesCount += inlineImagesGenerated;

    // 7. Replace YouTube markers with embeds
    htmlContent = canonicalizeYouTubeMarkers(htmlContent);
    let allYoutubeMarkers = extractYouTubeMarkers(htmlContent);
    if (youtubeEnabled && allYoutubeMarkers.length === 0 && maxYoutubeEmbedsRequested > 0) {
      allYoutubeMarkers = deriveFallbackYouTubeMarkers(
        htmlContent,
        article.title,
        maxYoutubeEmbedsRequested
      );
      htmlContent = injectYouTubeMarkersAfterH2(htmlContent, allYoutubeMarkers);
    }

    const youtubeMarkersToProcess = youtubeEnabled
      ? allYoutubeMarkers.slice(0, maxYoutubeEmbedsRequested)
      : [];

    if (youtubeEnabled && hasTime(MIN_TIME_FOR_YOUTUBE_MS)) {
      for (const query of youtubeMarkersToProcess) {
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
      for (const query of allYoutubeMarkers) {
        if (!youtubeMarkersToProcess.includes(query)) {
          htmlContent = htmlContent.replace(`<!-- YOUTUBE:${query} -->`, "");
        }
      }
    } else if (!youtubeEnabled) {
      await logStep(
        supabase,
        runId,
        "info",
        "YouTube embeds overgeslagen volgens generation settings"
      );
      for (const query of allYoutubeMarkers) {
        htmlContent = htmlContent.replace(`<!-- YOUTUBE:${query} -->`, "");
      }
    } else {
      await logStep(supabase, runId, "warn", "YouTube embeds overgeslagen wegens tijdslimiet");
      for (const query of allYoutubeMarkers) {
        htmlContent = htmlContent.replace(`<!-- YOUTUBE:${query} -->`, "");
      }
    }

    htmlContent = htmlContent.replace(/<!--\s*YOUTUBE:[\s\S]*?-->/gi, "");

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

    // 10. Publish to WordPress (post or page depending on content type)
    const effectiveContentType = contentType || "posts";
    let post: { id: number; url: string };

    if (effectiveContentType === "pages") {
      let parentPageId: number | undefined;

      if (clusterTopicId && clusterId) {
        // Child page — look up the pillar page as parent
        const { data: parentCluster } = await supabase
          .from("asc_clusters")
          .select("pillar_wp_post_id")
          .eq("id", clusterId)
          .single();

        if (parentCluster?.pillar_wp_post_id) {
          parentPageId = parentCluster.pillar_wp_post_id;
        } else {
          // Parent pillar not yet published — throw so QStash retries
          throw new Error("Parent pillar pagina is nog niet gepubliceerd. Wordt opnieuw geprobeerd.");
        }
      }

      await logStep(supabase, runId, "info", "Pagina publiceren op WordPress...");
      post = await createPage(creds, {
        title: article.title,
        content: htmlContent,
        excerpt: article.metaDescription,
        featuredMediaId: media?.id,
        status: "publish",
        parent: parentPageId,
        slug,
      });
      await logStep(supabase, runId, "info", "Pagina gepubliceerd", {
        postId: post.id,
        postUrl: post.url,
        parentId: parentPageId,
      });
    } else {
      await logStep(supabase, runId, "info", "Post publiceren op WordPress...");
      post = await createPost(creds, {
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
    }

    // 10.5. Deduct credits based on actual image usage
    const creditAction = imagesCount > 0 ? "blog_post_with_images" : "blog_post_no_images" as const;
    const creditResult = await deductCredits(supabase, userId, creditAction, runId);
    if (!creditResult.success) {
      await logStep(supabase, runId, "warn", "Credits konden niet worden afgeschreven");
    } else {
      await logStep(supabase, runId, "info", `${CREDIT_COSTS[creditAction]} credits afgeschreven`);
      for (let i = 0; i < inlineImagesGenerated; i += 1) {
        const inlineCreditResult = await deductCredits(
          supabase,
          userId,
          "inline_image_generation",
          `${runId}:inline:${i + 1}`
        );
        if (!inlineCreditResult.success) {
          await logStep(
            supabase,
            runId,
            "warn",
            "Inline afbeelding credits konden niet worden afgeschreven"
          );
          break;
        }
      }
      if (inlineImagesGenerated > 0) {
        await logStep(
          supabase,
          runId,
          "info",
          `${inlineImagesGenerated * CREDIT_COSTS.inline_image_generation} extra credits afgeschreven voor ${inlineImagesGenerated} inline afbeeldingen`
        );
      }
    }

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
