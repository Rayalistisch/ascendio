import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkFeatureAccess } from "@/lib/billing";
import { checkBulkCredits, CREDIT_COSTS } from "@/lib/credits";
import { enqueueRefreshJob } from "@/lib/qstash";

// Max refreshes enqueued per request — protects credits/QStash.
const REFRESH_BATCH_CAP = 10;

// POST /api/refresh/run — enqueue refresh jobs for selected (or all pending) items
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await checkFeatureAccess(supabase, user.id, "content_refresh");
  if (!access.allowed) {
    return NextResponse.json({ error: "Upgrade naar Pro om de refresh-loop te gebruiken" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const { siteId, refreshIds } = (body ?? {}) as { siteId?: string; refreshIds?: string[] };
  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  let query = supabase
    .from("asc_content_refresh_queue")
    .select("id, wp_post_id")
    .eq("user_id", user.id)
    .eq("site_id", siteId)
    .in("status", ["pending", "failed"]);
  if (Array.isArray(refreshIds) && refreshIds.length > 0) {
    query = query.in("id", refreshIds);
  }

  const { data: items } = await query;
  if (!items || items.length === 0) {
    return NextResponse.json({ error: "Geen pagina's om te verversen" }, { status: 400 });
  }

  const preflight = await checkBulkCredits(supabase, user.id, "content_rewrite", items.length);
  if (preflight.affordable === 0) {
    return NextResponse.json(
      {
        error: "insufficient_credits",
        message: `Niet genoeg credits. Elke refresh kost ${CREDIT_COSTS.content_rewrite} credits.`,
      },
      { status: 402 }
    );
  }

  const batch = items.slice(0, Math.min(items.length, preflight.affordable, REFRESH_BATCH_CAP));
  const started: string[] = [];

  for (const item of batch) {
    try {
      await enqueueRefreshJob({ refreshId: item.id, siteId, userId: user.id });
      await supabase
        .from("asc_content_refresh_queue")
        .update({ status: "refreshing", updated_at: new Date().toISOString() })
        .eq("id", item.id);
      started.push(item.id);
    } catch {
      // leave as-is; user can retry
    }
  }

  if (started.length === 0) {
    return NextResponse.json({ error: "Geen jobs konden worden gestart" }, { status: 500 });
  }

  return NextResponse.json({
    started: started.length,
    remaining: items.length - started.length,
    creditLimited: !preflight.enoughForAll,
  });
}
