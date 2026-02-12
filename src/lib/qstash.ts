const QSTASH_URL = process.env.QSTASH_URL || "https://qstash.upstash.io";
const QSTASH_TOKEN = process.env.QSTASH_TOKEN;

export async function enqueueGenerateJob(params: {
  runId: string;
  siteId: string;
  scheduleId: string;
  userId: string;
  retryCount?: number;
}): Promise<{ messageId: string }> {
  return publishToQStash("/api/workers/generate-and-publish", params);
}

function getAppUrl(): string {
  return process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

async function publishToQStash(
  path: string,
  payload: Record<string, unknown>,
  options?: { retries?: number; retryAfter?: number }
): Promise<{ messageId: string }> {
  if (!QSTASH_TOKEN) throw new Error("QSTASH_TOKEN is not set");

  const destination = `${getAppUrl()}${path}`;
  const response = await fetch(`${QSTASH_URL}/v2/publish/${destination}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${QSTASH_TOKEN}`,
      "Content-Type": "application/json",
      "Upstash-Retries": String(options?.retries ?? 3),
      "Upstash-Retry-After": String(options?.retryAfter ?? 60),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`QStash publish failed: ${response.status} ${body}`);
  }

  const result = await response.json();
  return { messageId: result.messageId };
}

export async function enqueueSourceFetchJob(params: {
  sourceId: string;
  siteId: string;
  userId: string;
}): Promise<{ messageId: string }> {
  return publishToQStash("/api/workers/fetch-sources", params);
}

export async function enqueueScanJob(params: {
  reportId: string;
  siteId: string;
  userId: string;
}): Promise<{ messageId: string }> {
  return publishToQStash("/api/workers/scan-site", params, { retries: 2, retryAfter: 120 });
}

export async function enqueueSeoFixJob(params: {
  issueId: string;
  siteId: string;
  userId: string;
}): Promise<{ messageId: string }> {
  return publishToQStash("/api/workers/fix-seo-issue", params);
}

export async function enqueueSocialPostJob(params: {
  socialPostId: string;
  siteId: string;
  userId: string;
}): Promise<{ messageId: string }> {
  return publishToQStash("/api/workers/social-post", params);
}

export async function enqueueIndexingJob(params: {
  requestId: string;
  siteId: string;
  userId: string;
}): Promise<{ messageId: string }> {
  return publishToQStash("/api/workers/google-indexing", params);
}

export async function verifyQStashSignature(
  signature: string | null,
  body: string
): Promise<boolean> {
  // In production, verify QStash signatures
  // For local dev, skip verification if keys aren't set
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY;

  if (!currentKey || !nextKey) {
    console.warn("QStash signing keys not set — skipping signature verification");
    return true;
  }

  if (!signature) return false;

  const { createHmac } = await import("crypto");

  for (const key of [currentKey, nextKey]) {
    const expected = createHmac("sha256", key).update(body).digest("base64");
    if (expected === signature) return true;
  }

  return false;
}
