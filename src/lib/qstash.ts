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
  // Prefer explicitly configured URLs over auto-detected Vercel URLs.
  // VERCEL_URL is deployment-specific (changes per deploy, may have protection enabled).
  // VERCEL_PROJECT_PRODUCTION_URL is the stable production URL.
  let url: string | undefined;

  if (process.env.APP_URL) {
    url = process.env.APP_URL;
  } else if (process.env.NEXT_PUBLIC_APP_URL) {
    url = process.env.NEXT_PUBLIC_APP_URL;
  } else if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    url = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  } else if (process.env.VERCEL_URL) {
    url = `https://${process.env.VERCEL_URL}`;
  } else {
    const localPort = process.env.PORT || "3000";
    url = `http://localhost:${localPort}`;
  }

  // Strip trailing slash to prevent double-slash in URLs like https://example.com//api/...
  return url.replace(/\/$/, "");
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
    console.log(`[qstash] fire-and-forget → ${destination}`);
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
          console.error(`[qstash] Direct async publish failed: ${response.status} ${resBody}`);
        } else {
          console.log(`[qstash] Worker response OK: ${response.status}`);
        }
      })
      .catch((err) => {
        console.error(`[qstash] Direct async publish request failed: ${err instanceof Error ? err.message : "unknown"}`);
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
  console.log(`[qstash] Publiceren naar: ${destination}`);

  // If Vercel Deployment Protection is enabled, QStash needs the bypass secret.
  // Set VERCEL_AUTOMATION_BYPASS_SECRET in Vercel env vars (from project Settings → Deployment Protection).
  const vercelBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

  const qstashHeaders: Record<string, string> = {
    Authorization: `Bearer ${QSTASH_TOKEN}`,
    "Content-Type": "application/json",
    "Upstash-Retries": String(options?.retries ?? 3),
    "Upstash-Retry-After": String(options?.retryAfter ?? 60),
  };

  if (vercelBypassSecret) {
    // QStash forwards headers prefixed with "Upstash-Forward-" to the destination.
    qstashHeaders["Upstash-Forward-x-vercel-protection-bypass"] = vercelBypassSecret;
    console.log("[qstash] Vercel protection bypass header toegevoegd");
  }

  const response = await fetch(`${QSTASH_URL}/v2/publish/${destination}`, {
    method: "POST",
    headers: qstashHeaders,
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

  // Diagnostic escape hatch: set QSTASH_SKIP_VERIFICATION=true in Vercel to bypass signature check.
  // Only use temporarily to diagnose delivery issues. Remove after verification works.
  if (process.env.QSTASH_SKIP_VERIFICATION === "true") {
    console.warn("[qstash] WAARSCHUWING: QSTASH_SKIP_VERIFICATION=true — handtekening verificatie overgeslagen!");
    return true;
  }

  if (!currentKey || !nextKey) {
    // Signing keys not configured — allow the request but log a clear warning.
    // Fix: add QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY to Vercel env vars.
    console.warn(
      "[qstash] WAARSCHUWING: QSTASH_CURRENT_SIGNING_KEY / QSTASH_NEXT_SIGNING_KEY niet ingesteld. " +
      "Handtekening verificatie overgeslagen. Voeg deze toe aan Vercel Environment Variables."
    );
    return true;
  }

  if (!signature) {
    console.warn("[qstash] Geen upstash-signature header — verzoek geweigerd");
    return false;
  }

  const { createHmac, createHash } = await import("crypto");

  // QStash v2 sends JWT signatures (3 dot-separated parts).
  // Local dev fire-and-forget uses a raw HMAC-SHA256 base64 string.
  const parts = signature.split(".");
  const isJwt = parts.length === 3;
  console.log(`[qstash] Handtekening type: ${isJwt ? "JWT (QStash v2)" : "HMAC (lokaal)"}, lengte: ${signature.length}`);

  if (isJwt) {
    // Verify QStash v2 JWT: HS256 signature over "header.payload",
    // with payload.body = SHA-256 of request body (base64url).
    const [headerB64, payloadB64, sigB64] = parts;
    const message = `${headerB64}.${payloadB64}`;

    for (const [idx, key] of [currentKey, nextKey].entries()) {
      const expectedSig = createHmac("sha256", key)
        .update(message)
        .digest("base64url");

      const sigMatch = expectedSig === sigB64;
      if (!sigMatch) {
        console.warn(`[qstash] JWT HMAC mismatch voor sleutel ${idx + 1}`);
        continue;
      }

      try {
        const payload = JSON.parse(
          Buffer.from(payloadB64, "base64url").toString("utf8")
        );
        // Check expiry
        if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
          console.warn(`[qstash] JWT verlopen (exp=${payload.exp}, nu=${Math.floor(Date.now() / 1000)})`);
          continue;
        }
        // Verify body hash
        const bodyHash = createHash("sha256").update(body).digest("base64url");
        const bodyMatch = payload.body === bodyHash;
        if (!bodyMatch) {
          console.warn(`[qstash] Body hash mismatch — verwacht: ${payload.body}, berekend: ${bodyHash}`);
          continue;
        }
        console.log("[qstash] Handtekening geldig ✓");
        return true;
      } catch (e) {
        console.warn(`[qstash] JWT payload parse fout: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
    }
    console.warn("[qstash] JWT verificatie mislukt voor alle sleutels — verzoek geweigerd");
    return false;
  }

  // Local dev: raw HMAC-SHA256 base64 (generated by createLocalSignature)
  for (const key of [currentKey, nextKey]) {
    const expected = createHmac("sha256", key).update(body).digest("base64");
    if (expected === signature) return true;
  }

  console.warn("[qstash] HMAC verificatie mislukt — verzoek geweigerd");
  return false;
}
