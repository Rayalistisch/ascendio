import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";
import {
  listSearchConsoleProperties,
  querySearchConsoleTopQueries,
  refreshSearchConsoleAccessToken,
} from "@/lib/google-search-console";

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");
  const includeTopQueries = searchParams.get("includeTopQueries") === "1";
  const days = Number(searchParams.get("days") || "28");

  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  const { data: site } = await supabase
    .from("asc_sites")
    .select("id")
    .eq("id", siteId)
    .eq("user_id", user.id)
    .single();
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const { data: connection } = await supabase
    .from("asc_search_console_connections")
    .select("google_account_email, property_url, refresh_token_encrypted, scopes")
    .eq("site_id", siteId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!connection) {
    return NextResponse.json({
      connected: false,
      properties: [],
      topQueries: [],
    });
  }

  try {
    const refreshToken = decrypt(connection.refresh_token_encrypted);
    const token = await refreshSearchConsoleAccessToken(refreshToken);
    const properties = await listSearchConsoleProperties(token.access_token);

    let topQueries: Array<{
      query: string;
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    }> = [];

    if (includeTopQueries && connection.property_url) {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - Math.max(1, Math.min(days, 90)));

      topQueries = await querySearchConsoleTopQueries({
        accessToken: token.access_token,
        propertyUrl: connection.property_url,
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        rowLimit: 10,
      });
    }

    return NextResponse.json({
      connected: true,
      googleAccountEmail: connection.google_account_email,
      propertyUrl: connection.property_url,
      scopes: connection.scopes || [],
      properties,
      topQueries,
    });
  } catch (err) {
    return NextResponse.json(
      {
        connected: true,
        needsReconnect: true,
        error:
          err instanceof Error
            ? err.message
            : "Search Console data ophalen mislukt",
      },
      { status: 502 }
    );
  }
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { siteId, propertyUrl } = body as { siteId?: string; propertyUrl?: string };

  if (!siteId || !propertyUrl) {
    return NextResponse.json({ error: "Missing siteId or propertyUrl" }, { status: 400 });
  }

  const { data: connection } = await supabase
    .from("asc_search_console_connections")
    .select("refresh_token_encrypted")
    .eq("site_id", siteId)
    .eq("user_id", user.id)
    .single();
  if (!connection) {
    return NextResponse.json({ error: "Search Console not connected" }, { status: 404 });
  }

  try {
    const refreshToken = decrypt(connection.refresh_token_encrypted);
    const token = await refreshSearchConsoleAccessToken(refreshToken);
    const properties = await listSearchConsoleProperties(token.access_token);

    const exists = properties.some((property) => property.siteUrl === propertyUrl);
    if (!exists) {
      return NextResponse.json({ error: "Property is niet beschikbaar voor dit account" }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from("asc_search_console_connections")
      .update({
        property_url: propertyUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("site_id", siteId)
      .eq("user_id", user.id);

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Property opslaan mislukt" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  const { error } = await supabase
    .from("asc_search_console_connections")
    .delete()
    .eq("site_id", siteId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
