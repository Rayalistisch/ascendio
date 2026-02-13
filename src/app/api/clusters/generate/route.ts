import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enqueueGenerateJob } from "@/lib/qstash";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { clusterId, topicIds } = body;

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
  const targetTopics = topicIds
    ? allTopics.filter((t: { id: string }) => topicIds.includes(t.id))
    : allTopics.filter((t: { status: string }) => t.status === "pending");

  if (targetTopics.length === 0) {
    return NextResponse.json({ error: "No pending topics to generate" }, { status: 400 });
  }

  const results: { topicId: string; runId: string }[] = [];

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

    // Update topic status
    await supabase
      .from("asc_cluster_topics")
      .update({ status: "generating" })
      .eq("id", topic.id);

    // Enqueue the job
    await enqueueGenerateJob({
      runId: run.id,
      siteId: cluster.site_id,
      userId: user.id,
      clusterId,
      clusterTopicId: topic.id,
      templateId: cluster.template_id || undefined,
    });

    results.push({ topicId: topic.id, runId: run.id });
  }

  // Update cluster status
  await supabase
    .from("asc_clusters")
    .update({ status: "in_progress", updated_at: new Date().toISOString() })
    .eq("id", clusterId);

  return NextResponse.json({ generated: results.length, jobs: results });
}
