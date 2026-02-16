interface WPCredentials {
  baseUrl: string;
  username: string;
  appPassword: string;
}

interface WPRequestOptions {
  timeoutMs?: number;
}

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
  const response = await fetch(wpApiUrl(creds, "/media"), {
    method: "POST",
    headers: {
      Authorization: authHeader(creds),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "image/png",
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

// Fetch all published posts (paginated)
export async function fetchAllPosts(
  creds: WPCredentials,
  options?: { perPage?: number; fields?: string[]; maxPages?: number; timeoutMs?: number }
): Promise<Array<Record<string, any>>> {
  const perPage = options?.perPage || 100;
  const fields = options?.fields?.join(',') || 'id,title,slug,link,content,excerpt,featured_media,meta,status,date,modified';
  const maxPages = options?.maxPages;
  let page = 1;
  const allPosts: Array<Record<string, any>> = [];

  while (true) {
    if (maxPages && page > maxPages) break;

    const controller = options?.timeoutMs ? new AbortController() : undefined;
    const timeoutId = options?.timeoutMs
      ? setTimeout(() => controller?.abort(), options.timeoutMs)
      : undefined;

    const response = await fetch(
      wpApiUrl(creds, `/posts?per_page=${perPage}&page=${page}&status=publish&_fields=${fields}`),
      {
        headers: { Authorization: authHeader(creds), "Content-Type": "application/json" },
        signal: controller?.signal,
      }
    ).finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });
    if (!response.ok) break;
    const posts = await response.json();
    if (!Array.isArray(posts) || posts.length === 0) break;
    allPosts.push(...posts);
    const totalPages = parseInt(response.headers.get('X-WP-TotalPages') || '1', 10);
    if (page >= totalPages) break;
    page++;
  }
  return allPosts;
}

// Fetch a single post by ID
export async function fetchPost(
  creds: WPCredentials,
  postId: number,
  options?: WPRequestOptions
): Promise<Record<string, any>> {
  const controller = options?.timeoutMs ? new AbortController() : undefined;
  const timeoutId = options?.timeoutMs
    ? setTimeout(() => controller?.abort(), options.timeoutMs)
    : undefined;

  try {
    const response = await fetch(wpApiUrl(creds, `/posts/${postId}`), {
      headers: { Authorization: authHeader(creds), "Content-Type": "application/json" },
      signal: controller?.signal,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to fetch post: ${response.status} ${body.substring(0, 200)}`);
    }
    return response.json();
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
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

// Update an existing post
export async function updatePost(
  creds: WPCredentials,
  postId: number,
  updates: {
    title?: string;
    content?: string;
    excerpt?: string;
    meta?: Record<string, string>;
    status?: string;
  }
): Promise<{ id: number; url: string }> {
  const response = await fetch(wpApiUrl(creds, `/posts/${postId}`), {
    method: "POST",
    headers: { Authorization: authHeader(creds), "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to update post: ${response.status} ${body.substring(0, 200)}`);
  }
  const post = await response.json();
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
