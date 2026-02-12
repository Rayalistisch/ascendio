export async function submitUrlForIndexing(
  url: string,
  serviceAccountJson: Record<string, string>,
  type: "URL_UPDATED" | "URL_DELETED" = "URL_UPDATED"
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get access token from service account
    const token = await getAccessToken(serviceAccountJson);

    const response = await fetch(
      "https://indexing.googleapis.com/v3/urlNotifications:publish",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url, type }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      return { success: false, error: `Google Indexing API: ${response.status} ${body.substring(0, 200)}` };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Indexing request failed",
    };
  }
}

export async function checkIndexingStatus(
  url: string,
  serviceAccountJson: Record<string, string>
): Promise<{ indexed: boolean; lastCrawled?: string; error?: string }> {
  try {
    const token = await getAccessToken(serviceAccountJson);

    const response = await fetch(
      `https://indexing.googleapis.com/v3/urlNotifications/metadata?url=${encodeURIComponent(url)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!response.ok) {
      return { indexed: false, error: `Status check failed: ${response.status}` };
    }

    const data = await response.json();
    return {
      indexed: !!data.latestUpdate,
      lastCrawled: data.latestUpdate?.notifyTime,
    };
  } catch (err) {
    return {
      indexed: false,
      error: err instanceof Error ? err.message : "Status check failed",
    };
  }
}

// Simple JWT-based access token generation for Google Service Account
async function getAccessToken(serviceAccount: Record<string, string>): Promise<string> {
  const { createSign } = await import("crypto");

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/indexing",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  ).toString("base64url");

  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(serviceAccount.private_key, "base64url");

  const jwt = `${header}.${payload}.${signature}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResponse.ok) {
    throw new Error(`Failed to get access token: ${tokenResponse.status}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}
