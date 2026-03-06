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

  // Load site — try with sitemap_url first, fall back if column doesn't exist yet
  let site: { wp_base_url: string; platform: string; ibvision_base_url: string | null; sitemap_url?: string | null } | null = null;
  {
    const { data, error } = await adminSupabase
      .from("asc_sites")
      .select("wp_base_url, platform, ibvision_base_url, sitemap_url")
      .eq("id", siteId)
      .eq("user_id", user.id)
      .single();
    if (data) {
      site = data;
    } else if (error?.message?.includes("sitemap_url")) {
      // Migration not yet run — fetch without that column
      const { data: fallback } = await adminSupabase
        .from("asc_sites")
        .select("wp_base_url, platform, ibvision_base_url")
        .eq("id", siteId)
        .eq("user_id", user.id)
        .single();
      site = fallback ?? null;
    }
  }

  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  // Fetch sitemap — use custom sitemap_url if configured, else auto-detect
  const customUrl = site.sitemap_url ?? null;
  let entries: SitemapEntry[];
  let fetchedFrom: string;

  if (customUrl) {
    fetchedFrom = customUrl;
    entries = await fetchChildSitemap(customUrl);
  } else if (site.platform === "ibvision") {
    fetchedFrom = `${site.ibvision_base_url!.replace(/\/+$/, "")}/sitemap.asp`;
    entries = await fetchSitemapFromUrl(fetchedFrom);
  } else {
    fetchedFrom = `${site.wp_base_url}/sitemap.xml (auto)`;
    entries = await fetchSitemap(site.wp_base_url);
  }

  console.log(`[sitemap] fetched from: ${fetchedFrom}, entries: ${entries.length}, isIndex: ${entries.filter(e => e.isIndex).length}`);

  // If sitemap index found, fetch child sitemaps
  const indexEntries = entries.filter((e) => e.isIndex);
  if (indexEntries.length > 0) {
    const childResults = await Promise.allSettled(
      indexEntries.slice(0, 15).map((entry) => fetchChildSitemap(entry.url))
    );
    const childEntries: SitemapEntry[] = [];
    for (const result of childResults) {
      if (result.status === "fulfilled") childEntries.push(...result.value);
    }
    entries = childEntries;
    console.log(`[sitemap] after child fetch: ${entries.length} total entries`);
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

    const { error: upsertError } = await adminSupabase
      .from("asc_sitemap_urls")
      .upsert(rows, { onConflict: "site_id,url" });

    if (upsertError) console.error("[sitemap] upsert error:", upsertError.message);
  }

  const message = entries.length === 0
    ? `Geen URL's gevonden via ${customUrl ?? site.wp_base_url}. Controleer of de sitemap URL bereikbaar is en of de migratie (migrations_v14) is uitgevoerd.`
    : undefined;

  return NextResponse.json({ count: entries.length, ...(message ? { message } : {}) });
}

// ── Helpers ──────────────────────────────────────────────────

async function fetchSitemapFromUrl(url: string): Promise<SitemapEntry[]> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/xml, text/xml, */*" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const entries: SitemapEntry[] = [];
    const matches = xml.matchAll(/<loc>([^<]+)<\/loc>/g);
    for (const m of matches) {
      entries.push({ url: m[1].trim() });
    }
    return entries;
  } catch {
    return [];
  }
}

async function fetchChildSitemap(url: string): Promise<SitemapEntry[]> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/xml, text/xml, */*", "User-Agent": "Mozilla/5.0 (compatible; AscendioBot/1.0)" },
      signal: AbortSignal.timeout(20_000),
    });
    console.log(`[sitemap] fetchChildSitemap ${url} → HTTP ${res.status} ${res.headers.get("content-type") ?? ""}`);
    if (!res.ok) {
      console.error(`[sitemap] fetchChildSitemap non-OK: ${res.status}`);
      return [];
    }
    const xml = await res.text();
    console.log(`[sitemap] xml length: ${xml.length}, first 200: ${xml.slice(0, 200).replace(/\n/g, " ")}`);
    const urlBlocks = xml.match(/<url>[\s\S]*?<\/url>/gi) ?? [];
    console.log(`[sitemap] urlBlocks found: ${urlBlocks.length}`);
    if (urlBlocks.length > 0) {
      console.log(`[sitemap] first url block: ${(urlBlocks[0] ?? "").replace(/\n/g, "\\n").replace(/\r/g, "\\r").slice(0, 400)}`);
    }
    const entries: SitemapEntry[] = [];
    for (const block of urlBlocks) {
      // Handle both plain <loc>URL</loc> and CDATA-wrapped <loc><![CDATA[URL]]></loc> (e.g. AIOSEO Pro)
      const locMatch = block.match(/<loc>(?:<!\[CDATA\[)?\s*([^\]<][^<\]]*?)\s*(?:\]\]>)?<\/loc>/i);
      const lastmodMatch = block.match(/<lastmod>(?:<!\[CDATA\[)?\s*([^\]<][^<\]]*?)\s*(?:\]\]>)?<\/lastmod>/i);
      if (locMatch?.[1]) entries.push({ url: locMatch[1].trim(), lastmod: lastmodMatch?.[1]?.trim() });
    }
    return entries;
  } catch (err) {
    console.error(`[sitemap] fetchChildSitemap error for ${url}:`, err instanceof Error ? err.message : String(err));
    return [];
  }
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
