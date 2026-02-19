import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchSitemap, type SitemapEntry } from "@/lib/wordpress";

// GET /api/sitemap?siteId=...&clusterId=... — read cached sitemap + overlap detection
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "siteId required" }, { status: 400 });

  const adminSupabase = createAdminClient();

  // Load cached sitemap URLs
  const { data: urls } = await adminSupabase
    .from("asc_sitemap_urls")
    .select("url, title, last_modified, scraped_at")
    .eq("site_id", siteId)
    .eq("user_id", user.id)
    .order("url");

  const allUrls = urls ?? [];

  // If clusterId provided, detect overlapping content
  const clusterId = searchParams.get("clusterId");
  let overlapping: Array<{ url: string; reason: string }> = [];

  if (clusterId && allUrls.length > 0) {
    const { data: cluster } = await adminSupabase
      .from("asc_clusters")
      .select("pillar_topic, pillar_keywords")
      .eq("id", clusterId)
      .eq("user_id", user.id)
      .single();

    if (cluster) {
      const searchTerms = buildSearchTerms(
        cluster.pillar_topic,
        cluster.pillar_keywords
      );
      overlapping = findOverlaps(allUrls, searchTerms);
    }
  }

  return NextResponse.json({ urls: allUrls, overlapping });
}

// POST /api/sitemap { siteId } — scrape sitemap and cache results
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { siteId } = await request.json();
  if (!siteId) return NextResponse.json({ error: "siteId required" }, { status: 400 });

  const adminSupabase = createAdminClient();

  // Load site base URL
  const { data: site } = await adminSupabase
    .from("asc_sites")
    .select("wp_base_url")
    .eq("id", siteId)
    .eq("user_id", user.id)
    .single();

  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  // Fetch top-level sitemap
  let entries = await fetchSitemap(site.wp_base_url);

  // If sitemap index found, fetch child sitemaps
  const indexEntries = entries.filter((e) => e.isIndex);
  if (indexEntries.length > 0) {
    const childResults = await Promise.allSettled(
      indexEntries.slice(0, 10).map((entry) => fetchChildSitemap(entry.url))
    );
    const childEntries: SitemapEntry[] = [];
    for (const result of childResults) {
      if (result.status === "fulfilled") childEntries.push(...result.value);
    }
    // Replace index entries with actual URLs
    entries = childEntries;
  }

  // Upsert into cache
  if (entries.length > 0) {
    const rows = entries.map((e) => ({
      site_id: siteId,
      user_id: user.id,
      url: e.url,
      last_modified: e.lastmod || null,
      scraped_at: new Date().toISOString(),
    }));

    await adminSupabase
      .from("asc_sitemap_urls")
      .upsert(rows, { onConflict: "site_id,url" });
  }

  return NextResponse.json({ count: entries.length });
}

// ── Helpers ──────────────────────────────────────────────────

async function fetchChildSitemap(url: string): Promise<SitemapEntry[]> {
  const res = await fetch(url, {
    headers: { Accept: "application/xml, text/xml" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return [];
  const xml = await res.text();
  // Re-use same parsing — child sitemaps contain <url> entries
  const entries: SitemapEntry[] = [];
  const matches = xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g);
  for (const m of matches) {
    entries.push({ url: m[1].trim(), lastmod: m[2]?.trim() });
  }
  return entries;
}

function buildSearchTerms(
  pillarTopic: string,
  pillarKeywords?: string[] | null
): string[] {
  const terms: string[] = [];

  // Normalize pillar topic into slug-like terms
  const slugified = pillarTopic
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim();
  terms.push(slugified);

  // Split multi-word topics
  const words = slugified.split(/\s+/).filter((w) => w.length > 3);
  if (words.length > 1) {
    terms.push(words.join("-")); // e.g. "product-configuratoren"
  }

  // Add keywords
  if (pillarKeywords?.length) {
    for (const kw of pillarKeywords) {
      const kwSlug = kw
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-");
      if (kwSlug.length > 3) terms.push(kwSlug);
    }
  }

  return [...new Set(terms)];
}

function findOverlaps(
  urls: Array<{ url: string; title?: string | null }>,
  searchTerms: string[]
): Array<{ url: string; reason: string }> {
  const results: Array<{ url: string; reason: string }> = [];

  for (const entry of urls) {
    const urlLower = entry.url.toLowerCase();
    const titleLower = entry.title?.toLowerCase() ?? "";

    for (const term of searchTerms) {
      if (urlLower.includes(term) || titleLower.includes(term)) {
        results.push({
          url: entry.url,
          reason: `Bevat "${term}"`,
        });
        break; // one match per URL is enough
      }
    }
  }

  return results;
}
