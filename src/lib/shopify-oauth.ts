import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { normalizeShopDomain } from "@/lib/shopify";

// Shopify OAuth (authorization code grant) for connecting a store without
// manually copying an Admin API access token. Mirrors the Google Search Console
// OAuth pattern in src/lib/google-search-console.ts: the state is an
// HMAC-signed, self-contained payload (no cookie/DB round-trip needed).

// write_content grants read + write on blogs, articles and pages.
export const SHOPIFY_SCOPES = "write_content";

interface ShopifyOAuthStatePayload {
  userId: string;
  shop: string; // normalized myshopify domain
  name: string; // desired site name
  nonce: string;
  exp: number;
}

function getStateSecret(): string {
  return process.env.SHOPIFY_OAUTH_STATE_SECRET || process.env.APP_CRED_ENC_KEY || "";
}

export function getShopifyApiKey(): string {
  const value = process.env.SHOPIFY_API_KEY;
  if (!value) throw new Error("SHOPIFY_API_KEY ontbreekt");
  return value;
}

function getShopifyApiSecret(): string {
  const value = process.env.SHOPIFY_API_SECRET;
  if (!value) throw new Error("SHOPIFY_API_SECRET ontbreekt");
  return value;
}

function getAppUrl(): string {
  // OAuth redirect_uri moet stabiel zijn en exact matchen met de Allowed
  // redirection URL in Shopify. VERCEL_URL wisselt per deploy, dus die pakken
  // we alleen als laatste redmiddel — bij voorkeur het vaste app-domein.
  return (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

export function getShopifyRedirectUri(): string {
  return (
    process.env.SHOPIFY_OAUTH_REDIRECT_URI ||
    `${getAppUrl()}/api/shopify/oauth/callback`
  );
}

/** Only allow genuine *.myshopify.com domains — prevents open-redirect / SSRF. */
export function isValidShopDomain(shop: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(normalizeShopDomain(shop));
}

// --- Signed state ---------------------------------------------------------

function signState(payloadBase64Url: string): string {
  const secret = getStateSecret();
  if (!secret) throw new Error("SHOPIFY_OAUTH_STATE_SECRET (of APP_CRED_ENC_KEY) ontbreekt");
  return createHmac("sha256", secret).update(payloadBase64Url).digest("base64url");
}

export function createShopifyOAuthState(input: {
  userId: string;
  shop: string;
  name: string;
  expiresInSeconds?: number;
}): string {
  const payload: ShopifyOAuthStatePayload = {
    userId: input.userId,
    shop: normalizeShopDomain(input.shop),
    name: input.name,
    nonce: randomBytes(12).toString("hex"),
    exp: Math.floor(Date.now() / 1000) + (input.expiresInSeconds || 900),
  };
  const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadEncoded}.${signState(payloadEncoded)}`;
}

export function verifyShopifyOAuthState(state: string): ShopifyOAuthStatePayload | null {
  const [payloadEncoded, signature] = state.split(".");
  if (!payloadEncoded || !signature) return null;
  if (signState(payloadEncoded) !== signature) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(payloadEncoded, "base64url").toString("utf8")
    ) as ShopifyOAuthStatePayload;
    if (!payload.userId || !payload.shop || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// --- Authorize URL --------------------------------------------------------

export function buildShopifyAuthUrl(shop: string, state: string): string {
  const domain = normalizeShopDomain(shop);
  const params = new URLSearchParams({
    client_id: getShopifyApiKey(),
    scope: SHOPIFY_SCOPES,
    redirect_uri: getShopifyRedirectUri(),
    state,
  });
  return `https://${domain}/admin/oauth/authorize?${params.toString()}`;
}

// --- Callback verification ------------------------------------------------

/**
 * Verify the HMAC Shopify appends to the callback, proving the request really
 * came from Shopify and wasn't tampered with.
 */
export function verifyShopifyHmac(searchParams: URLSearchParams): boolean {
  const hmac = searchParams.get("hmac");
  if (!hmac) return false;

  const entries: [string, string][] = [];
  searchParams.forEach((value, key) => {
    if (key === "hmac" || key === "signature") return;
    entries.push([key, value]);
  });
  entries.sort(([a], [b]) => a.localeCompare(b));
  const message = entries.map(([k, v]) => `${k}=${v}`).join("&");

  const digest = createHmac("sha256", getShopifyApiSecret()).update(message).digest("hex");
  try {
    const a = Buffer.from(digest, "utf8");
    const b = Buffer.from(hmac, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// --- Token exchange -------------------------------------------------------

export async function exchangeShopifyCode(
  shop: string,
  code: string
): Promise<{ accessToken: string; scope: string }> {
  const domain = normalizeShopDomain(shop);
  const response = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: getShopifyApiKey(),
      client_secret: getShopifyApiSecret(),
      code,
    }),
  });
  if (!response.ok) {
    throw new Error(`Token-uitwisseling met Shopify mislukt: ${response.status} ${await response.text()}`);
  }
  const data = await response.json();
  if (!data?.access_token) {
    throw new Error("Geen access token ontvangen van Shopify.");
  }
  return { accessToken: data.access_token, scope: data.scope || "" };
}
