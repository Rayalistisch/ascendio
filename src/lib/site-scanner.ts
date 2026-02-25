import { isIssueTypeAutoFixable } from "@/lib/seo-fix";
import {
  findExternalPlagiarismMatches,
  type ExternalPlagiarismMatch,
} from "@/lib/external-plagiarism";
import { fetchPageHtml, parseSeoFromHtml } from "@/lib/wordpress";

export interface ScanIssue {
  wpPostId?: number;
  pageUrl: string;
  issueType: string;
  severity: "critical" | "warning" | "info";
  description: string;
  currentValue?: string;
  suggestedFix?: string;
  autoFixable: boolean;
}

export interface ScanResult {
  pagesScanned: number;
  issues: ScanIssue[];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

const JSON_LD_SCRIPT_REGEX =
  /<script\b[^>]*type=["'][^"']*application\/ld\+json[^"']*["'][^>]*>([\s\S]*?)<\/script>/gi;

const ITEMTYPE_REGEX = /\bitemtype=["']([^"']+)["']/gi;
const TYPEOF_REGEX = /\btypeof=["']([^"']+)["']/gi;
const SCHEMA_URL_TYPE_REGEX = /https?:\/\/schema\.org\/([A-Za-z][A-Za-z0-9_-]*)/gi;

function decodeCommonEntities(input: string): string {
  return input
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeSchemaType(typeValue: string): string | null {
  const value = typeValue.trim();
  if (!value) return null;

  if (value.startsWith("http://schema.org/") || value.startsWith("https://schema.org/")) {
    const maybeType = value.split("/").pop()?.split("#")[0]?.split("?")[0] || "";
    return maybeType || null;
  }

  if (value.toLowerCase().startsWith("schema:")) {
    const maybeType = value.split(":")[1] || "";
    return maybeType || null;
  }

  if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(value)) {
    return value;
  }

  return null;
}

function collectJsonLdTypes(value: unknown, types: Set<string>): void {
  if (!value) return;

  if (Array.isArray(value)) {
    for (const item of value) collectJsonLdTypes(item, types);
    return;
  }

  if (typeof value !== "object") return;
  const node = value as Record<string, unknown>;

  const rawType = node["@type"];
  if (typeof rawType === "string") {
    for (const token of rawType.split(/\s+/)) {
      const normalized = normalizeSchemaType(token);
      if (normalized) types.add(normalized);
    }
  } else if (Array.isArray(rawType)) {
    for (const candidate of rawType) {
      if (typeof candidate !== "string") continue;
      const normalized = normalizeSchemaType(candidate);
      if (normalized) types.add(normalized);
    }
  }

  for (const child of Object.values(node)) {
    collectJsonLdTypes(child, types);
  }
}

function extractSchemaTypesFromHtml(html: string): string[] {
  const types = new Set<string>();

  JSON_LD_SCRIPT_REGEX.lastIndex = 0;
  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = JSON_LD_SCRIPT_REGEX.exec(html)) !== null) {
    const rawBlock = (blockMatch[1] || "").replace(/<!--/g, "").replace(/-->/g, "").trim();
    if (!rawBlock) continue;

    try {
      collectJsonLdTypes(JSON.parse(rawBlock), types);
    } catch {
      try {
        collectJsonLdTypes(JSON.parse(decodeCommonEntities(rawBlock)), types);
      } catch {
        // Ignore malformed block here; scanner only needs presence/types for schema issue.
      }
    }
  }

  ITEMTYPE_REGEX.lastIndex = 0;
  let itemTypeMatch: RegExpExecArray | null;
  while ((itemTypeMatch = ITEMTYPE_REGEX.exec(html)) !== null) {
    const rawValue = itemTypeMatch[1] || "";
    for (const token of rawValue.split(/\s+/)) {
      const normalized = normalizeSchemaType(token);
      if (normalized) types.add(normalized);
    }
  }

  TYPEOF_REGEX.lastIndex = 0;
  let typeOfMatch: RegExpExecArray | null;
  while ((typeOfMatch = TYPEOF_REGEX.exec(html)) !== null) {
    const rawValue = typeOfMatch[1] || "";
    for (const token of rawValue.split(/\s+/)) {
      const normalized = normalizeSchemaType(token);
      if (normalized) types.add(normalized);
    }
  }

  SCHEMA_URL_TYPE_REGEX.lastIndex = 0;
  let schemaUrlMatch: RegExpExecArray | null;
  while ((schemaUrlMatch = SCHEMA_URL_TYPE_REGEX.exec(html)) !== null) {
    const rawType = schemaUrlMatch[1] || "";
    const normalized = normalizeSchemaType(rawType);
    if (normalized) types.add(normalized);
  }

  return Array.from(types).sort((a, b) => a.localeCompare(b));
}

function getHostnameSafe(url: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

const PLAGIARISM_MIN_WORDS = 120;
const PLAGIARISM_SHINGLE_SIZE = 5;
const PLAGIARISM_JACCARD_THRESHOLD = 0.18;
const PLAGIARISM_CONTAINMENT_THRESHOLD = 0.34;
const PLAGIARISM_MIN_SCORE = 35;
const PLAGIARISM_MAX_MATCHES_PER_PAGE = 3;

const PLAGIARISM_STOPWORDS = new Set([
  "aan",
  "als",
  "bij",
  "dan",
  "dat",
  "de",
  "den",
  "der",
  "des",
  "die",
  "dit",
  "door",
  "een",
  "en",
  "er",
  "geen",
  "heb",
  "heeft",
  "het",
  "hier",
  "hij",
  "hoe",
  "hun",
  "ik",
  "in",
  "is",
  "je",
  "kan",
  "kun",
  "maar",
  "me",
  "met",
  "mijn",
  "na",
  "naar",
  "niet",
  "nog",
  "nu",
  "of",
  "om",
  "ons",
  "ook",
  "op",
  "over",
  "te",
  "tot",
  "uit",
  "van",
  "veel",
  "voor",
  "want",
  "was",
  "wat",
  "we",
  "wel",
  "werd",
  "wie",
  "wij",
  "wordt",
  "you",
  "your",
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "that",
  "this",
  "are",
  "was",
  "were",
  "will",
  "can",
  "about",
  "have",
  "has",
  "had",
  "not",
  "but",
  "our",
  "out",
  "per",
  "via",
  "www",
]);

interface PageSummary {
  id: number;
  title: string;
  slug: string;
  pageUrl: string;
}

interface PlagiarismProfile extends PageSummary {
  tokens: string[];
  shingles: Set<string>;
}

interface PlagiarismMatch {
  otherPostId: number;
  otherTitle: string;
  otherPageUrl: string;
  riskScore: number;
  jaccard: number;
  containment: number;
}

function normalizeForPlagiarism(text: string): string {
  return text
    .toLowerCase()
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/[^a-z0-9\u00c0-\u024f\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeForPlagiarism(text: string): string[] {
  if (!text) return [];
  return normalizeForPlagiarism(text)
    .split(" ")
    .filter((token) => token.length >= 3 && !PLAGIARISM_STOPWORDS.has(token));
}

function createShingles(tokens: string[], size = PLAGIARISM_SHINGLE_SIZE, maxShingles = 1400): Set<string> {
  const shingles = new Set<string>();
  if (tokens.length < size) return shingles;

  const total = tokens.length - size + 1;
  const step = total > maxShingles ? Math.ceil(total / maxShingles) : 1;

  for (let i = 0; i <= tokens.length - size; i += step) {
    shingles.add(tokens.slice(i, i + size).join(" "));
  }

  // Ensure the tail shingles are included for long pages where step > 1.
  shingles.add(tokens.slice(tokens.length - size).join(" "));
  return shingles;
}

function getIntersectionSize(left: Set<string>, right: Set<string>): number {
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  let count = 0;
  for (const token of small) {
    if (large.has(token)) count++;
  }
  return count;
}

function buildPlagiarismMatches(
  profiles: PlagiarismProfile[]
): Map<number, PlagiarismMatch[]> {
  const matchesById = new Map<number, PlagiarismMatch[]>();
  for (const profile of profiles) {
    matchesById.set(profile.id, []);
  }

  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const left = profiles[i];
      const right = profiles[j];

      if (left.tokens.length < PLAGIARISM_MIN_WORDS || right.tokens.length < PLAGIARISM_MIN_WORDS) {
        continue;
      }
      if (left.shingles.size === 0 || right.shingles.size === 0) continue;

      const intersection = getIntersectionSize(left.shingles, right.shingles);
      if (intersection === 0) continue;

      const union = left.shingles.size + right.shingles.size - intersection;
      if (union <= 0) continue;

      const jaccard = intersection / union;
      const containment = intersection / Math.min(left.shingles.size, right.shingles.size);

      if (
        jaccard < PLAGIARISM_JACCARD_THRESHOLD &&
        containment < PLAGIARISM_CONTAINMENT_THRESHOLD
      ) {
        continue;
      }

      const riskScore = Math.round(Math.max(jaccard, containment) * 100);
      if (riskScore < PLAGIARISM_MIN_SCORE) continue;

      matchesById.get(left.id)?.push({
        otherPostId: right.id,
        otherTitle: right.title,
        otherPageUrl: right.pageUrl,
        riskScore,
        jaccard,
        containment,
      });
      matchesById.get(right.id)?.push({
        otherPostId: left.id,
        otherTitle: left.title,
        otherPageUrl: left.pageUrl,
        riskScore,
        jaccard,
        containment,
      });
    }
  }

  for (const matches of matchesById.values()) {
    matches.sort((a, b) => {
      if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
      if (b.containment !== a.containment) return b.containment - a.containment;
      return b.jaccard - a.jaccard;
    });
    if (matches.length > PLAGIARISM_MAX_MATCHES_PER_PAGE) {
      matches.length = PLAGIARISM_MAX_MATCHES_PER_PAGE;
    }
  }

  return matchesById;
}

async function fetchRenderedHtml(pageUrl: string, timeoutMs = 8000): Promise<string | null> {
  if (!pageUrl) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(pageUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });

    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function scanSite(
  posts: Array<Record<string, any>>
): Promise<ScanResult> {
  const summaries: PageSummary[] = posts.map((post, index) => {
    const rawId = typeof post.id === "number" ? post.id : Number(post.id);
    const safeId = Number.isFinite(rawId) ? rawId : -(index + 1);
    const rawTitle = typeof post.title === "object" ? post.title?.rendered : post.title;
    return {
      id: safeId,
      title: String(rawTitle || ""),
      slug: String(post.slug || ""),
      pageUrl: String(post.link || ""),
    };
  });

  const plagiarismProfiles: PlagiarismProfile[] = posts.map((post, index) => {
    const summary = summaries[index];
    const html = typeof post.content === "object" ? post.content.rendered : post.content || "";
    const tokens = tokenizeForPlagiarism(stripHtml(String(html || "")));
    return {
      ...summary,
      tokens,
      shingles: createShingles(tokens),
    };
  });

  const plagiarismMatchesByPostId = buildPlagiarismMatches(plagiarismProfiles);
  const externalPlagiarismByPostId = await findExternalPlagiarismMatches(
    summaries.map((summary, index) => {
      const post = posts[index];
      const html = typeof post.content === "object" ? post.content.rendered : post.content || "";
      return {
        id: summary.id,
        pageUrl: summary.pageUrl,
        title: summary.title,
        textContent: stripHtml(String(html || "")),
      };
    })
  );

  // Pre-fetch SEO meta for all pages in parallel (max 8 concurrent) to avoid sequential delays
  const CONCURRENCY = 8;
  const seoMetaMap = new Map<string, { title: string | null; description: string | null }>();
  for (let i = 0; i < posts.length; i += CONCURRENCY) {
    const batch = posts.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (post) => {
        const url = post.link || "";
        if (!url) return;
        try {
          const html = await fetchPageHtml(url);
          seoMetaMap.set(url, parseSeoFromHtml(html));
        } catch {
          // page unreachable — analyzePage will fall back to excerpt
        }
      })
    );
  }

  const allIssues: ScanIssue[] = [];
  for (let index = 0; index < posts.length; index++) {
    const post = posts[index];
    const summary = summaries[index];
    const issues = await analyzePage(
      post,
      summaries,
      plagiarismMatchesByPostId.get(summary.id) || [],
      externalPlagiarismByPostId.get(summary.id) || [],
      seoMetaMap.get(post.link || "") ?? null
    );
    allIssues.push(...issues);
  }

  return { pagesScanned: posts.length, issues: allIssues };
}

export async function analyzePage(
  post: Record<string, any>,
  allPosts: PageSummary[],
  plagiarismMatches: PlagiarismMatch[] = [],
  externalPlagiarismMatches: ExternalPlagiarismMatch[] = [],
  prefetchedSeoMeta: { title: string | null; description: string | null } | null = null
): Promise<ScanIssue[]> {
  const issues: ScanIssue[] = [];
  const html = typeof post.content === "object" ? post.content.rendered : post.content || "";
  const postTitle = typeof post.title === "object" ? post.title.rendered : post.title;
  const postUrl = post.link || "";

  // 1. Missing alt text
  const imgRegex = /<img[^>]*>/gi;
  const imgs = html.match(imgRegex) || [];
  for (const img of imgs) {
    if (!img.includes("alt=") || /alt=["']\s*["']/.test(img)) {
      issues.push({
        wpPostId: post.id,
        pageUrl: postUrl,
        issueType: "missing_alt",
        severity: "warning",
        description: "Afbeelding zonder alt-tekst gevonden",
        currentValue: img.substring(0, 100),
        autoFixable: isIssueTypeAutoFixable("missing_alt"),
      });
    }
  }

  // 2. Heading hierarchy
  const headingRegex = /<h([1-6])[^>]*>/gi;
  let lastLevel = 0;
  let headingMatch;
  while ((headingMatch = headingRegex.exec(html)) !== null) {
    const level = parseInt(headingMatch[1]);
    if (level > lastLevel + 1 && lastLevel > 0) {
      issues.push({
        wpPostId: post.id,
        pageUrl: postUrl,
        issueType: "heading_hierarchy",
        severity: "warning",
        description: `Kopniveau springt van H${lastLevel} naar H${level}`,
        autoFixable: isIssueTypeAutoFixable("heading_hierarchy"),
      });
    }
    lastLevel = level;
  }

  // 3. Thin content
  const textContent = stripHtml(html);
  const wordCount = textContent.split(/\s+/).filter(Boolean).length;
  if (wordCount < 300) {
    issues.push({
      wpPostId: post.id,
      pageUrl: postUrl,
      issueType: "thin_content",
      severity: "critical",
      description: `Dunne content: slechts ${wordCount} woorden (minimum 300)`,
      autoFixable: isIssueTypeAutoFixable("thin_content"),
    });
  }

  // 4. Missing meta description + missing meta title (via pre-fetched page HTML)
  {
    let seoTitle: string | null = prefetchedSeoMeta?.title ?? null;
    let seoDescription: string | null = prefetchedSeoMeta?.description ?? null;

    // Fall back to WP excerpt if HTML parse gave nothing
    if (!seoDescription) {
      const excerpt = typeof post.excerpt === "object" ? post.excerpt.rendered : post.excerpt || "";
      seoDescription = stripHtml(excerpt) || null;
    }

    if (!seoDescription || seoDescription.length < 50) {
      issues.push({
        wpPostId: post.id,
        pageUrl: postUrl,
        issueType: "missing_meta_description",
        severity: "critical",
        description: "Ontbrekende of te korte meta-beschrijving",
        currentValue: seoDescription ?? undefined,
        autoFixable: isIssueTypeAutoFixable("missing_meta_description"),
      });
    }

    if (!seoTitle || seoTitle.length < 10) {
      issues.push({
        wpPostId: post.id,
        pageUrl: postUrl,
        issueType: "missing_meta_title",
        severity: "critical",
        description: "Ontbrekende of te korte SEO-paginatitel",
        currentValue: seoTitle ?? undefined,
        suggestedFix: "Genereer een SEO-titel van 50–60 tekens",
        autoFixable: isIssueTypeAutoFixable("missing_meta_title"),
      });
    }
  }

  // 5. Title length check
  if (postTitle && postTitle.length > 60) {
    issues.push({
      wpPostId: post.id,
      pageUrl: postUrl,
      issueType: "long_title",
      severity: "warning",
      description: `Paginatitel te lang: ${postTitle.length} tekens (max 60)`,
      currentValue: postTitle,
      autoFixable: isIssueTypeAutoFixable("long_title"),
    });
  }

  // 6. Low internal links
  const linkRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>/gi;
  let internalLinkCount = 0;
  let linkMatch;
  const baseHost = getHostnameSafe(postUrl);
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    const href = linkMatch[1];
    if (baseHost && href.includes(baseHost)) {
      internalLinkCount++;
    }
  }
  if (internalLinkCount < 2 && allPosts.length > 5) {
    issues.push({
      wpPostId: post.id,
      pageUrl: postUrl,
      issueType: "low_internal_links",
      severity: "info",
      description: `Weinig interne links (${internalLinkCount} gevonden, 2+ aanbevolen)`,
      autoFixable: isIssueTypeAutoFixable("low_internal_links"),
    });
  }

  // 7. Missing schema check (JSON-LD, Microdata and RDFa schema.org types)
  let schemaTypes = extractSchemaTypesFromHtml(html);
  if (schemaTypes.length === 0 && postUrl) {
    const renderedHtml = await fetchRenderedHtml(postUrl);
    if (renderedHtml) {
      schemaTypes = extractSchemaTypesFromHtml(renderedHtml);
    }
  }

  if (schemaTypes.length === 0) {
    issues.push({
      wpPostId: post.id,
      pageUrl: postUrl,
      issueType: "missing_schema",
      severity: "info",
      description: "Geen schema.org markup gevonden (JSON-LD, Microdata of RDFa)",
      suggestedFix:
        "Voeg een passend schema.org type toe (bijv. WebPage, Article, FAQPage, Product).",
      autoFixable: isIssueTypeAutoFixable("missing_schema"),
    });
  }

  // 8. Plagiarism / duplicate-content risk (intern + extern web)
  const topInternal = plagiarismMatches[0];
  const topExternal = externalPlagiarismMatches[0];
  const hasPlagiarismRisk = Boolean(topInternal || topExternal);

  if (hasPlagiarismRisk) {
    const internalScore = topInternal?.riskScore || 0;
    const externalScore = topExternal?.score || 0;
    const topScore = Math.max(internalScore, externalScore);
    const severity: "critical" | "warning" = topScore >= 65 ? "critical" : "warning";

    const details: string[] = [];
    if (plagiarismMatches.length > 0) {
      details.push(
        `Interne overlap: ${plagiarismMatches
          .map((match) => `${match.riskScore}% met "${match.otherTitle || `ID ${match.otherPostId}`}"`)
          .join(", ")}`
      );
    }
    if (externalPlagiarismMatches.length > 0) {
      details.push(
        `Externe matches: ${externalPlagiarismMatches
          .map((match) => `${match.score}% ${match.sourceUrl}`)
          .join(", ")}`
      );
    }

    const description =
      externalScore >= internalScore && topExternal
        ? `Externe overlap-risico: ${topExternal.score}% met "${topExternal.sourceTitle || topExternal.sourceUrl}"`
        : `Interne overlap-risico: ${internalScore}% met "${topInternal?.otherTitle || `ID ${topInternal?.otherPostId}`}"`;

    issues.push({
      wpPostId: post.id,
      pageUrl: postUrl,
      issueType: "plagiarism_risk",
      severity,
      description,
      currentValue: details.join(" | "),
      suggestedFix:
        "Herschrijf overlappende passages met unieke voorbeelden. Bij legitiem hergebruik: gebruik canonical/noindex waar nodig en citeer de bron.",
      autoFixable: isIssueTypeAutoFixable("plagiarism_risk"),
    });
  }

  return issues;
}
