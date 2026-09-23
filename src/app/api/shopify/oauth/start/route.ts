import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildShopifyAuthUrl,
  createShopifyOAuthState,
  isValidShopDomain,
} from "@/lib/shopify-oauth";
import { normalizeShopDomain } from "@/lib/shopify";

// GET /api/shopify/oauth/start?shop=...&name=...
// Start de Shopify OAuth-flow: valideer de winkel, bouw een ondertekende state
// en stuur de gebruiker door naar het autorisatiescherm van Shopify.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const shopRaw = searchParams.get("shop") || "";
  const name = (searchParams.get("name") || "").trim();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const shop = normalizeShopDomain(shopRaw);
  if (!isValidShopDomain(shop)) {
    return NextResponse.redirect(
      new URL(`/sites/new?platform=shopify&error=${encodeURIComponent("Ongeldig winkeldomein. Gebruik de vorm mijnwinkel.myshopify.com")}`, request.url)
    );
  }

  const state = createShopifyOAuthState({
    userId: user.id,
    shop,
    name: name || shop.replace(/\.myshopify\.com$/, ""),
  });

  return NextResponse.redirect(buildShopifyAuthUrl(shop, state));
}
