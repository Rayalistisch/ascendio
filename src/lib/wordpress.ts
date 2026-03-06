interface WPCredentials {
  baseUrl: string;
  username: string;
  appPassword: string;
}

interface WPRequestOptions {
  timeoutMs?: number;
}

type WPCollection = "posts" | "pages";

function authHeader(creds: WPCredentials): string {
  const token = Buffer.from(`${creds.username}:${creds.appPassword}`).toString("base64");
  return `Basic ${token}`;
}

function wpApiUrl(creds: WPCredentials, path: string): string {
  const base = creds.baseUrl.replace(/\/+$/, "");
  return `${base}/wp-json/wp/v2${path}`;
}

export async function testConnection(creds: WPCredentials): Promise<{
  success: boolean;
  displayName?: string;
  error?: string;
}> {
  try {
    const response = await fetch(wpApiUrl(creds, "/users/me"), {
      headers: {
        Authorization: authHeader(creds),
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        success: false,
        error: `WordPress returned ${response.status}: ${body.substring(0, 200)}`,
      };
    }

    const user = await response.json();
    return { success: true, displayName: user.name };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

export async function uploadMedia(
  creds: WPCredentials,
  imageBuffer: Buffer,
  filename: string
): Promise<{ id: number; url: string }> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "png";
  const mimeTypes: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  };
  const contentType = mimeTypes[ext] || "image/png";

  const response = await fetch(wpApiUrl(creds, "/media"), {
    method: "POST",
    headers: {
      Authorization: authHeader(creds),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": contentType,
    },
    body: new Uint8Array(imageBuffer),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to upload media: ${response.status} ${body.substring(0, 200)}`);
  }

  const media = await response.json();
  return { id: media.id, url: media.source_url };
}

export async function createPost(
  creds: WPCredentials,
  params: {
    title: string;
    content: string;
    excerpt: string;
    featuredMediaId?: number;
    status?: "publish" | "draft";
  }
): Promise<{ id: number; url: string }> {
  const body: Record<string, unknown> = {
    title: params.title,
    content: params.content,
    excerpt: params.excerpt,
    status: params.status || "publish",
  };
  if (params.featuredMediaId) {
    body.featured_media = params.featuredMediaId;
  }

  const response = await fetch(wpApiUrl(creds, "/posts"), {
    method: "POST",
    headers: {
      Authorization: authHeader(creds),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to create post: ${response.status} ${body.substring(0, 200)}`);
  }

  const post = await response.json();
  return { id: post.id, url: post.link };
}

export async function createPage(
  creds: WPCredentials,
  params: {
    title: string;
    content: string;
    excerpt: string;
    featuredMediaId?: number;
    status?: "publish" | "draft";
    parent?: number;
    slug?: string;
  }
): Promise<{ id: number; url: string }> {
  const body: Record<string, unknown> = {
    title: params.title,
    content: params.content,
    excerpt: params.excerpt,
    status: params.status || "publish",
  };
  if (params.featuredMediaId) body.featured_media = params.featuredMediaId;
  if (params.parent) body.parent = params.parent;
  if (params.slug) body.slug = params.slug;

  const response = await fetch(wpApiUrl(creds, "/pages"), {
    method: "POST",
    headers: {
      Authorization: authHeader(creds),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to create page: ${response.status} ${body.substring(0, 200)}`);
  }

  const page = await response.json();
  return { id: page.id, url: page.link };
}

async function fetchAllFromCollection(
  creds: WPCredentials,
  collection: WPCollection,
  options?: { perPage?: number; fields?: string[]; maxPages?: number; timeoutMs?: number }
): Promise<Array<Record<string, any>>> {
  const perPage = options?.perPage || 100;
  const fields = options?.fields?.join(',') || 'id,type,title,slug,link,content,excerpt,featured_media,meta,acf,status,date,modified';
  const maxPages = options?.maxPages;
  let page = 1;
  const allRows: Array<Record<string, any>> = [];

  while (true) {
    if (maxPages && page > maxPages) break;

    const controller = options?.timeoutMs ? new AbortController() : undefined;
    const timeoutId = options?.timeoutMs
      ? setTimeout(() => controller?.abort(), options.timeoutMs)
      : undefined;

    const response = await fetch(
      wpApiUrl(creds, `/${collection}?per_page=${perPage}&page=${page}&status=publish&_fields=${fields}`),
      {
        headers: { Authorization: authHeader(creds), "Content-Type": "application/json" },
        signal: controller?.signal,
      }
    ).finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });

    if (!response.ok) break;
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    allRows.push(...rows);
    const totalPages = parseInt(response.headers.get('X-WP-TotalPages') || '1', 10);
    if (page >= totalPages) break;
    page++;
  }

  return allRows;
}

// Fetch all published posts (paginated)
export async function fetchAllPosts(
  creds: WPCredentials,
  options?: { perPage?: number; fields?: string[]; maxPages?: number; timeoutMs?: number }
): Promise<Array<Record<string, any>>> {
  return fetchAllFromCollection(creds, "posts", options);
}

// Fetch all published pages (paginated)
export async function fetchAllPages(
  creds: WPCredentials,
  options?: { perPage?: number; fields?: string[]; maxPages?: number; timeoutMs?: number }
): Promise<Array<Record<string, any>>> {
  return fetchAllFromCollection(creds, "pages", options);
}

// Fetch both posts and pages for site-wide scanning
export async function fetchAllSiteContent(
  creds: WPCredentials,
  options?: { perPage?: number; fields?: string[]; maxPages?: number; timeoutMs?: number }
): Promise<Array<Record<string, any>>> {
  const [posts, pages] = await Promise.all([
    fetchAllPosts(creds, options),
    fetchAllPages(creds, options),
  ]);
  return [...posts, ...pages];
}

async function fetchItemByCollection(
  creds: WPCredentials,
  collection: WPCollection,
  id: number,
  options?: WPRequestOptions
): Promise<Record<string, any>> {
  const controller = options?.timeoutMs ? new AbortController() : undefined;
  const timeoutId = options?.timeoutMs
    ? setTimeout(() => controller?.abort(), options.timeoutMs)
    : undefined;

  try {
    const response = await fetch(wpApiUrl(creds, `/${collection}/${id}`), {
      headers: { Authorization: authHeader(creds), "Content-Type": "application/json" },
      signal: controller?.signal,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to fetch ${collection.slice(0, -1)}: ${response.status} ${body.substring(0, 200)}`);
    }
    return response.json();
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// Fetch a single post by ID
export async function fetchPost(
  creds: WPCredentials,
  postId: number,
  options?: WPRequestOptions
): Promise<Record<string, any>> {
  return fetchItemByCollection(creds, "posts", postId, options);
}

// Fetch a single page by ID
export async function fetchPage(
  creds: WPCredentials,
  pageId: number,
  options?: WPRequestOptions
): Promise<Record<string, any>> {
  return fetchItemByCollection(creds, "pages", pageId, options);
}

async function fetchBySlugFromCollection(
  creds: WPCredentials,
  collection: "posts" | "pages",
  slug: string,
  options?: WPRequestOptions
): Promise<Record<string, any> | null> {
  const fields = "id,title,slug,link,content,status";
  const controller = options?.timeoutMs ? new AbortController() : undefined;
  const timeoutId = options?.timeoutMs
    ? setTimeout(() => controller?.abort(), options.timeoutMs)
    : undefined;

  try {
    const response = await fetch(
      wpApiUrl(
        creds,
        `/${collection}?slug=${encodeURIComponent(slug)}&status=publish&_fields=${fields}`
      ),
      {
        headers: { Authorization: authHeader(creds), "Content-Type": "application/json" },
        signal: controller?.signal,
      }
    );

    if (!response.ok) return null;

    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows[0];
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function fetchPostOrPageBySlug(
  creds: WPCredentials,
  slug: string,
  options?: WPRequestOptions
): Promise<Record<string, any> | null> {
  const post = await fetchBySlugFromCollection(creds, "posts", slug, options);
  if (post) return post;
  return fetchBySlugFromCollection(creds, "pages", slug, options);
}

export async function deletePost(
  creds: WPCredentials,
  postId: number,
  options?: { force?: boolean; collection?: "posts" | "pages" }
): Promise<void> {
  const collection = options?.collection || "posts";
  const force = options?.force ?? true;
  const response = await fetch(
    wpApiUrl(
      creds,
      `/${collection}/${postId}${force ? "?force=true" : ""}`
    ),
    {
      method: "DELETE",
      headers: { Authorization: authHeader(creds), "Content-Type": "application/json" },
    }
  );

  // Already removed in WordPress; treat as successful desired state.
  if (response.status === 404) return;

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to delete post: ${response.status} ${body.substring(0, 200)}`);
  }
}

// Fetch raw _elementor_data for a specific post (returns parsed JSON array or null).
// Uses context=edit so WordPress exposes protected meta fields.
// Falls back to the pages endpoint if the posts endpoint returns 404.
export async function fetchPostElementorData(
  creds: WPCredentials,
  postId: number,
  options?: { collection?: WPCollection }
): Promise<unknown[] | null> {
  const tryFetch = async (collection: string): Promise<unknown[] | null> => {
    // context=edit is required for WordPress to expose protected meta like _elementor_data
    const url = wpApiUrl(creds, `/${collection}/${postId}?context=edit&_fields=id,meta`);
    const res = await fetch(url, {
      headers: { Authorization: authHeader(creds) },
      signal: AbortSignal.timeout(10_000),
    });
    console.log(`[elementor] fetchPostElementorData ${collection}/${postId} → HTTP ${res.status}`);
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data.meta?._elementor_data;
    console.log(`[elementor] _elementor_data present: ${!!raw}, length: ${typeof raw === "string" ? raw.length : 0}`);
    if (!raw || typeof raw !== "string" || raw.length < 3) return null;
    try {
      return JSON.parse(raw) as unknown[];
    } catch {
      console.error(`[elementor] JSON.parse failed for post ${postId}`);
      return null;
    }
  };

  const collection = options?.collection || "posts";
  try {
    const result = await tryFetch(collection);
    if (result) return result;
    // Fallback: try the other collection (pages)
    if (collection === "posts") return await tryFetch("pages");
    return null;
  } catch (err) {
    console.error(`[elementor] fetchPostElementorData error:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

// Update an existing post
export async function updatePost(
  creds: WPCredentials,
  postId: number,
  updates: {
    title?: string;
    content?: string;
    excerpt?: string;
    meta?: Record<string, string>;
    acf?: Record<string, string>;
    status?: string;
  },
  options?: { collection?: WPCollection }
): Promise<{ id: number; url: string }> {
  const collection = options?.collection || "posts";
  const response = await fetch(wpApiUrl(creds, `/${collection}/${postId}`), {
    method: "POST",
    headers: { Authorization: authHeader(creds), "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to update post: ${response.status} ${body.substring(0, 200)}`);
  }
  const post = await response.json();
  // Log if meta keys in the request are present in the response (verifies WP actually saved them)
  if (updates.meta) {
    for (const key of Object.keys(updates.meta)) {
      const sentLen = updates.meta[key].length;
      const gotLen = typeof post.meta?.[key] === "string" ? (post.meta[key] as string).length : -1;
      console.log(`[updatePost] meta.${key}: sent ${sentLen} chars, WP returned ${gotLen} chars`);
    }
  }
  return { id: post.id, url: post.link };
}

// Update media item (for alt text)
export async function updateMedia(
  creds: WPCredentials,
  mediaId: number,
  updates: { alt_text?: string; caption?: string }
): Promise<void> {
  const response = await fetch(wpApiUrl(creds, `/media/${mediaId}`), {
    method: "POST",
    headers: { Authorization: authHeader(creds), "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to update media: ${response.status} ${body.substring(0, 200)}`);
  }
}

// ── SEO Meta (plugin-agnostic) ────────────────────────────────

/** Fetch the raw HTML of a public page URL (no auth needed) */
export async function fetchPageHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Ascendio-Scanner/1.0" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Failed to fetch page HTML: ${res.status}`);
  return res.text();
}

/** Parse <title> and <meta name="description"> from raw HTML */
export function parseSeoFromHtml(html: string): {
  title: string | null;
  description: string | null;
} {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const descMatch = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i
  ) ?? html.match(
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i
  );
  return {
    title: titleMatch ? titleMatch[1].trim() || null : null,
    description: descMatch ? descMatch[1].trim() || null : null,
  };
}

/**
 * Write SEO title and/or description to a WordPress post/page.
 * Sends Yoast, RankMath and native WP fields in one request.
 * WordPress silently ignores unknown meta keys, so this works
 * regardless of which SEO plugin is installed.
 */
export async function updatePostSeoMeta(
  creds: WPCredentials,
  postId: number,
  updates: { seoTitle?: string; seoDescription?: string },
  options?: { collection?: WPCollection }
): Promise<void> {
  const collection = options?.collection ?? "posts";
  const body: Record<string, unknown> = {
    meta: {
      // Yoast SEO
      ...(updates.seoTitle ? { _yoast_wpseo_title: updates.seoTitle } : {}),
      ...(updates.seoDescription ? { _yoast_wpseo_metadesc: updates.seoDescription } : {}),
      // RankMath
      ...(updates.seoTitle ? { rank_math_title: updates.seoTitle } : {}),
      ...(updates.seoDescription ? { rank_math_description: updates.seoDescription } : {}),
    },
  };
  // Native WP fallback fields
  if (updates.seoDescription) body.excerpt = updates.seoDescription;

  const response = await fetch(wpApiUrl(creds, `/${collection}/${postId}`), {
    method: "POST",
    headers: { Authorization: authHeader(creds), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to update SEO meta: ${response.status} ${text.substring(0, 200)}`);
  }
}

// ── Sitemap ──────────────────────────────────────────────────

export interface SitemapEntry {
  url: string;
  lastmod?: string;
  isIndex?: boolean;
}

function extractLocFromBlock(block: string): { url: string; lastmod?: string } | null {
  const locMatch = block.match(/<loc>\s*([^<\s][^<]*?)\s*<\/loc>/i);
  if (!locMatch) return null;
  const url = locMatch[1].trim();
  if (!url) return null;
  const lastmodMatch = block.match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/i);
  return { url, lastmod: lastmodMatch?.[1].trim() };
}

function parseSitemapXml(xml: string): SitemapEntry[] {
  const entries: SitemapEntry[] = [];

  // Check for sitemap index — detect <sitemapindex> or individual <sitemap> blocks
  const isIndex = /<sitemapindex[\s>]/i.test(xml) || /<sitemap>/.test(xml);
  if (isIndex) {
    const blocks = xml.match(/<sitemap>[\s\S]*?<\/sitemap>/gi) ?? [];
    for (const block of blocks) {
      const parsed = extractLocFromBlock(block);
      if (parsed?.url) entries.push({ url: parsed.url, lastmod: parsed.lastmod, isIndex: true });
    }
    if (entries.length > 0) return entries;
  }

  // Parse regular <url> entries — extract <loc> from each <url> block
  const urlBlocks = xml.match(/<url>[\s\S]*?<\/url>/gi) ?? [];
  for (const block of urlBlocks) {
    const parsed = extractLocFromBlock(block);
    if (parsed?.url) entries.push({ url: parsed.url, lastmod: parsed.lastmod });
  }
  return entries;
}

export async function fetchSitemap(baseUrl: string): Promise<SitemapEntry[]> {
  const base = baseUrl.replace(/\/+$/, "");
  const candidates = [
    `${base}/sitemap.xml`,
    `${base}/sitemap_index.xml`,
    `${base}/wp-sitemap.xml`,
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/xml, text/xml" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const entries = parseSitemapXml(xml);
      if (entries.length > 0) return entries;
    } catch {
      continue;
    }
  }

  return [];
}
