import { createHmac, randomBytes } from "crypto";

interface OAuthStatePayload {
  userId: string;
  siteId: string;
  nonce: string;
  exp: number;
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
}

function getStateSecret(): string {
  return process.env.GOOGLE_OAUTH_STATE_SECRET || process.env.APP_CRED_ENC_KEY || "";
}

function getGoogleClientId(): string {
  const value = process.env.GOOGLE_CLIENT_ID;
  if (!value) throw new Error("GOOGLE_CLIENT_ID ontbreekt");
  return value;
}

function getGoogleClientSecret(): string {
  const value = process.env.GOOGLE_CLIENT_SECRET;
  if (!value) throw new Error("GOOGLE_CLIENT_SECRET ontbreekt");
  return value;
}

function getAppUrl(): string {
  return process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export function getSearchConsoleRedirectUri(): string {
  return (
    process.env.GOOGLE_SEARCH_CONSOLE_REDIRECT_URI ||
    `${getAppUrl()}/api/search-console/callback`
  );
}

function signState(payloadBase64Url: string): string {
  const secret = getStateSecret();
  if (!secret) throw new Error("GOOGLE_OAUTH_STATE_SECRET (of APP_CRED_ENC_KEY) ontbreekt");
  return createHmac("sha256", secret).update(payloadBase64Url).digest("base64url");
}

export function createSearchConsoleOAuthState(input: {
  userId: string;
  siteId: string;
  expiresInSeconds?: number;
}): string {
  const payload: OAuthStatePayload = {
    userId: input.userId,
    siteId: input.siteId,
    nonce: randomBytes(12).toString("hex"),
    exp: Math.floor(Date.now() / 1000) + (input.expiresInSeconds || 900),
  };
  const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signState(payloadEncoded);
  return `${payloadEncoded}.${signature}`;
}

export function verifySearchConsoleOAuthState(state: string): OAuthStatePayload | null {
  const [payloadEncoded, signature] = state.split(".");
  if (!payloadEncoded || !signature) return null;
  const expected = signState(payloadEncoded);
  if (expected !== signature) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(payloadEncoded, "base64url").toString("utf8")
    ) as OAuthStatePayload;
    if (!payload.userId || !payload.siteId || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function buildSearchConsoleAuthUrl(state: string): string {
  const redirectUri = getSearchConsoleRedirectUri();
  const params = new URLSearchParams({
    client_id: getGoogleClientId(),
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    scope: [
      "openid",
      "email",
      "https://www.googleapis.com/auth/webmasters.readonly",
    ].join(" "),
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function parseGoogleError(response: Response): Promise<string> {
  const bodyText = await response.text();
  try {
    const bodyJson = JSON.parse(bodyText) as {
      error?: string | { message?: string };
      error_description?: string;
      error_message?: string;
    };
    if (typeof bodyJson.error === "object" && bodyJson.error?.message) {
      return bodyJson.error.message;
    }
    return (
      bodyJson.error_description ||
      bodyJson.error_message ||
      (typeof bodyJson.error === "string" ? bodyJson.error : bodyText)
    );
  } catch {
    return bodyText;
  }
}

export async function exchangeCodeForSearchConsoleTokens(
  code: string
): Promise<GoogleTokenResponse> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: getGoogleClientId(),
      client_secret: getGoogleClientSecret(),
      redirect_uri: getSearchConsoleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const err = await parseGoogleError(response);
    throw new Error(`Google token exchange mislukt: ${response.status} ${err}`);
  }
  return response.json();
}

export async function refreshSearchConsoleAccessToken(
  refreshToken: string
): Promise<GoogleTokenResponse> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getGoogleClientId(),
      client_secret: getGoogleClientSecret(),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const err = await parseGoogleError(response);
    throw new Error(`Google token refresh mislukt: ${response.status} ${err}`);
  }
  return response.json();
}

export async function fetchGoogleUserEmail(accessToken: string): Promise<string | null> {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { email?: string };
  return data.email || null;
}

export async function listSearchConsoleProperties(accessToken: string): Promise<
  Array<{ siteUrl: string; permissionLevel: string }>
> {
  const response = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const err = await parseGoogleError(response);
    throw new Error(`Search Console properties ophalen mislukt: ${response.status} ${err}`);
  }

  const data = (await response.json()) as {
    siteEntry?: Array<{ siteUrl: string; permissionLevel: string }>;
  };

  return (data.siteEntry || []).map((entry) => ({
    siteUrl: entry.siteUrl,
    permissionLevel: entry.permissionLevel,
  }));
}

export async function querySearchConsoleTopQueries(params: {
  accessToken: string;
  propertyUrl: string;
  startDate: string;
  endDate: string;
  rowLimit?: number;
}): Promise<Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>> {
  const rows = await querySearchConsoleRows({
    accessToken: params.accessToken,
    propertyUrl: params.propertyUrl,
    startDate: params.startDate,
    endDate: params.endDate,
    dimensions: ["query"],
    rowLimit: params.rowLimit || 10,
  });

  return rows.map((row) => ({
    query: row.keys[0] || "",
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  }));
}

export async function querySearchConsoleRows(params: {
  accessToken: string;
  propertyUrl: string;
  startDate: string;
  endDate: string;
  dimensions?: string[];
  rowLimit?: number;
  startRow?: number;
}): Promise<
  Array<{
    keys: string[];
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>
> {
  const response = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
      params.propertyUrl
    )}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate: params.startDate,
        endDate: params.endDate,
        dimensions: params.dimensions || [],
        rowLimit: params.rowLimit || 10,
        startRow: params.startRow || 0,
      }),
    }
  );

  if (!response.ok) {
    const err = await parseGoogleError(response);
    throw new Error(`Search Analytics query mislukt: ${response.status} ${err}`);
  }

  const data = (await response.json()) as {
    rows?: Array<{
      keys?: string[];
      clicks?: number;
      impressions?: number;
      ctr?: number;
      position?: number;
    }>;
  };

  return (data.rows || []).map((row) => ({
    keys: row.keys || [],
    clicks: row.clicks || 0,
    impressions: row.impressions || 0,
    ctr: row.ctr || 0,
    position: row.position || 0,
  }));
}

export function normalizeSiteUrlForSearchConsole(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  try {
    const parsed = new URL(trimmed);
    return `${parsed.origin}/`;
  } catch {
    return trimmed.replace(/\/+$/, "/");
  }
}
