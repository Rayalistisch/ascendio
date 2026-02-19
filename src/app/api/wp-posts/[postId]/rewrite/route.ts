import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  rewriteContentWithPrompt,
  generateInArticleImage,
  generateAltText,
  humanizeArticleDraft,
} from "@/lib/openai";
import { checkCredits, deductCredits, CREDIT_COSTS } from "@/lib/credits";
import { normalizeGenerationSettings } from "@/lib/generation-settings";
import { uploadMedia, updateMedia } from "@/lib/wordpress";
import { decrypt } from "@/lib/encryption";
import { searchYouTubeVideos } from "@/lib/youtube";

interface SiteRecord {
  tone_of_voice?: unknown;
  wp_base_url?: string;
  wp_username?: string;
  wp_app_password_encrypted?: string;
}

const HUMANIZER_MODE = (process.env.CONTENT_HUMANIZER_MODE || "auto").toLowerCase();
const HUMANIZER_MAX_PASSES = Number.parseInt(
  process.env.CONTENT_HUMANIZER_MAX_ATTEMPTS || "1",
  10
);
const AI_CLICHE_PATTERNS = [
  /\bin de wereld van\b/i,
  /\bin (dit|deze) (artikel|blog|gids)\b/i,
  /\blaten we (eens )?(kijken|duiken)\b/i,
  /\bin het huidige (digitale )?landschap\b/i,
  /\bde sleutel tot\b/i,
  /\bhet is (belangrijk|essentieel) om te\b/i,
  /\bof je nu\b/i,
  /\bduik(en)? (dieper )?in\b/i,
];

function sanitizeMarker(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
}

function canonicalizeImageMarkers(html: string): string {
  return html.replace(/<!--\s*IMAGE:([\s\S]*?)-->/gi, (_match, rawMarker) => {
    const marker = sanitizeMarker(String(rawMarker || ""));
    return marker ? `<!-- IMAGE:${marker} -->` : "";
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

function extractImageMarkers(html: string): string[] {
  const matches = html.matchAll(/<!--\s*IMAGE:([\s\S]*?)-->/gi);
  const seen = new Set<string>();
  const markers: string[] = [];
  for (const match of matches) {
    const marker = sanitizeMarker(match[1] || "");
    if (!marker) continue;
    const key = marker.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    markers.push(marker);
  }
  return markers;
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

function detectAiClicheHits(text: string): number {
  return AI_CLICHE_PATTERNS.reduce(
    (count, pattern) => count + (pattern.test(text) ? 1 : 0),
    0
  );
}

function stripTags(input: string): string {
  return input.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function toSentenceCase(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return text;
  const lower = compact.toLowerCase();
  return lower.replace(/[a-zA-ZÀ-ÖØ-öø-ÿ]/, (char) => char.toUpperCase());
}

function normalizeHeadingSentenceCase(html: string): string {
  return html.replace(
    /<(h[23])([^>]*)>([\s\S]*?)<\/\1>/gi,
    (_match, tag, attrs, inner) => {
      const parts = String(inner).split(/(<[^>]+>)/g);
      const normalized = parts
        .map((part) => {
          if (!part || part.startsWith("<")) return part;
          return toSentenceCase(part);
        })
        .join("");
      return `<${String(tag)}${String(attrs)}>${normalized}</${String(tag)}>`;
    }
  );
}

function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function deriveFallbackMarkers(
  html: string,
  title: string,
  targetCount: number
): string[] {
  const headings = Array.from(html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi))
    .map((match) => sanitizeMarker(stripTags(match[1] || "")))
    .filter(Boolean);

  const derived: string[] = [];
  const seen = new Set<string>();

  for (const heading of headings) {
    const key = heading.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    derived.push(heading);
    if (derived.length >= targetCount) return derived;
  }

  for (let i = derived.length; i < targetCount; i += 1) {
    derived.push(`Visual: ${sanitizeMarker(title)} ${i + 1}`);
  }

  return derived;
}

function deriveFallbackYouTubeMarkers(
  html: string,
  title: string,
  targetCount: number
): string[] {
  const headings = Array.from(html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi))
    .map((match) => sanitizeYouTubeMarker(stripTags(match[1] || "")))
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

function injectImageMarkersAfterH2(html: string, markers: string[]): string {
  if (markers.length === 0) return html;
  let index = 0;
  const withInjections = html.replace(/(<h2[^>]*>[\s\S]*?<\/h2>)/gi, (match) => {
    if (index >= markers.length) return match;
    const marker = markers[index];
    index += 1;
    return `${match}\n<!-- IMAGE:${marker} -->`;
  });

  if (index < markers.length) {
    return `${withInjections}\n${markers
      .slice(index)
      .map((marker) => `<!-- IMAGE:${marker} -->`)
      .join("\n")}`;
  }

  return withInjections;
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

async function buildInlineImageHtml(
  topic: string,
  title: string,
  articleContext: string,
  marker: string,
  slug: string,
  markerIndex: number,
  focusKeyword: string | null,
  creds: { baseUrl: string; username: string; appPassword: string }
): Promise<string> {
  const [buffer, generatedAlt] = await Promise.all([
    generateInArticleImage(topic, marker, articleContext),
    generateAltText(marker, title),
  ]);
  let altText = generatedAlt.trim();
  if (focusKeyword) {
    const lowerAlt = altText.toLowerCase();
    const lowerKeyword = focusKeyword.toLowerCase();
    if (!lowerAlt.includes(lowerKeyword)) {
      altText = altText
        ? `${altText} - ${focusKeyword}`
        : `${focusKeyword} visual`;
    }
  }
  const filename = `${slug}-inline-${markerIndex + 1}.png`;
  const media = await uploadMedia(creds, buffer, filename);
  try {
    await updateMedia(creds, media.id, { alt_text: altText });
  } catch {
    // Best effort: image is still usable if alt metadata update fails.
  }
  const safeAlt = escapeHtmlAttr(altText);
  return `<figure class="wp-block-image"><img src="${media.url}" alt="${safeAlt}" loading="lazy" decoding="async" /><figcaption>${marker}</figcaption></figure>`;
}

function addRelatedLinksSection(
  html: string,
  links: Array<{ title: string; href: string }>
): string {
  if (links.length === 0) return html;
  const listItems = links
    .map((link) => `<li><a href="${link.href}">${link.title}</a></li>`)
    .join("");
  return `${html}\n<h2 id="gerelateerde-paginas">Gerelateerde pagina's</h2><ul>${listItems}</ul>`;
}

function countInternalLinks(html: string, siteBaseUrl?: string): number {
  const hrefs = Array.from(html.matchAll(/<a\b[^>]*\bhref=(["'])(.*?)\1/gi)).map(
    (match) => (match[2] || "").trim()
  );
  return hrefs.filter((href) => {
    if (!href) return false;
    if (href.startsWith("/") && !href.startsWith("//")) return true;
    if (!siteBaseUrl) return false;
    try {
      return new URL(href).host === new URL(siteBaseUrl).host;
    } catch {
      return false;
    }
  }).length;
}

function ensureMetaDescription(
  current: string,
  focusKeyword: string | null,
  title: string
): string {
  let next = current.replace(/\s+/g, " ").trim();
  if (!next) {
    const topic = focusKeyword || title;
    next = `${topic}: praktische uitleg, voorbeelden en tips om direct betere SEO-resultaten te behalen.`;
  }
  if (focusKeyword && !next.toLowerCase().includes(focusKeyword.toLowerCase())) {
    next = `${focusKeyword}: ${next}`;
  }
  if (next.length < 140) {
    next = `${next} Inclusief concrete stappen, interne links en direct toepasbare aanbevelingen.`;
  }
  if (next.length > 150) {
    next = `${next.slice(0, 147).trimEnd()}...`;
  }
  return next;
}

function ensureKeywordMentions(html: string, keywords: string[]): string {
  if (keywords.length === 0) return html;
  const plain = stripTags(html).toLowerCase();
  const missing = keywords
    .filter((keyword) => !plain.includes(keyword.toLowerCase()))
    .slice(0, 3);
  if (missing.length === 0) return html;
  return `${html}\n<p><strong>Gerelateerde zoektermen:</strong> ${missing.join(", ")}.</p>`;
}

export async function POST(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminSupabase = createAdminClient();

  const body = await request.json();
  const { prompt, keywords, generationSettings } = body;
  if (!prompt) return NextResponse.json({ error: "Missing prompt" }, { status: 400 });

  const { data: post } = await supabase
    .from("asc_wp_posts")
    .select("*")
    .eq("id", postId)
    .eq("user_id", user.id)
    .single();

  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  // Load site settings
  let toneOfVoice = null;
  let siteRecord: SiteRecord | null = null;
  if (post.site_id) {
    const { data: site } = await supabase
      .from("asc_sites")
      .select("tone_of_voice, wp_base_url, wp_username, wp_app_password_encrypted")
      .eq("id", post.site_id)
      .eq("user_id", user.id)
      .single();
    siteRecord = site ?? null;
    toneOfVoice = site?.tone_of_voice ?? null;
  }

  const effectiveGenerationSettings = normalizeGenerationSettings(
    generationSettings ?? post.generation_settings
  );
  const inlineImageTarget = Math.max(
    0,
    Math.min(3, effectiveGenerationSettings.images.inlineImageCount)
  );
  const canGenerateInlineImages = Boolean(
    siteRecord?.wp_base_url &&
      siteRecord.wp_username &&
      siteRecord.wp_app_password_encrypted
  );
  const plannedInlineImageCredits = canGenerateInlineImages ? inlineImageTarget : 0;
  const plannedRewriteCost =
    CREDIT_COSTS.content_rewrite +
    plannedInlineImageCredits * CREDIT_COSTS.inline_image_generation;
  const creditCheck = await checkCredits(adminSupabase, user.id, plannedRewriteCost);
  if (!creditCheck.enough) {
    return NextResponse.json(
      {
        error: "Onvoldoende credits",
        required: plannedRewriteCost,
        remaining: creditCheck.remaining,
      },
      { status: 402 }
    );
  }

  const settingsKeywords = effectiveGenerationSettings.details.includeKeywords;
  const mergedKeywords = Array.from(
    new Set([
      ...(Array.isArray(keywords) ? keywords : []),
      ...settingsKeywords,
      effectiveGenerationSettings.details.focusKeyword,
    ].filter((item): item is string => typeof item === "string" && item.trim().length > 0))
  );

  const result = await rewriteContentWithPrompt(
    post.content || "",
    prompt,
    mergedKeywords.length > 0 ? mergedKeywords : undefined,
    toneOfVoice,
    effectiveGenerationSettings
  );

  const focusKeyword =
    effectiveGenerationSettings.details.focusKeyword.trim() || null;
  const maxHumanizerPasses = Number.isFinite(HUMANIZER_MAX_PASSES)
    ? Math.min(Math.max(HUMANIZER_MAX_PASSES, 0), 2)
    : 1;
  const shouldConsiderHumanizer = HUMANIZER_MODE !== "off" && maxHumanizerPasses > 0;
  let rewrittenHtml = result.htmlContent || "";
  let rewrittenMetaDescription = result.metaDescription || "";

  if (shouldConsiderHumanizer) {
    for (let pass = 0; pass < maxHumanizerPasses; pass += 1) {
      const clicheHits = detectAiClicheHits(
        `${rewrittenMetaDescription}\n${stripTags(rewrittenHtml)}`
      );
      const shouldHumanize =
        HUMANIZER_MODE === "aggressive" || clicheHits > 0 || pass === 0;
      if (!shouldHumanize) break;

      try {
        const canonicalHtml = canonicalizeYouTubeMarkers(
          canonicalizeImageMarkers(rewrittenHtml)
        );
        const humanized = await humanizeArticleDraft({
          language: "Dutch",
          topic: focusKeyword || post.title || "Artikel",
          title: post.title || focusKeyword || "Artikel",
          targetKeywords: mergedKeywords,
          toneOfVoice,
          mode: HUMANIZER_MODE === "aggressive" ? "aggressive" : "auto",
          draft: {
            metaDescription: rewrittenMetaDescription,
            htmlContent: canonicalHtml,
            tableOfContents: [],
            internalLinksUsed: [],
            externalLinksUsed: [],
            faqItems: [],
            imageMarkers: extractImageMarkers(canonicalHtml),
            youtubeMarkers: extractYouTubeMarkers(canonicalHtml),
          },
        });

        rewrittenHtml = humanized.htmlContent || rewrittenHtml;
        rewrittenMetaDescription =
          humanized.metaDescription || rewrittenMetaDescription;
      } catch (error) {
        console.error("[rewrite] Humanizer pass failed:", error);
        break;
      }
    }
  }

  let htmlContent = ensureKeywordMentions(rewrittenHtml, mergedKeywords);
  htmlContent = normalizeHeadingSentenceCase(htmlContent);
  let generatedInlineImageCount = 0;

  if (inlineImageTarget > 0) {
    htmlContent = canonicalizeImageMarkers(htmlContent);
    let markers = extractImageMarkers(htmlContent);
    if (markers.length === 0) {
      markers = deriveFallbackMarkers(htmlContent, post.title || "Artikel", inlineImageTarget);
      htmlContent = injectImageMarkersAfterH2(htmlContent, markers);
    }

    const markersToProcess = markers.slice(0, inlineImageTarget);
    if (markersToProcess.length > 0 && post.site_id) {
      if (
        siteRecord?.wp_base_url &&
        siteRecord.wp_username &&
        siteRecord.wp_app_password_encrypted
      ) {
        const creds = {
          baseUrl: siteRecord.wp_base_url,
          username: siteRecord.wp_username,
          appPassword: decrypt(siteRecord.wp_app_password_encrypted),
        };
        const slug = String(post.slug || post.title || "article")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "article";
        const topic = effectiveGenerationSettings.details.focusKeyword || post.title || "Article";
        const context = stripTags(htmlContent).slice(0, 700);

        for (let i = 0; i < markersToProcess.length; i += 1) {
          const marker = markersToProcess[i];
          try {
            const imageHtml = await buildInlineImageHtml(
              topic,
              post.title || topic,
              context,
              marker,
              slug,
              i,
              focusKeyword,
              creds
            );
            htmlContent = htmlContent.replace(`<!-- IMAGE:${marker} -->`, imageHtml);
            generatedInlineImageCount += 1;
          } catch {
            htmlContent = htmlContent.replace(`<!-- IMAGE:${marker} -->`, "");
          }
        }
      }
    }

    htmlContent = htmlContent.replace(/<!--\s*IMAGE:[\s\S]*?-->/gi, "");
  }

  const youtubeTarget =
    effectiveGenerationSettings.images.youtubeEnabled
      ? Math.max(0, Math.min(3, effectiveGenerationSettings.images.youtubeCount))
      : 0;

  if (youtubeTarget > 0) {
    htmlContent = canonicalizeYouTubeMarkers(htmlContent);
    let youtubeMarkers = extractYouTubeMarkers(htmlContent);
    if (youtubeMarkers.length === 0) {
      youtubeMarkers = deriveFallbackYouTubeMarkers(
        htmlContent,
        post.title || "Artikel",
        youtubeTarget
      );
      htmlContent = injectYouTubeMarkersAfterH2(htmlContent, youtubeMarkers);
    }

    const markersToProcess = youtubeMarkers.slice(0, youtubeTarget);
    for (const marker of markersToProcess) {
      try {
        const videos = await searchYouTubeVideos(marker, 1);
        const videoHtml = videos.length > 0 ? videos[0].embedHtml : "";
        htmlContent = htmlContent.replace(`<!-- YOUTUBE:${marker} -->`, videoHtml);
      } catch {
        htmlContent = htmlContent.replace(`<!-- YOUTUBE:${marker} -->`, "");
      }
    }

    for (const marker of youtubeMarkers) {
      if (!markersToProcess.includes(marker)) {
        htmlContent = htmlContent.replace(`<!-- YOUTUBE:${marker} -->`, "");
      }
    }
  }

  htmlContent = htmlContent.replace(/<!--\s*YOUTUBE:[\s\S]*?-->/gi, "");

  if (focusKeyword) {
    const imageWithAltRegex = /<img\b[^>]*\balt=(["'])(.*?)\1/gi;
    htmlContent = htmlContent.replace(imageWithAltRegex, (match, quote, altText) => {
      const currentAlt = String(altText || "").trim();
      if (currentAlt.toLowerCase().includes(focusKeyword.toLowerCase())) {
        return match;
      }
      const nextAlt = currentAlt
        ? `${currentAlt} - ${focusKeyword}`
        : `${focusKeyword} visual`;
      return match.replace(
        /\balt=(["'])(.*?)\1/i,
        `alt=${quote}${escapeHtmlAttr(nextAlt)}${quote}`
      );
    });
  }

  if (effectiveGenerationSettings.internalLinking.enabled && post.site_id) {
    const h2Count = Math.max(1, (htmlContent.match(/<h2\b/gi) || []).length);
    const targetInternalLinks = Math.max(
      1,
      Math.min(8, effectiveGenerationSettings.internalLinking.linksPerH2 * h2Count)
    );
    const currentInternalLinks = countInternalLinks(
      htmlContent,
      siteRecord?.wp_base_url
    );

    if (currentInternalLinks < targetInternalLinks) {
      const { data: linkedPosts } = await supabase
        .from("asc_wp_posts")
        .select("id, title, url")
        .eq("site_id", post.site_id)
        .eq("user_id", user.id)
        .eq("status", "publish")
        .neq("id", post.id)
        .order("wp_modified_at", { ascending: false })
        .order("last_synced_at", { ascending: false })
        .limit(40);

      const existingHrefs = new Set(
        Array.from(
          htmlContent.matchAll(/<a\b[^>]*\bhref=(["'])(.*?)\1/gi)
        ).map((match) => (match[2] || "").trim())
      );

      const needed = targetInternalLinks - currentInternalLinks;
      const linksToAdd = (linkedPosts ?? [])
        .filter((item) => item.url && item.title)
        .filter((item) => !existingHrefs.has(item.url))
        .slice(0, needed)
        .map((item) => ({ title: item.title, href: item.url }));

      htmlContent = addRelatedLinksSection(htmlContent, linksToAdd);
    }
  }

  // Only save locally — publish happens via the PATCH "Opslaan & Publiceren" endpoint
  const rewriteUpdates: Record<string, unknown> = {
    content: htmlContent,
    meta_description: ensureMetaDescription(
      rewrittenMetaDescription,
      focusKeyword,
      post.title || ""
    ),
  };
  if (result.metaTitle?.trim()) {
    rewriteUpdates.meta_title = result.metaTitle.trim();
  }

  const { data: updated } = await supabase
    .from("asc_wp_posts")
    .update(rewriteUpdates)
    .eq("id", postId)
    .select()
    .single();

  // Deduct base rewrite credits
  const rewriteDeduction = await deductCredits(
    adminSupabase,
    user.id,
    "content_rewrite",
    postId
  );
  if (!rewriteDeduction.success) {
    console.error("[rewrite] Base credit deduction failed:", rewriteDeduction.error);
  }

  // Deduct 1 extra credit per successfully generated inline image
  for (let i = 0; i < generatedInlineImageCount; i += 1) {
    const inlineDeduction = await deductCredits(
      adminSupabase,
      user.id,
      "inline_image_generation",
      `${postId}:inline:${i + 1}`
    );
    if (!inlineDeduction.success) {
      console.error("[rewrite] Inline image credit deduction failed:", inlineDeduction.error);
      break;
    }
  }

  return NextResponse.json({ post: updated });
}
