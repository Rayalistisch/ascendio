import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueGenerateJob, enqueueSourceFetchJob } from "@/lib/qstash";
import { getNextRunDate } from "@/lib/scheduler";

// Vercel Cron or external cron hits this every 15 minutes
// Header: Authorization: Bearer <CRON_SECRET>
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // === 1. Process due schedules ===
  const { data: dueSchedules, error } = await supabase
    .from("asc_schedules")
    .select("*, asc_sites(id, name, status)")
    .eq("is_enabled", true)
    .lte("next_run_at", now)
    .not("next_run_at", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let enqueued = 0;

  for (const schedule of dueSchedules || []) {
    const site = schedule.asc_sites as { id: string; name: string; status: string } | null;
    if (!site || site.status !== "active") continue;

    const { data: run, error: runError } = await supabase
      .from("asc_runs")
      .insert({
        user_id: schedule.user_id,
        site_id: schedule.site_id,
        schedule_id: schedule.id,
        status: "queued",
      })
      .select()
      .single();

    if (runError || !run) continue;

    try {
      await enqueueGenerateJob({
        runId: run.id,
        siteId: schedule.site_id,
        scheduleId: schedule.id,
        userId: schedule.user_id,
      });
      enqueued++;
    } catch (err) {
      await supabase
        .from("asc_runs")
        .update({
          status: "failed",
          error_message: err instanceof Error ? err.message : "Failed to enqueue",
          finished_at: new Date().toISOString(),
        })
        .eq("id", run.id);
    }

    const nextRun = getNextRunDate(schedule.rrule);
    await supabase
      .from("asc_schedules")
      .update({ next_run_at: nextRun?.toISOString() || null })
      .eq("id", schedule.id);
  }

  // === 2. Refresh content sources (every run, sources that haven't been fetched in 24h) ===
  let sourcesFetched = 0;
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: staleSources } = await supabase
    .from("asc_content_sources")
    .select("id, site_id, user_id, last_fetched_at")
    .eq("is_enabled", true)
    .or(`last_fetched_at.is.null,last_fetched_at.lt.${twentyFourHoursAgo}`);

  for (const source of staleSources || []) {
    try {
      await enqueueSourceFetchJob({
        sourceId: source.id,
        siteId: source.site_id,
        userId: source.user_id,
      });
      sourcesFetched++;
    } catch {
      // Skip failed enqueues silently
    }
  }

  return NextResponse.json({
    message: "Cron complete",
    runsEnqueued: enqueued,
    sourcesFetched,
  });
}
