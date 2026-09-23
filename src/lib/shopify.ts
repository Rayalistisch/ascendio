// Shopify Admin REST API client.
//
// Auth model: "custom app" access tokens. The user creates a custom app in
// their own Shopify admin (Settings → Apps and sales channels → Develop apps),
// grants it write_content scope, installs it, and copies the Admin API access
// token. We store that token (encrypted) plus the store's myshopify domain.
//
// This mirrors src/lib/wordpress.ts / src/lib/ibvision.ts so the publishing
// worker can treat Shopify as a third `platform` value.

// Pin a stable Admin API version. Shopify keeps versions live for ~1 year;
// bump this periodically.
const API_VERSION = "2025-01";

export interface ShopifyCredentials {
  /** The store's myshopify domain, e.g. "mystore.myshopify.com". */
  shopDomain: string;
  /** Decrypted Admin API access token (shpat_...). */
  accessToken: string;
  /** Optional: publish articles to this blog. Falls back to the first blog. */
  blogId?: number | null;
}

/** Strip protocol, paths and trailing slashes so only the bare host remains. */
export function normalizeShopDomain(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function apiUrl(creds: ShopifyCredentials, path: string): string {
  const domain = normalizeShopDomain(creds.shopDomain);
  return `https://${domain}/admin/api/${API_VERSION}${path}`;
}

function authHeaders(creds: ShopifyCredentials): Record<string, string> {
  return {
    "X-Shopify-Access-Token": creds.accessToken,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/** Shopify articles/pages can't host inline media, so drop our placeholders. */
function stripPlaceholders(html: string): string {
  return html
    .replace(/<!--\s*IMAGE:[\s\S]*?-->/gi, "")
    .replace(/<!--\s*YOUTUBE:[\s\S]*?-->/gi, "");
}

// ---------------------------------------------------------------------------
// Connection test
// ---------------------------------------------------------------------------

export async function testConnection(
  creds: ShopifyCredentials
): Promise<{ success: boolean; shopName?: string; error?: string }> {
  try {
    const res = await fetch(apiUrl(creds, "/shop.json"), {
      headers: authHeaders(creds),
    });
    if (res.status === 401 || res.status === 403) {
      return { success: false, error: "Ongeldig access token of onvoldoende rechten (write_content vereist)." };
    }
    if (res.status === 404) {
      return { success: false, error: "Winkel niet gevonden. Controleer het winkeldomein (bijv. mijnwinkel.myshopify.com)." };
    }
    if (!res.ok) {
      return { success: false, error: `Shopify gaf status ${res.status}.` };
    }
    const data = await res.json();
    return { success: true, shopName: data?.shop?.name };
  } catch {
    return { success: false, error: "Kon de Shopify-winkel niet bereiken. Controleer het winkeldomein." };
  }
}

// ---------------------------------------------------------------------------
// Blog resolution (articles are nested under a blog)
// ---------------------------------------------------------------------------

interface ShopifyBlog {
  id: number;
  handle: string;
  title: string;
}

/**
 * Resolve which blog to publish to. Uses creds.blogId when set, otherwise the
 * store's first blog. Returns id + handle (handle is needed for storefront URLs).
 */
export async function resolveBlog(creds: ShopifyCredentials): Promise<ShopifyBlog> {
  const res = await fetch(apiUrl(creds, "/blogs.json?limit=50"), {
    headers: authHeaders(creds),
  });
  if (!res.ok) {
    throw new Error(`Shopify blogs ophalen mislukt: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const blogs: ShopifyBlog[] = data?.blogs ?? [];
  if (blogs.length === 0) {
    throw new Error(
      "Geen blog gevonden in Shopify. Maak eerst een blog aan via Online Store → Blog posts → Manage blogs."
    );
  }
  if (creds.blogId) {
    const match = blogs.find((b) => b.id === creds.blogId);
    if (match) return match;
  }
  return blogs[0];
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

export interface ShopifyPublishResult {
  /** Article or page id. */
  id: number;
  /** Best-effort storefront URL. */
  url: string;
  handle: string;
}

export async function createArticle(
  creds: ShopifyCredentials,
  params: {
    title: string;
    bodyHtml: string;
    summaryHtml?: string;
    author?: string;
    tags?: string;
    published: boolean;
    slug?: string;
    /** Base64-encoded image bytes (no data: prefix) for the article image. */
    imageAttachmentBase64?: string | null;
    imageAlt?: string;
  }
): Promise<ShopifyPublishResult> {
  const blog = await resolveBlog(creds);
  const domain = normalizeShopDomain(creds.shopDomain);

  const article: Record<string, unknown> = {
    title: params.title,
    body_html: stripPlaceholders(params.bodyHtml),
    published: params.published,
  };
  if (params.summaryHtml) article.summary_html = params.summaryHtml;
  if (params.author) article.author = params.author;
  if (params.tags) article.tags = params.tags;
  if (params.slug) article.handle = slugify(params.slug);
  if (params.imageAttachmentBase64) {
    article.image = {
      attachment: params.imageAttachmentBase64,
      alt: params.imageAlt || params.title,
    };
  }

  const res = await fetch(apiUrl(creds, `/blogs/${blog.id}/articles.json`), {
    method: "POST",
    headers: authHeaders(creds),
    body: JSON.stringify({ article }),
  });
  if (!res.ok) {
    throw new Error(`Shopify artikel aanmaken mislukt: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const a = data?.article;
  if (!a?.id) {
    throw new Error(`Shopify gaf onverwacht antwoord: ${JSON.stringify(data)}`);
  }
  return {
    id: a.id,
    handle: a.handle,
    url: `https://${domain}/blogs/${blog.handle}/${a.handle}`,
  };
}

export async function createPage(
  creds: ShopifyCredentials,
  params: {
    title: string;
    bodyHtml: string;
    published: boolean;
    slug?: string;
  }
): Promise<ShopifyPublishResult> {
  const domain = normalizeShopDomain(creds.shopDomain);

  const page: Record<string, unknown> = {
    title: params.title,
    body_html: stripPlaceholders(params.bodyHtml),
    published: params.published,
  };
  if (params.slug) page.handle = slugify(params.slug);

  const res = await fetch(apiUrl(creds, "/pages.json"), {
    method: "POST",
    headers: authHeaders(creds),
    body: JSON.stringify({ page }),
  });
  if (!res.ok) {
    throw new Error(`Shopify pagina aanmaken mislukt: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const p = data?.page;
  if (!p?.id) {
    throw new Error(`Shopify gaf onverwacht antwoord: ${JSON.stringify(data)}`);
  }
  return {
    id: p.id,
    handle: p.handle,
    url: `https://${domain}/pages/${p.handle}`,
  };
}

// ---------------------------------------------------------------------------
// Draft → live (flip a previously created draft to published)
// ---------------------------------------------------------------------------

export async function publishArticle(
  creds: ShopifyCredentials,
  articleId: number
): Promise<void> {
  const blog = await resolveBlog(creds);
  const res = await fetch(apiUrl(creds, `/blogs/${blog.id}/articles/${articleId}.json`), {
    method: "PUT",
    headers: authHeaders(creds),
    body: JSON.stringify({ article: { id: articleId, published: true } }),
  });
  if (!res.ok) {
    throw new Error(`Shopify artikel publiceren mislukt: ${res.status} ${await res.text()}`);
  }
}

export async function publishPage(
  creds: ShopifyCredentials,
  pageId: number
): Promise<void> {
  const res = await fetch(apiUrl(creds, `/pages/${pageId}.json`), {
    method: "PUT",
    headers: authHeaders(creds),
    body: JSON.stringify({ page: { id: pageId, published: true } }),
  });
  if (!res.ok) {
    throw new Error(`Shopify pagina publiceren mislukt: ${res.status} ${await res.text()}`);
  }
}
