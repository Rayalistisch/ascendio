import type { GenerationSettings } from "@/lib/generation-settings";

const QSTASH_URL = process.env.QSTASH_URL || "https://qstash.upstash.io";
const QSTASH_TOKEN = process.env.QSTASH_TOKEN;

export async function enqueueGenerateJob(params: {
  runId: string;
  siteId: string;
  scheduleId?: string;
  userId: string;
  clusterId?: string;
  clusterTopicId?: string;
  templateId?: string;
  retryCount?: number;
  contentType?: string;
  generationSettings?: GenerationSettings;
}): Promise<{ messageId: string }> {
  return publishToQStash("/api/workers/generate-and-publish", params);
}

function getAppUrl(): string {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  if (process.env.APP_URL) {
    return process.env.APP_URL;
  }

  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  const localPort = process.env.PORT || "3000";
  return `http://localhost:${localPort}`;
}

function isLocalAppUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return url.includes("localhost") || url.includes("127.0.0.1");
  }
}

async function createLocalSignature(body: string): Promise<string | null> {
  const key = process.env.QSTASH_CURRENT_SIGNING_KEY || process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!key) return null;
  const { createHmac } = await import("crypto");
  return createHmac("sha256", key).update(body).digest("base64");
}

async function publishDirectFallback(
  path: string,
  payload: Record<string, unknown>,
  options?: { fireAndForget?: boolean }
): Promise<{ messageId: string }> {
  const destination = `${getAppUrl()}${path}`;
  const body = JSON.stringify(payload);
  const signature = await createLocalSignature(body);

  if (options?.fireAndForget) {
    void fetch(destination, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(signature ? { "upstash-signature": signature } : {}),
      },
      body,
    })
      .then(async (response) => {
        if (!response.ok) {
          const resBody = await response.text();
          console.error(`Direct async publish failed: ${response.status} ${resBody}`);
        }
      })
      .catch((err) => {
        console.error(`Direct async publish request failed: ${err instanceof Error ? err.message : "unknown"}`);
      });

    return { messageId: `local-${Date.now()}` };
  }

  const response = await fetch(destination, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(signature ? { "upstash-signature": signature } : {}),
    },
    body,
  });
  if (!response.ok) {
    const resBody = await response.text();
    throw new Error(`Direct publish failed: ${response.status} ${resBody}`);
  }
  return { messageId: `local-${Date.now()}` };
}

async function publishToQStash(
  path: string,
  payload: Record<string, unknown>,
  options?: { retries?: number; retryAfter?: number }
): Promise<{ messageId: string }> {
  const appUrl = getAppUrl();

  if (process.env.NODE_ENV !== "production" && isLocalAppUrl(appUrl)) {
    return publishDirectFallback(path, payload, { fireAndForget: true });
  }

  if (!QSTASH_TOKEN) {
    if (process.env.NODE_ENV !== "production") {
      return publishDirectFallback(path, payload, { fireAndForget: true });
    }
    throw new Error("QSTASH_TOKEN is not set");
  }

  const destination = `${appUrl}${path}`;
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
    if (process.env.NODE_ENV !== "production") {
      console.warn(`QStash publish failed (${response.status}); falling back to direct publish`);
      return publishDirectFallback(path, payload, { fireAndForget: true });
    }
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
