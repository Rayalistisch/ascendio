import type { SupabaseClient } from "@supabase/supabase-js";

interface WPCredentials {
  baseUrl: string;
  username: string;
  appPassword: string;
}

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

export async function scanSite(
  posts: Array<Record<string, any>>
): Promise<ScanResult> {
  const summaries = posts.map((p) => ({
    id: p.id,
    title: typeof p.title === "object" ? p.title.rendered : p.title,
    slug: p.slug,
    contentPreview: stripHtml(typeof p.content === "object" ? p.content.rendered : p.content || "").substring(0, 200).toLowerCase(),
  }));

  const allIssues: ScanIssue[] = [];
  for (const post of posts) {
    const issues = analyzePage(post, summaries);
    allIssues.push(...issues);
  }

  return { pagesScanned: posts.length, issues: allIssues };
}

export function analyzePage(
  post: Record<string, any>,
  allPosts: Array<{ id: number; title: string; slug: string; contentPreview: string }>
): ScanIssue[] {
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
        autoFixable: true,
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
        autoFixable: true,
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
      autoFixable: false,
    });
  }

  // 4. Missing meta description (check excerpt as proxy)
  const excerpt = typeof post.excerpt === "object" ? post.excerpt.rendered : post.excerpt || "";
  const excerptText = stripHtml(excerpt);
  if (!excerptText || excerptText.length < 50) {
    issues.push({
      wpPostId: post.id,
      pageUrl: postUrl,
      issueType: "missing_meta_description",
      severity: "critical",
      description: "Ontbrekende of te korte meta-beschrijving",
      currentValue: excerptText || undefined,
      autoFixable: true,
    });
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
      autoFixable: true,
    });
  }

  // 6. Low internal links
  const linkRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>/gi;
  let internalLinkCount = 0;
  let brokenLinkCandidates: string[] = [];
  let linkMatch;
  const baseHost = postUrl ? new URL(postUrl).hostname : "";
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    const href = linkMatch[1];
    if (baseHost && href.includes(baseHost)) {
      internalLinkCount++;
    }
    if (href.startsWith("http") && !href.includes(baseHost)) {
      brokenLinkCandidates.push(href);
    }
  }
  if (internalLinkCount < 2 && allPosts.length > 5) {
    issues.push({
      wpPostId: post.id,
      pageUrl: postUrl,
      issueType: "low_internal_links",
      severity: "info",
      description: `Weinig interne links (${internalLinkCount} gevonden, 2+ aanbevolen)`,
      autoFixable: true,
    });
  }

  // 7. Missing schema check (look for JSON-LD in content)
  if (!html.includes("application/ld+json")) {
    issues.push({
      wpPostId: post.id,
      pageUrl: postUrl,
      issueType: "missing_schema",
      severity: "info",
      description: "Geen gestructureerde data (schema markup) gevonden",
      autoFixable: true,
    });
  }

  // 8. Duplicate content (simple comparison)
  const preview = stripHtml(html).substring(0, 200).toLowerCase();
  for (const other of allPosts) {
    if (other.id !== post.id && preview && other.contentPreview) {
      // Simple similarity: check if >80% of words overlap
      const words1 = new Set(preview.split(/\s+/));
      const words2 = new Set(other.contentPreview.split(/\s+/));
      const intersection = [...words1].filter((w) => words2.has(w));
      const similarity = intersection.length / Math.max(words1.size, words2.size);
      if (similarity > 0.8) {
        issues.push({
          wpPostId: post.id,
          pageUrl: postUrl,
          issueType: "duplicate_content",
          severity: "critical",
          description: `Mogelijke dubbele content met "${other.title}"`,
          autoFixable: false,
        });
      }
    }
  }

  return issues;
}
