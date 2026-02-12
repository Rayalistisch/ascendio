interface WPCredentials {
  baseUrl: string;
  username: string;
  appPassword: string;
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
    featuredMediaId: number;
    status?: "publish" | "draft";
  }
): Promise<{ id: number; url: string }> {
  const response = await fetch(wpApiUrl(creds, "/posts"), {
    method: "POST",
    headers: {
      Authorization: authHeader(creds),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: params.title,
      content: params.content,
      excerpt: params.excerpt,
      featured_media: params.featuredMediaId,
      status: params.status || "publish",
    }),
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
  options?: { perPage?: number; fields?: string[] }
): Promise<Array<Record<string, any>>> {
  const perPage = options?.perPage || 100;
  const fields = options?.fields?.join(',') || 'id,title,slug,link,content,excerpt,featured_media,meta,status,date,modified';
  let page = 1;
  const allPosts: Array<Record<string, any>> = [];

  while (true) {
    const response = await fetch(
      wpApiUrl(creds, `/posts?per_page=${perPage}&page=${page}&status=publish&_fields=${fields}`),
      { headers: { Authorization: authHeader(creds), "Content-Type": "application/json" } }
    );
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
  postId: number
): Promise<Record<string, any>> {
  const response = await fetch(wpApiUrl(creds, `/posts/${postId}`), {
    headers: { Authorization: authHeader(creds), "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to fetch post: ${response.status} ${body.substring(0, 200)}`);
  }
  return response.json();
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
