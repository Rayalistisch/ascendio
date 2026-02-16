import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyQStashSignature } from "@/lib/qstash";
import { fetchRSSItems, fetchNewsItems } from "@/lib/content-sources";

export const maxDuration = 60;

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("upstash-signature");
  const valid = await verifyQStashSignature(signature, rawBody);
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const { sourceId, siteId, userId } = JSON.parse(rawBody);
  if (!sourceId || !siteId || !userId) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: source } = await supabase
    .from("asc_content_sources")
    .select("*")
    .eq("id", sourceId)
    .eq("site_id", siteId)
    .eq("user_id", userId)
    .single();

  if (!source) return NextResponse.json({ error: "Source not found" }, { status: 404 });

  const config = source.config as Record<string, unknown>;
  let items: { title: string; url?: string; summary?: string; rawContent?: string; externalId: string }[] = [];

  try {
    if (source.source_type === "rss" && config.feedUrl) {
      const rssItems = await fetchRSSItems(config.feedUrl as string);
      items = rssItems.map((i) => ({
        title: i.title,
        url: i.link,
        summary: i.content.replace(/<[^>]*>/g, "").substring(0, 500),
        rawContent: i.content,
        externalId: i.link || i.title,
      }));
    } else if (source.source_type === "news" && config.topic) {
      const newsItems = await fetchNewsItems(
        Array.isArray(config.topic) ? config.topic : [config.topic as string],
        config.region as string
      );
      items = newsItems.map((i) => ({
        title: i.title,
        url: i.url,
        summary: i.summary,
        externalId: i.url || i.title,
      }));
    } else if (source.source_type === "keywords" && Array.isArray(config.keywords)) {
      items = (config.keywords as string[]).map((kw) => ({
        title: kw,
        externalId: `kw-${kw}`,
      }));
    }

    for (const item of items) {
      await supabase.from("asc_source_items").upsert(
        {
          source_id: sourceId,
          site_id: siteId,
          user_id: userId,
          external_id: item.externalId,
          title: item.title,
          url: item.url || null,
          summary: item.summary || null,
          raw_content: item.rawContent || null,
          is_used: false,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "source_id,external_id" }
      );
    }

    await supabase
      .from("asc_content_sources")
      .update({ last_fetched_at: new Date().toISOString() })
      .eq("id", sourceId)
      .eq("user_id", userId);

    return NextResponse.json({ success: true, itemsProcessed: items.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Fetch failed" },
      { status: 500 }
    );
  }
}
