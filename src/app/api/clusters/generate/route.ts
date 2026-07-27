import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enqueueGenerateJob } from "@/lib/qstash";
import { normalizeGenerationSettings } from "@/lib/generation-settings";
import { checkFeatureAccess } from "@/lib/billing";
import { checkBulkCredits } from "@/lib/credits";
import { previewTopics } from "@/lib/programmatic";

// Max programmatic pages enqueued per request. Protects QStash and credits;
// remaining rows stay 'pending' and are picked up on the next generate call.
const PROGRAMMATIC_BATCH_CAP = 25;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await checkFeatureAccess(supabase, user.id, "clusters");
  if (!access.allowed) return NextResponse.json({ error: "Upgrade naar Pro om clusters te gebruiken" }, { status: 403 });

  const body = await request.json();
  const { clusterId, topicIds, generationSettings } = body;

  if (!clusterId) {
    return NextResponse.json({ error: "Missing clusterId" }, { status: 400 });
  }

  // Verify cluster ownership and get cluster info
  const { data: cluster } = await supabase
    .from("asc_clusters")
    .select("*, asc_cluster_topics(*)")
    .eq("id", clusterId)
    .eq("user_id", user.id)
    .single();

  if (!cluster) return NextResponse.json({ error: "Cluster not found" }, { status: 404 });

  // Programmatic mode: topics come from dataset rows + {{variabelen}} patterns,
  // not from AI suggestions. Materialise missing topics, then fan out with a
  // credit-aware batch cap. Editorial clusters fall through unchanged below.
  if (cluster.mode === "programmatic") {
    const access = await checkFeatureAccess(supabase, user.id, "programmatic");
    if (!access.allowed) {
      return NextResponse.json(
        { error: "Upgrade naar Pro om programmatic SEO te gebruiken" },
        { status: 403 }
      );
    }
    return handleProgrammatic(supabase, user.id, cluster, topicIds);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allTopics = (cluster as any).asc_cluster_topics ?? [];

  // Rescue topics stuck in "generating" whose run has been running/queued for > 15 minutes.
  // Use created_at as fallback because started_at can be null for queued runs that never started,
  // and NULL < date comparisons always return NULL (no match) in SQL.
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const stuckTopicIds: string[] = [];
  for (const t of allTopics.filter((t: { status: string }) => t.status === "generating")) {
    const { data: stuckRun } = await supabase
      .from("asc_runs")
      .select("id")
      .eq("cluster_topic_id", t.id)
      .in("status", ["running", "queued"])
      .or(`started_at.lt.${fifteenMinutesAgo},and(started_at.is.null,created_at.lt.${fifteenMinutesAgo})`)
      .maybeSingle();
    if (stuckRun) stuckTopicIds.push(t.id);
  }
  if (stuckTopicIds.length > 0) {
    await supabase
      .from("asc_cluster_topics")
      .update({ status: "failed" })
      .in("id", stuckTopicIds);
    await supabase
      .from("asc_runs")
      .update({ status: "failed", error_message: "Worker timeout — opnieuw in wachtrij", finished_at: new Date().toISOString() })
      .in("cluster_topic_id", stuckTopicIds)
      .in("status", ["running", "queued"]);
  }

  // Reload topics with updated statuses
  const { data: freshCluster } = await supabase
    .from("asc_clusters")
    .select("*, asc_cluster_topics(*)")
    .eq("id", clusterId)
    .eq("user_id", user.id)
    .single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const freshTopics = (freshCluster as any)?.asc_cluster_topics ?? allTopics;

  const targetTopics = topicIds
    ? freshTopics.filter((t: { id: string }) => topicIds.includes(t.id))
    : freshTopics.filter((t: { status: string }) => t.status === "pending" || t.status === "failed");

  if (targetTopics.length === 0) {
    const generatingCount = freshTopics.filter((t: { status: string }) => t.status === "generating").length;
    if (generatingCount > 0) {
      return NextResponse.json({ error: `${generatingCount} pagina's zijn al bezig met genereren` }, { status: 409 });
    }
    return NextResponse.json({ error: "No pending or failed topics to generate" }, { status: 400 });
  }

  const results: { topicId: string; runId: string }[] = [];
  const contentType = cluster.content_type || "posts";
  const effectiveGenerationSettings = normalizeGenerationSettings(
    generationSettings ?? cluster.generation_settings
  );

  // For pages mode: if pillar not yet published, only enqueue the pillar.
  // The pillar worker will auto-enqueue child topics after it publishes,
  // avoiding the race condition of child topics checking for a pillar that isn't ready.
  if (contentType === "pages" && !cluster.pillar_wp_post_id) {
    // Don't start a second pillar if one is already running/queued
    const { data: existingPillarRun } = await supabase
      .from("asc_runs")
      .select("id")
      .eq("cluster_id", clusterId)
      .is("cluster_topic_id", null)
      .in("status", ["running", "queued"])
      .maybeSingle();

    if (!existingPillarRun) {
      const { data: pillarRun } = await supabase
        .from("asc_runs")
        .insert({
          user_id: user.id,
          site_id: cluster.site_id,
          status: "queued",
          cluster_id: clusterId,
          cluster_topic_id: null,
          template_id: cluster.template_id || null,
        })
        .select("id")
        .single();

      if (pillarRun) {
        try {
          await enqueueGenerateJob({
            runId: pillarRun.id,
            siteId: cluster.site_id,
            userId: user.id,
            clusterId,
            templateId: cluster.template_id || undefined,
            contentType,
            generationSettings: effectiveGenerationSettings,
          });
          results.push({ topicId: "pillar", runId: pillarRun.id });
        } catch {
          await supabase
            .from("asc_runs")
            .update({ status: "failed", error_message: "Pillar job queueing failed", finished_at: new Date().toISOString() })
            .eq("id", pillarRun.id);
        }
      }
    } else {
      results.push({ topicId: "pillar", runId: existingPillarRun.id });
    }

    if (results.length === 0) {
      return NextResponse.json({ error: "Pillar job kon niet worden gestart" }, { status: 500 });
    }

    console.log(`[generate] Pillar job queued voor cluster ${clusterId} — child topics starten automatisch na pillar`);
    await supabase
      .from("asc_clusters")
      .update({ status: "in_progress", updated_at: new Date().toISOString() })
      .eq("id", clusterId);
    return NextResponse.json({ generated: results.length, jobs: results });
  }

  for (const topic of targetTopics) {
    // Create a run for this topic
    const { data: run, error: runError } = await supabase
      .from("asc_runs")
      .insert({
        user_id: user.id,
        site_id: cluster.site_id,
        status: "queued",
        cluster_id: clusterId,
        cluster_topic_id: topic.id,
        template_id: cluster.template_id || null,
      })
      .select("id")
      .single();

    if (runError || !run) continue;

    try {
      // Enqueue the job first; only then mark topic as generating.
      await enqueueGenerateJob({
        runId: run.id,
        siteId: cluster.site_id,
        userId: user.id,
        clusterId,
        clusterTopicId: topic.id,
        templateId: cluster.template_id || undefined,
        contentType,
        generationSettings: effectiveGenerationSettings,
      });

      await supabase
        .from("asc_cluster_topics")
        .update({ status: "generating" })
        .eq("id", topic.id);

      results.push({ topicId: topic.id, runId: run.id });
    } catch (jobErr) {
      const errorMessage = jobErr instanceof Error ? jobErr.message : "Queueing failed";
      await supabase
        .from("asc_runs")
        .update({
          status: "failed",
          error_message: errorMessage,
          finished_at: new Date().toISOString(),
        })
        .eq("id", run.id);
      await supabase
        .from("asc_cluster_topics")
        .update({ status: "failed" })
        .eq("id", topic.id);
    }
  }

  if (results.length === 0) {
    return NextResponse.json({ error: "No jobs could be queued" }, { status: 500 });
  }

  console.log(`[generate] ${results.length} jobs queued voor cluster ${clusterId}, contentType=${contentType}`);

  // Update cluster status
  await supabase
    .from("asc_clusters")
    .update({ status: "in_progress", updated_at: new Date().toISOString() })
    .eq("id", clusterId);

  return NextResponse.json({ generated: results.length, jobs: results });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * Programmatic fan-out: materialise cluster topics from dataset rows via the
 * title/slug/topic patterns, then enqueue up to PROGRAMMATIC_BATCH_CAP pages,
 * bounded by remaining credits.
 */
async function handleProgrammatic(
  supabase: Db,
  userId: string,
  cluster: Db,
  topicIds?: string[]
) {
  if (!cluster.dataset_id) {
    return NextResponse.json({ error: "Geen dataset gekoppeld aan dit cluster" }, { status: 400 });
  }
  if (!cluster.title_pattern) {
    return NextResponse.json({ error: "Geen titel-patroon ingesteld" }, { status: 400 });
  }

  // Load dataset rows
  const { data: rows } = await supabase
    .from("asc_dataset_rows")
    .select("id, data, row_index")
    .eq("dataset_id", cluster.dataset_id)
    .order("row_index", { ascending: true });

  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "Dataset bevat geen rijen" }, { status: 400 });
  }

  const existingTopics: Db[] = cluster.asc_cluster_topics ?? [];
  const rowsWithTopic = new Set(
    existingTopics.map((t: Db) => t.dataset_row_id).filter(Boolean)
  );

  // Materialise topics for rows that don't have one yet
  const rowsNeedingTopic = rows.filter((r: Db) => !rowsWithTopic.has(r.id));
  if (rowsNeedingTopic.length > 0) {
    const patterns = {
      titlePattern: cluster.title_pattern as string,
      slugPattern: cluster.slug_pattern as string | null,
      topicPattern: cluster.topic_pattern as string | null,
    };
    const previews = previewTopics(
      patterns,
      rowsNeedingTopic.map((r: Db) => r.data as Record<string, string>)
    );
    const newTopics = previews
      .map((p, idx) => ({ preview: p, row: rowsNeedingTopic[idx] }))
      .filter(({ preview }) => !preview.error)
      .map(({ preview, row }) => ({
        cluster_id: cluster.id,
        user_id: userId,
        title: preview.title,
        description: preview.topic,
        target_keywords: preview.keywords,
        slug: preview.slug,
        dataset_row_id: row.id,
        resolved_vars: preview.resolvedVars,
        sort_order: row.row_index,
        status: "pending",
      }));

    if (newTopics.length > 0) {
      // Ignore conflicts on the (cluster_id, dataset_row_id) unique index so a
      // concurrent call can't create duplicate topics for the same row.
      await supabase
        .from("asc_cluster_topics")
        .upsert(newTopics, { onConflict: "cluster_id,dataset_row_id", ignoreDuplicates: true });
    }
  }

  // Reload topics after materialisation
  const { data: freshTopics } = await supabase
    .from("asc_cluster_topics")
    .select("*")
    .eq("cluster_id", cluster.id)
    .order("sort_order", { ascending: true });

  const allTopics: Db[] = freshTopics ?? [];
  const candidates = topicIds
    ? allTopics.filter((t) => topicIds.includes(t.id))
    : allTopics.filter((t) => t.status === "pending" || t.status === "failed");

  if (candidates.length === 0) {
    const generating = allTopics.filter((t) => t.status === "generating").length;
    if (generating > 0) {
      return NextResponse.json({ error: `${generating} pagina's zijn al bezig` }, { status: 409 });
    }
    return NextResponse.json({ error: "Geen pagina's om te genereren" }, { status: 400 });
  }

  // Credit-aware batch: never enqueue more than we can pay for, capped per call.
  const preflight = await checkBulkCredits(supabase, userId, "programmatic_page", candidates.length);
  if (preflight.affordable === 0) {
    return NextResponse.json(
      {
        error: "insufficient_credits",
        message: `Niet genoeg credits. Je hebt ${preflight.remaining} credits, elke pagina kost ${preflight.costPer}.`,
      },
      { status: 402 }
    );
  }

  const batchSize = Math.min(candidates.length, preflight.affordable, PROGRAMMATIC_BATCH_CAP);
  const batch = candidates.slice(0, batchSize);
  const contentType = cluster.content_type || "posts";
  const generationSettings = normalizeGenerationSettings(cluster.generation_settings);

  const results: { topicId: string; runId: string }[] = [];
  for (const topic of batch) {
    const { data: run, error: runError } = await supabase
      .from("asc_runs")
      .insert({
        user_id: userId,
        site_id: cluster.site_id,
        status: "queued",
        cluster_id: cluster.id,
        cluster_topic_id: topic.id,
        template_id: cluster.template_id || null,
      })
      .select("id")
      .single();

    if (runError || !run) continue;

    try {
      await enqueueGenerateJob({
        runId: run.id,
        siteId: cluster.site_id,
        userId,
        clusterId: cluster.id,
        clusterTopicId: topic.id,
        templateId: cluster.template_id || undefined,
        contentType,
        generationSettings,
      });
      await supabase.from("asc_cluster_topics").update({ status: "generating" }).eq("id", topic.id);
      results.push({ topicId: topic.id, runId: run.id });
    } catch (jobErr) {
      const errorMessage = jobErr instanceof Error ? jobErr.message : "Queueing failed";
      await supabase
        .from("asc_runs")
        .update({ status: "failed", error_message: errorMessage, finished_at: new Date().toISOString() })
        .eq("id", run.id);
      await supabase.from("asc_cluster_topics").update({ status: "failed" }).eq("id", topic.id);
    }
  }

  if (results.length === 0) {
    return NextResponse.json({ error: "Geen jobs konden worden gestart" }, { status: 500 });
  }

  await supabase
    .from("asc_clusters")
    .update({ status: "in_progress", updated_at: new Date().toISOString() })
    .eq("id", cluster.id);

  const remaining = candidates.length - results.length;
  console.log(`[generate] ${results.length} programmatic jobs queued voor cluster ${cluster.id}, ${remaining} resterend`);

  return NextResponse.json({
    generated: results.length,
    jobs: results,
    remaining,
    creditLimited: !preflight.enoughForAll,
  });
}
