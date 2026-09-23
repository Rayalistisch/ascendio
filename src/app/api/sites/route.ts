import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/encryption";
import { normalizeShopDomain } from "@/lib/shopify";

// Nooit cachen: de lijst moet direct nieuwe/gewijzigde sites tonen.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("asc_sites")
    .select("id, name, platform, wp_base_url, wp_username, ibvision_base_url, shopify_shop_domain, status, created_at, default_language, tone_of_voice, acf_content_fields, sitemap_url, is_elementor_site, publish_as_draft, content_profile")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ sites: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const {
    name,
    platform = "wordpress",
    wpBaseUrl, wpUsername, wpAppPassword,
    ibvisionBaseUrl, ibvisionApiKey, ibvisionUrlPrefix,
    shopifyShopDomain, shopifyAccessToken, shopifyBlogId,
  } = body;

  if (!name) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  let insertData: Record<string, unknown> = { user_id: user.id, name, platform, status: "active" };

  if (platform === "shopify") {
    if (!shopifyShopDomain || !shopifyAccessToken) {
      return NextResponse.json({ error: "Shopify winkeldomein en access token zijn verplicht" }, { status: 400 });
    }
    insertData = {
      ...insertData,
      shopify_shop_domain: normalizeShopDomain(shopifyShopDomain),
      shopify_access_token_encrypted: encrypt(shopifyAccessToken),
      shopify_blog_id: shopifyBlogId ? Number(shopifyBlogId) : null,
    };
  } else if (platform === "ibvision") {
    if (!ibvisionBaseUrl || !ibvisionApiKey) {
      return NextResponse.json({ error: "IBVision URL en API key zijn verplicht" }, { status: 400 });
    }
    insertData = {
      ...insertData,
      ibvision_base_url: ibvisionBaseUrl.replace(/\/+$/, ""),
      ibvision_api_key_encrypted: encrypt(ibvisionApiKey),
      ibvision_url_prefix: ibvisionUrlPrefix || "/",
    };
  } else {
    if (!wpBaseUrl || !wpUsername || !wpAppPassword) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    insertData = {
      ...insertData,
      wp_base_url: wpBaseUrl.replace(/\/+$/, ""),
      wp_username: wpUsername,
      wp_app_password_encrypted: encrypt(wpAppPassword),
    };
  }

  const { data, error } = await supabase
    .from("asc_sites")
    .insert(insertData)
    .select("id, name, platform, wp_base_url, wp_username, ibvision_base_url, shopify_shop_domain, status, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ site: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id, name, toneOfVoice, acfContentFields, sitemapUrl, isElementorSite, publishAsDraft, wpBaseUrl, wpUsername, wpAppPassword, shopifyShopDomain, shopifyAccessToken, shopifyBlogId } = body;
  if (!id) return NextResponse.json({ error: "Missing site id" }, { status: 400 });

  if (toneOfVoice !== undefined && toneOfVoice !== null && typeof toneOfVoice !== "object") {
    return NextResponse.json({ error: "Invalid toneOfVoice format" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined && typeof name === "string" && name.trim()) updates.name = name.trim();
  if (toneOfVoice !== undefined) updates.tone_of_voice = toneOfVoice ?? null;
  if (acfContentFields !== undefined) updates.acf_content_fields = acfContentFields || null;
  if (sitemapUrl !== undefined) updates.sitemap_url = sitemapUrl || null;
  if (isElementorSite !== undefined) updates.is_elementor_site = Boolean(isElementorSite);
  if (publishAsDraft !== undefined) updates.publish_as_draft = Boolean(publishAsDraft);

  // WordPress-verbinding bijwerken (bijv. als de site is verhuisd of het
  // app-wachtwoord is vernieuwd). Het wachtwoord wordt alleen overschreven als
  // er een niet-lege waarde is meegegeven — leeg laten = huidige behouden.
  if (typeof wpBaseUrl === "string" && wpBaseUrl.trim()) {
    updates.wp_base_url = wpBaseUrl.trim().replace(/\/+$/, "");
  }
  if (typeof wpUsername === "string" && wpUsername.trim()) {
    updates.wp_username = wpUsername.trim();
  }
  if (typeof wpAppPassword === "string" && wpAppPassword.trim()) {
    updates.wp_app_password_encrypted = encrypt(wpAppPassword.trim());
  }

  // Shopify-verbinding bijwerken. Token alleen overschrijven bij een niet-lege waarde.
  if (typeof shopifyShopDomain === "string" && shopifyShopDomain.trim()) {
    updates.shopify_shop_domain = normalizeShopDomain(shopifyShopDomain.trim());
  }
  if (typeof shopifyAccessToken === "string" && shopifyAccessToken.trim()) {
    updates.shopify_access_token_encrypted = encrypt(shopifyAccessToken.trim());
  }
  if (shopifyBlogId !== undefined) {
    updates.shopify_blog_id = shopifyBlogId ? Number(shopifyBlogId) : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Geen wijzigingen opgegeven" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("asc_sites")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, name, platform, wp_base_url, wp_username, shopify_shop_domain, status, created_at, default_language, tone_of_voice, acf_content_fields, sitemap_url, is_elementor_site, publish_as_draft, content_profile")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ site: data });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("id");
  if (!siteId) return NextResponse.json({ error: "Missing site id" }, { status: 400 });

  const { error } = await supabase
    .from("asc_sites")
    .delete()
    .eq("id", siteId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
