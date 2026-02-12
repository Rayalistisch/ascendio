import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_SOURCE_TYPES = ["rss", "keywords", "youtube", "news"] as const;

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");

  if (!siteId) {
    return NextResponse.json({ error: "Missing siteId parameter" }, { status: 400 });
  }

  const { data: sources, error } = await supabase
    .from("asc_content_sources")
    .select("id, site_id, source_type, config, is_enabled, last_fetched_at, created_at")
    .eq("user_id", user.id)
    .eq("site_id", siteId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch item counts per source
  const sourceIds = (sources ?? []).map((s) => s.id);

  let itemCounts: Record<string, number> = {};

  if (sourceIds.length > 0) {
    const { data: counts, error: countError } = await supabase
      .from("asc_source_items")
      .select("source_id")
      .in("source_id", sourceIds);

    if (!countError && counts) {
      itemCounts = counts.reduce<Record<string, number>>((acc, row) => {
        acc[row.source_id] = (acc[row.source_id] || 0) + 1;
        return acc;
      }, {});
    }
  }

  const sourcesWithCounts = (sources ?? []).map((source) => ({
    ...source,
    item_count: itemCounts[source.id] || 0,
  }));

  return NextResponse.json({ sources: sourcesWithCounts });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { siteId, sourceType, config } = body;

  if (!siteId || !sourceType || !config) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!ALLOWED_SOURCE_TYPES.includes(sourceType)) {
    return NextResponse.json(
      { error: `Invalid sourceType. Allowed: ${ALLOWED_SOURCE_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // Verify user owns the site
  const { data: site } = await supabase
    .from("asc_sites")
    .select("id")
    .eq("id", siteId)
    .eq("user_id", user.id)
    .single();

  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("asc_content_sources")
    .insert({
      user_id: user.id,
      site_id: siteId,
      source_type: sourceType,
      config,
      is_enabled: true,
    })
    .select("id, site_id, source_type, config, is_enabled, last_fetched_at, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ source: data }, { status: 201 });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { sourceId } = body;

  if (!sourceId) {
    return NextResponse.json({ error: "Missing sourceId" }, { status: 400 });
  }

  // Delete associated items first
  await supabase
    .from("asc_source_items")
    .delete()
    .eq("source_id", sourceId)
    .eq("user_id", user.id);

  const { error } = await supabase
    .from("asc_content_sources")
    .delete()
    .eq("id", sourceId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
