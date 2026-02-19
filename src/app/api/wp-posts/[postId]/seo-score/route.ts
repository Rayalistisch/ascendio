import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyzeContentSEO } from "@/lib/openai";
import { checkCredits, deductCredits, CREDIT_COSTS } from "@/lib/credits";
import { normalizeGenerationSettings } from "@/lib/generation-settings";

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function extractHrefs(html: string): string[] {
  const hrefs: string[] = [];
  const matches = html.matchAll(/<a\b[^>]*\bhref=(["'])(.*?)\1/gi);
  for (const match of matches) {
    const href = (match[2] || "").trim();
    if (href) hrefs.push(href);
  }
  return hrefs;
}

function isInternalHref(href: string, siteBaseUrl?: string): boolean {
  if (!href) return false;
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  if (!siteBaseUrl) return false;
  try {
    const siteHost = new URL(siteBaseUrl).host;
    const linkHost = new URL(href).host;
    return siteHost === linkHost;
  } catch {
    return false;
  }
}

function extractImageAlts(html: string): string[] {
  const alts: string[] = [];
  const imgMatches = html.matchAll(/<img\b[^>]*>/gi);
  for (const imgMatch of imgMatches) {
    const tag = imgMatch[0];
    const altMatch = tag.match(/\balt=(["'])(.*?)\1/i);
    if (altMatch) alts.push((altMatch[2] || "").trim());
  }
  return alts;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function POST(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Credit pre-check
  const adminSupabase = createAdminClient();
  const creditCheck = await checkCredits(adminSupabase, user.id, CREDIT_COSTS.seo_score_analysis);
  if (!creditCheck.enough) {
    return NextResponse.json({ error: "Onvoldoende credits" }, { status: 402 });
  }

  let keywords: string[] | undefined;
  try {
    const body = await request.json();
    keywords = Array.isArray(body.keywords) ? body.keywords : undefined;
  } catch {
    // No body sent — that's fine, keywords are optional
  }

  const { data: post } = await supabase
    .from("asc_wp_posts")
    .select("*")
    .eq("id", postId)
    .eq("user_id", user.id)
    .single();

  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const settings = normalizeGenerationSettings(post.generation_settings);
  const { data: site } = await supabase
    .from("asc_sites")
    .select("wp_base_url")
    .eq("id", post.site_id)
    .eq("user_id", user.id)
    .single();
  const mergedKeywords = Array.from(
    new Set([
      ...(Array.isArray(keywords) ? keywords : []),
      ...settings.details.includeKeywords,
      settings.details.focusKeyword,
    ].filter((item): item is string => typeof item === "string" && item.trim().length > 0))
  );

  const analysis = await analyzeContentSEO(
    post.content || "",
    (post.meta_title || post.title || "").trim(),
    post.meta_description || "",
    mergedKeywords.length > 0 ? mergedKeywords : undefined
  );

  const html = String(post.content || "");
  const plain = stripTags(html).toLowerCase();
  const focusKeyword = settings.details.focusKeyword.trim().toLowerCase();
  const metaDescription = String(post.meta_description || "");
  const metaDescriptionLower = metaDescription.toLowerCase();
  const hrefs = extractHrefs(html);
  const internalLinkCount = hrefs.filter((href) =>
    isInternalHref(href, site?.wp_base_url || undefined)
  ).length;
  const hasInternalLinks = internalLinkCount > 0;
  const imageAlts = extractImageAlts(html);
  const imageAltKeywordOk =
    imageAlts.length === 0 ||
    (focusKeyword
      ? imageAlts.some((alt) => alt.toLowerCase().includes(focusKeyword))
      : imageAlts.some((alt) => alt.length >= 6));
  const metaHasKeyword = focusKeyword
    ? metaDescriptionLower.includes(focusKeyword)
    : metaDescription.length >= 120;
  const metaLengthGood =
    metaDescription.length >= 140 && metaDescription.length <= 165;
  const keywordCoverage =
    mergedKeywords.length === 0
      ? 1
      : mergedKeywords.filter((keyword) => plain.includes(keyword.toLowerCase())).length /
        Math.min(mergedKeywords.length, 5);

  let adjustedScore = Number(analysis.score || 0);
  adjustedScore += hasInternalLinks ? 5 : -8;
  adjustedScore += imageAltKeywordOk ? 4 : -4;
  adjustedScore += metaLengthGood ? 3 : -3;
  adjustedScore += metaHasKeyword ? 3 : -3;
  adjustedScore += keywordCoverage >= 0.5 ? 4 : -4;
  const finalScore = clampScore(adjustedScore);

  const rawIssues = Array.isArray(analysis.issues) ? analysis.issues : [];
  const filteredIssues = rawIssues.filter((issue) => {
    const message = String(issue?.message || "").toLowerCase();
    if (hasInternalLinks && /internal links?/.test(message)) return false;
    if (imageAltKeywordOk && /(alt text|image lacks alt|no alt text)/.test(message)) return false;
    if (metaHasKeyword && metaLengthGood && /meta description/.test(message)) return false;
    if (keywordCoverage >= 0.5 && /(keyword variation|focus keyword|synonym)/.test(message)) return false;
    return true;
  });

  await supabase.from("asc_wp_posts").update({ seo_score: finalScore }).eq("id", postId);

  // Deduct credits after successful analysis
  const deduction = await deductCredits(adminSupabase, user.id, "seo_score_analysis", postId);
  if (!deduction.success) {
    console.error("[seo-score] Credit deduction failed:", deduction.error);
  }

  return NextResponse.json({
    ...analysis,
    score: finalScore,
    issues: filteredIssues,
  });
}
