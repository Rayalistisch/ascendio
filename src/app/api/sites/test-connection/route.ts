import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { testConnection } from "@/lib/wordpress";
import { testConnection as testShopifyConnection } from "@/lib/shopify";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { platform, wpBaseUrl, wpUsername, wpAppPassword, ibvisionBaseUrl, ibvisionApiKey, shopifyShopDomain, shopifyAccessToken } = body;

  if (platform === "shopify") {
    if (!shopifyShopDomain || !shopifyAccessToken) {
      return NextResponse.json({ error: "Shopify winkeldomein en access token zijn verplicht" }, { status: 400 });
    }
    const result = await testShopifyConnection({ shopDomain: shopifyShopDomain, accessToken: shopifyAccessToken });
    return NextResponse.json(
      result.success
        ? { success: true, displayName: result.shopName }
        : { success: false, error: result.error }
    );
  }

  if (platform === "ibvision") {
    if (!ibvisionBaseUrl || !ibvisionApiKey) {
      return NextResponse.json({ error: "IBVision URL en API key zijn verplicht" }, { status: 400 });
    }

    try {
      const endpoint = `${ibvisionBaseUrl.replace(/\/+$/, "")}/api/v1/seocontent`;
      // Use POST with a dry-run payload — IBVision checks auth before method/body validation,
      // so a valid key will return something other than 401/403 even if the payload is incomplete.
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "X-API-Key": ibvisionApiKey, "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ url: "/__test__", publish: false, language: "NL", content: "" }),
      });
      if (res.status === 401 || res.status === 403) {
        return NextResponse.json({ success: false, error: "Ongeldige API key" });
      }
      // Any other response (200, 400, 422, 500…) means auth passed — server is reachable and key is accepted
      return NextResponse.json({ success: true });
    } catch {
      return NextResponse.json({ success: false, error: "Kon de IBVision server niet bereiken. Controleer de URL." });
    }
  }

  if (!wpBaseUrl || !wpUsername || !wpAppPassword) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const result = await testConnection({
    baseUrl: wpBaseUrl,
    username: wpUsername,
    appPassword: wpAppPassword,
  });

  return NextResponse.json(result);
}
