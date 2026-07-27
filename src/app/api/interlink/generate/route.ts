import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkFeatureAccess } from "@/lib/billing";
import { checkBulkCredits } from "@/lib/credits";
import { enqueueInterlinkJob } from "@/lib/qstash";

const BATCH_CAP = 20;

// POST /api/interlink/generate — genereer interne-link-voorstellen voor alle
// pagina's in een cluster (async via de worker).
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await checkFeatureAccess(supabase, user.id, "clusters");
  if (!access.allowed) {
    return NextResponse.json({ error: "Upgrade naar Pro om clusters te gebruiken" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const clusterId = (body ?? {}).clusterId as string | undefined;
  if (!clusterId) return NextResponse.json({ error: "Missing clusterId" }, { status: 400 });

  const { data: cluster } = await supabase
    .from("asc_clusters")
    .select("id, site_id, pillar_wp_post_id, pillar_wp_post_url, pillar_topic")
    .eq("id", clusterId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!cluster) return NextResponse.json({ error: "Cluster niet gevonden" }, { status: 404 });

  const { data: topics } = await supabase
    .from("asc_cluster_topics")
    .select("title, wp_post_id, wp_post_url")
    .eq("cluster_id", clusterId);

  // Alle clusterpagina's met een WordPress-post.
  const members: { wpPostId: number; url: string | null; title: string }[] = [];
  if (cluster.pillar_wp_post_id) {
    members.push({
      wpPostId: cluster.pillar_wp_post_id,
      url: cluster.pillar_wp_post_url,
      title: cluster.pillar_topic,
    });
  }
  for (const t of topics ?? []) {
    if (t.wp_post_id) members.push({ wpPostId: t.wp_post_id, url: t.wp_post_url, title: t.title });
  }

  if (members.length < 2) {
    return NextResponse.json(
      { error: "Minimaal twee gepubliceerde pagina's nodig om te linken" },
      { status: 400 }
    );
  }

  const preflight = await checkBulkCredits(supabase, user.id, "interlink", members.length);
  if (preflight.affordable === 0) {
    return NextResponse.json(
      { error: "insufficient_credits", message: `Elke pagina kost ${preflight.costPer} credits.` },
      { status: 402 }
    );
  }

  const batch = members.slice(0, Math.min(members.length, preflight.affordable, BATCH_CAP));
  const started: string[] = [];

  for (const m of batch) {
    const { data: proposal, error } = await supabase
      .from("asc_interlink_proposals")
      .upsert(
        {
          user_id: user.id,
          site_id: cluster.site_id,
          cluster_id: clusterId,
          wp_post_id: m.wpPostId,
          url: m.url,
          title: m.title,
          status: "generating",
          error_message: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "cluster_id,wp_post_id" }
      )
      .select("id")
      .single();
    if (error || !proposal) continue;

    try {
      await enqueueInterlinkJob({ proposalId: proposal.id, siteId: cluster.site_id, userId: user.id });
      started.push(proposal.id);
    } catch {
      await supabase
        .from("asc_interlink_proposals")
        .update({ status: "failed", error_message: "Job kon niet worden gestart" })
        .eq("id", proposal.id);
    }
  }

  return NextResponse.json({
    started: started.length,
    remaining: members.length - started.length,
    creditLimited: !preflight.enoughForAll,
  });
}
