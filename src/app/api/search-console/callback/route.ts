import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/encryption";
import {
  exchangeCodeForSearchConsoleTokens,
  fetchGoogleUserEmail,
  listSearchConsoleProperties,
  normalizeSiteUrlForSearchConsole,
  verifySearchConsoleOAuthState,
} from "@/lib/google-search-console";

function buildSettingsRedirect(params: {
  siteId?: string;
  status: "connected" | "error";
  message?: string;
}): string {
  const q = new URLSearchParams();
  if (params.siteId) q.set("siteId", params.siteId);
  q.set("status", params.status);
  if (params.message) q.set("message", params.message);
  return `/settings/search-console?${q.toString()}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(
      new URL(
        buildSettingsRedirect({
          status: "error",
          message: `Google OAuth error: ${oauthError}`,
        }),
        request.url
      )
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(
        buildSettingsRedirect({
          status: "error",
          message: "Missing OAuth code/state",
        }),
        request.url
      )
    );
  }

  const statePayload = verifySearchConsoleOAuthState(state);
  if (!statePayload) {
    return NextResponse.redirect(
      new URL(
        buildSettingsRedirect({
          status: "error",
          message: "Ongeldige OAuth state",
        }),
        request.url
      )
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(
      new URL(
        buildSettingsRedirect({
          siteId: statePayload.siteId,
          status: "error",
          message: "Niet ingelogd",
        }),
        request.url
      )
    );
  }

  if (user.id !== statePayload.userId) {
    return NextResponse.redirect(
      new URL(
        buildSettingsRedirect({
          siteId: statePayload.siteId,
          status: "error",
          message: "OAuth state user mismatch",
        }),
        request.url
      )
    );
  }

  const { data: site } = await supabase
    .from("asc_sites")
    .select("id, wp_base_url")
    .eq("id", statePayload.siteId)
    .eq("user_id", user.id)
    .single();
  if (!site) {
    return NextResponse.redirect(
      new URL(
        buildSettingsRedirect({
          siteId: statePayload.siteId,
          status: "error",
          message: "Site niet gevonden",
        }),
        request.url
      )
    );
  }

  try {
    const tokenResponse = await exchangeCodeForSearchConsoleTokens(code);
    const googleEmail = await fetchGoogleUserEmail(tokenResponse.access_token);
    const properties = await listSearchConsoleProperties(tokenResponse.access_token);

    const { data: existingConnection } = await supabase
      .from("asc_search_console_connections")
      .select("refresh_token_encrypted, property_url")
      .eq("site_id", site.id)
      .eq("user_id", user.id)
      .maybeSingle();

    const refreshTokenEncrypted = tokenResponse.refresh_token
      ? encrypt(tokenResponse.refresh_token)
      : existingConnection?.refresh_token_encrypted;

    if (!refreshTokenEncrypted) {
      throw new Error(
        "Geen refresh token ontvangen van Google. Verwijder de app in Google account permissions en probeer opnieuw."
      );
    }

    const normalizedSiteUrl = normalizeSiteUrlForSearchConsole(site.wp_base_url);
    let siteHost = "";
    try {
      siteHost = new URL(normalizedSiteUrl).hostname.replace(/^www\./i, "");
    } catch {
      siteHost = normalizedSiteUrl.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/^www\./i, "");
    }

    const matchedProperty =
      properties.find((property) => property.siteUrl === normalizedSiteUrl) ||
      properties.find(
        (property) =>
          property.siteUrl.startsWith("sc-domain:") &&
          property.siteUrl.replace("sc-domain:", "").replace(/^www\./i, "") === siteHost
      );

    const propertyUrl =
      matchedProperty?.siteUrl ||
      existingConnection?.property_url ||
      properties[0]?.siteUrl ||
      null;

    const scopes = tokenResponse.scope
      ? tokenResponse.scope.split(" ").filter(Boolean)
      : [];

    const { error: upsertError } = await supabase
      .from("asc_search_console_connections")
      .upsert(
        {
          user_id: user.id,
          site_id: site.id,
          google_account_email: googleEmail,
          property_url: propertyUrl,
          refresh_token_encrypted: refreshTokenEncrypted,
          scopes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "site_id,user_id" }
      );

    if (upsertError) {
      throw new Error(upsertError.message);
    }

    return NextResponse.redirect(
      new URL(
        buildSettingsRedirect({
          siteId: site.id,
          status: "connected",
        }),
        request.url
      )
    );
  } catch (err) {
    return NextResponse.redirect(
      new URL(
        buildSettingsRedirect({
          siteId: site.id,
          status: "error",
          message: err instanceof Error ? err.message : "Koppeling mislukt",
        }),
        request.url
      )
    );
  }
}
