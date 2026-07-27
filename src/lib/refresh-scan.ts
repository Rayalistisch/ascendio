import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/encryption";
import {
  refreshSearchConsoleAccessToken,
  querySearchConsoleRows,
} from "@/lib/google-search-console";
import { detectRefreshCandidates, type PageMetric } from "@/lib/content-refresh";

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const MAX_CANDIDATES = 30;

export interface ScanResult {
  scanned: boolean;
  reason?: string;
  inserted: number;
}

/**
 * Scan one site's Google Search Console data for decay/stuck pages and upsert
 * them into the refresh queue. Shared by the manual scan endpoint and the cron.
 * Requires a GSC connection; returns { scanned:false } when absent.
 */
export async function scanSiteForRefresh(
  supabase: SupabaseClient,
  userId: string,
  siteId: string
): Promise<ScanResult> {
  const { data: connection } = await supabase
    .from("asc_search_console_connections")
    .select("property_url, refresh_token_encrypted")
    .eq("site_id", siteId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!connection?.property_url || !connection.refresh_token_encrypted) {
    return { scanned: false, reason: "no_gsc_connection", inserted: 0 };
  }

  const refreshToken = decrypt(connection.refresh_token_encrypted);
  const token = await refreshSearchConsoleAccessToken(refreshToken);

  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 2);
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 27); // laatste ~28 dagen
  const prevEnd = new Date(startDate);
  prevEnd.setDate(startDate.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevEnd.getDate() - 27);

  const [currentRows, previousRows, pageQueryRows] = await Promise.all([
    querySearchConsoleRows({
      accessToken: token.access_token,
      propertyUrl: connection.property_url,
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      dimensions: ["page"],
      rowLimit: 200,
    }),
    querySearchConsoleRows({
      accessToken: token.access_token,
      propertyUrl: connection.property_url,
      startDate: formatDate(prevStart),
      endDate: formatDate(prevEnd),
      dimensions: ["page"],
      rowLimit: 200,
    }),
    querySearchConsoleRows({
      accessToken: token.access_token,
      propertyUrl: connection.property_url,
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      dimensions: ["page", "query"],
      rowLimit: 1000,
    }),
  ]);

  const toMetric = (r: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }): PageMetric => ({
    url: r.keys[0] || "",
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  });

  const current = currentRows.map(toMetric).filter((m) => m.url);
  const previous = previousRows.map(toMetric).filter((m) => m.url);

  // Top queries per page (voor de refresh-prompt).
  const topQueriesByPage = new Map<string, string[]>();
  for (const row of pageQueryRows) {
    const page = row.keys[0];
    const query = row.keys[1];
    if (!page || !query) continue;
    const list = topQueriesByPage.get(page) ?? [];
    if (list.length < 8) list.push(query);
    topQueriesByPage.set(page, list);
  }

  const candidates = detectRefreshCandidates(current, previous).slice(0, MAX_CANDIDATES);

  await supabase
    .from("asc_search_console_connections")
    .update({ last_refresh_scan_at: new Date().toISOString() })
    .eq("site_id", siteId)
    .eq("user_id", userId);

  if (candidates.length === 0) return { scanned: true, inserted: 0 };

  // Map GSC page URLs to cached posts (we can only refresh pages we know).
  const urls = candidates.map((c) => c.url);
  const { data: cachedPosts } = await supabase
    .from("asc_wp_posts")
    .select("wp_post_id, title, url")
    .eq("site_id", siteId)
    .in("url", urls);

  const postByUrl = new Map((cachedPosts ?? []).map((p) => [p.url, p]));

  // Don't re-queue items the user dismissed or that are mid-refresh.
  const { data: existing } = await supabase
    .from("asc_content_refresh_queue")
    .select("wp_post_id, status")
    .eq("site_id", siteId);
  const blocked = new Set(
    (existing ?? [])
      .filter((e) => e.status === "dismissed" || e.status === "refreshing")
      .map((e) => e.wp_post_id)
  );

  const rows = candidates
    .map((c) => {
      const post = postByUrl.get(c.url);
      if (!post || blocked.has(post.wp_post_id)) return null;
      return {
        user_id: userId,
        site_id: siteId,
        wp_post_id: post.wp_post_id,
        url: c.url,
        title: post.title,
        reason: c.reason,
        score: c.score,
        metrics: {
          clicks_now: c.clicksNow,
          clicks_prev: c.clicksPrev,
          impressions: c.impressions,
          position: c.position,
          ctr: c.ctr,
          top_queries: topQueriesByPage.get(c.url) ?? [],
        },
        status: "pending",
        detected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    })
    .filter(Boolean) as Array<Record<string, unknown>>;

  if (rows.length === 0) return { scanned: true, inserted: 0 };

  const { error } = await supabase
    .from("asc_content_refresh_queue")
    .upsert(rows, { onConflict: "site_id,wp_post_id" });
  if (error) return { scanned: true, reason: error.message, inserted: 0 };

  return { scanned: true, inserted: rows.length };
}
