import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enqueueGenerateJob } from "@/lib/qstash";
import { normalizeGenerationSettings } from "@/lib/generation-settings";
import { checkFeatureAccess } from "@/lib/billing";

// Vast cluster per site dat als "Blogs"-container dient. Blogs worden als losse
// posts onder /kenniscentrum/blogs/ gepubliceerd.
const BLOGS_CLUSTER_NAME = "Blogs";
const BLOGS_URL_PREFIX = "/kenniscentrum/blogs/";

// Vindt of maakt het Blogs-cluster voor een site. Geeft de cluster-rij terug.
async function ensureBlogsCluster(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  siteId: string
) {
  const { data: existing } = await supabase
    .from("asc_clusters")
    .select("id, ibvision_url_prefix, generation_settings")
    .eq("user_id", userId)
    .eq("site_id", siteId)
    .eq("name", BLOGS_CLUSTER_NAME)
    .maybeSingle();
  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("asc_clusters")
    .insert({
      user_id: userId,
      site_id: siteId,
      name: BLOGS_CLUSTER_NAME,
      pillar_topic: BLOGS_CLUSTER_NAME,
      content_type: "posts",
      ibvision_url_prefix: BLOGS_URL_PREFIX,
      status: "in_progress",
    })
    .select("id, ibvision_url_prefix, generation_settings")
    .single();
  if (error) throw new Error(error.message);
  return created;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await checkFeatureAccess(supabase, user.id, "clusters");
  if (!access.allowed) {
    return NextResponse.json(
      { error: "Upgrade naar Pro om blogs te genereren" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const siteId = body?.siteId as string | undefined;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const keywords: string[] = Array.isArray(body?.keywords)
    ? body.keywords.map((k: unknown) => String(k).trim()).filter(Boolean)
    : [];
  if (!siteId || !title) {
    return NextResponse.json({ error: "siteId en titel zijn verplicht" }, { status: 400 });
  }

  // Site-eigendom + platform controleren.
  const { data: site } = await supabase
    .from("asc_sites")
    .select("id")
    .eq("id", siteId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!site) return NextResponse.json({ error: "Site niet gevonden" }, { status: 404 });

  const cluster = await ensureBlogsCluster(supabase, user.id, siteId);

  // Topic aanmaken.
  const { data: topic, error: topicError } = await supabase
    .from("asc_cluster_topics")
    .insert({
      cluster_id: cluster.id,
      user_id: user.id,
      title,
      target_keywords: keywords,
      status: "pending",
      sort_order: 0,
    })
    .select("id")
    .single();
  if (topicError || !topic) {
    return NextResponse.json(
      { error: topicError?.message || "Kon blog niet aanmaken" },
      { status: 500 }
    );
  }

  // Run + concept-generatie (draftMode) in de wachtrij zetten.
  const { data: run, error: runError } = await supabase
    .from("asc_runs")
    .insert({
      user_id: user.id,
      site_id: siteId,
      status: "queued",
      cluster_id: cluster.id,
      cluster_topic_id: topic.id,
    })
    .select("id")
    .single();
  if (runError || !run) {
    await supabase.from("asc_cluster_topics").update({ status: "failed" }).eq("id", topic.id);
    return NextResponse.json({ error: "Kon generatie niet starten" }, { status: 500 });
  }

  try {
    await enqueueGenerateJob({
      runId: run.id,
      siteId,
      userId: user.id,
      clusterId: cluster.id,
      clusterTopicId: topic.id,
      contentType: "posts",
      generationSettings: normalizeGenerationSettings(cluster.generation_settings),
      draftMode: true,
    });
    await supabase
      .from("asc_cluster_topics")
      .update({ status: "generating" })
      .eq("id", topic.id);
  } catch (jobErr) {
    const message = jobErr instanceof Error ? jobErr.message : "Queueing failed";
    await supabase
      .from("asc_runs")
      .update({ status: "failed", error_message: message, finished_at: new Date().toISOString() })
      .eq("id", run.id);
    await supabase.from("asc_cluster_topics").update({ status: "failed" }).eq("id", topic.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, topicId: topic.id, clusterId: cluster.id });
}
