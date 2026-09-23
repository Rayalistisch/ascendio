import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/encryption";
import { normalizeShopDomain, testConnection } from "@/lib/shopify";
import {
  exchangeShopifyCode,
  verifyShopifyHmac,
  verifyShopifyOAuthState,
} from "@/lib/shopify-oauth";

function redirectTo(request: Request, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.url));
}

function errorRedirect(request: Request, message: string): NextResponse {
  return redirectTo(request, `/sites/new?platform=shopify&error=${encodeURIComponent(message)}`);
}

// GET /api/shopify/oauth/callback
export async function GET(request: Request) {
  const url = new URL(request.url);
  const { searchParams } = url;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const shopParam = searchParams.get("shop");

  if (!code || !state || !shopParam) {
    return errorRedirect(request, "Onvolledig antwoord van Shopify.");
  }

  // 1. Verifieer dat het verzoek écht van Shopify komt.
  if (!verifyShopifyHmac(searchParams)) {
    return errorRedirect(request, "Beveiligingscontrole mislukt (HMAC).");
  }

  // 2. Verifieer de ondertekende state.
  const statePayload = verifyShopifyOAuthState(state);
  if (!statePayload) {
    return errorRedirect(request, "Ongeldige of verlopen OAuth-state.");
  }

  const shop = normalizeShopDomain(shopParam);
  if (shop !== statePayload.shop) {
    return errorRedirect(request, "Winkel komt niet overeen met de aanvraag.");
  }

  // 3. Controleer de ingelogde gebruiker.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirectTo(request, "/login");
  if (user.id !== statePayload.userId) {
    return errorRedirect(request, "Gebruiker komt niet overeen met de aanvraag.");
  }

  try {
    // 4. Wissel de code in voor een permanente access token.
    const { accessToken } = await exchangeShopifyCode(shop, code);

    // 5. Sanity-check + winkelnaam ophalen.
    const check = await testConnection({ shopDomain: shop, accessToken });
    const displayName = check.shopName || statePayload.name;

    // 6. Bestaande Shopify-site voor deze winkel bijwerken, anders aanmaken.
    const { data: existing } = await supabase
      .from("asc_sites")
      .select("id")
      .eq("user_id", user.id)
      .eq("platform", "shopify")
      .eq("shopify_shop_domain", shop)
      .maybeSingle();

    let siteId = existing?.id as string | undefined;

    if (siteId) {
      const { error } = await supabase
        .from("asc_sites")
        .update({ shopify_access_token_encrypted: encrypt(accessToken) })
        .eq("id", siteId)
        .eq("user_id", user.id);
      if (error) throw new Error(error.message);
    } else {
      const { data: inserted, error } = await supabase
        .from("asc_sites")
        .insert({
          user_id: user.id,
          name: statePayload.name || displayName,
          platform: "shopify",
          status: "active",
          shopify_shop_domain: shop,
          shopify_access_token_encrypted: encrypt(accessToken),
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      siteId = inserted.id;
    }

    return redirectTo(request, `/sites/${siteId}?status=connected`);
  } catch (err) {
    return errorRedirect(request, err instanceof Error ? err.message : "Koppeling mislukt.");
  }
}
