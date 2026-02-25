import { XMLParser } from "fast-xml-parser";
import { SupabaseClient } from "@supabase/supabase-js";

export interface RSSItem {
  title: string;
  link: string;
  content: string;
  guid: string;
  pubDate: string;
}

export interface SourceItem {
  id: string;
  source_id: string;
  title: string;
  url: string | null;
  summary: string | null;
  raw_content: string | null;
}

function isPrivateUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === "localhost" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      /^127\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      hostname === "169.254.169.254" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".localhost")
    );
  } catch {
    return true;
  }
}

export async function fetchRSSItems(
  feedUrl: string,
  maxItems: number = 10
): Promise<RSSItem[]> {
  if (isPrivateUrl(feedUrl)) throw new Error("RSS URL verwijst naar een intern netwerk (niet toegestaan)");
  const response = await fetch(feedUrl);
  if (!response.ok) throw new Error(`Failed to fetch RSS feed: ${response.status}`);

  const xml = await response.text();
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const parsed = parser.parse(xml);

  // Handle both RSS 2.0 and Atom feeds
  let items: any[] = [];
  if (parsed.rss?.channel?.item) {
    items = Array.isArray(parsed.rss.channel.item) ? parsed.rss.channel.item : [parsed.rss.channel.item];
  } else if (parsed.feed?.entry) {
    items = Array.isArray(parsed.feed.entry) ? parsed.feed.entry : [parsed.feed.entry];
  }

  return items.slice(0, maxItems).map((item: any) => ({
    title: item.title || item["media:title"] || "",
    link: item.link?.["@_href"] || item.link || "",
    content: item["content:encoded"] || item.description || item.summary || item.content || "",
    guid: item.guid?.["#text"] || item.guid || item.id || item.link?.["@_href"] || item.link || "",
    pubDate: item.pubDate || item.published || item.updated || "",
  }));
}

export async function fetchNewsItems(
  topics: string[],
  region: string = "nl"
): Promise<{ title: string; url: string; summary: string; publishedAt: string }[]> {
  // Use Google News RSS as a free news source
  const query = topics.join("+");
  const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${region}&gl=${region.toUpperCase()}&ceid=${region.toUpperCase()}:${region}`;

  try {
    const items = await fetchRSSItems(feedUrl, 10);
    return items.map((item) => ({
      title: item.title,
      url: item.link,
      summary: item.content.replace(/<[^>]*>/g, "").substring(0, 500),
      publishedAt: item.pubDate,
    }));
  } catch {
    return [];
  }
}

export async function selectSourceItem(
  supabase: SupabaseClient,
  siteId: string
): Promise<SourceItem | null> {
  const { data } = await supabase
    .from("asc_source_items")
    .select("id, source_id, title, url, summary, raw_content")
    .eq("site_id", siteId)
    .eq("is_used", false)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .single();

  return data || null;
}

export async function markSourceItemUsed(
  supabase: SupabaseClient,
  itemId: string
): Promise<void> {
  await supabase
    .from("asc_source_items")
    .update({ is_used: true })
    .eq("id", itemId);
}
