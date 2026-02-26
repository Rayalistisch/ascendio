import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enqueueGenerateJob } from "@/lib/qstash";
import { normalizeGenerationSettings } from "@/lib/generation-settings";
import { checkFeatureAccess } from "@/lib/billing";

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allTopics = (cluster as any).asc_cluster_topics ?? [];

  // Rescue topics stuck in "generating" whose run has been running for > 15 minutes
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const stuckTopicIds: string[] = [];
  for (const t of allTopics.filter((t: { status: string }) => t.status === "generating")) {
    const { data: stuckRun } = await supabase
      .from("asc_runs")
      .select("id")
      .eq("cluster_topic_id", t.id)
      .in("status", ["running", "queued"])
      .lt("started_at", fifteenMinutesAgo)
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

  // For pages mode: generate pillar page first if not yet published
  if (contentType === "pages" && !cluster.pillar_wp_post_id) {
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
