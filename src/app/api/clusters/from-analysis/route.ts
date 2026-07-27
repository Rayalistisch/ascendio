import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkFeatureAccess } from "@/lib/billing";

interface MemberInput {
  wpPostId: number;
  title: string;
  url?: string;
}

// POST /api/clusters/from-analysis
// Zet een gedetecteerde groep om in een beheerd cluster dat de bestaande
// structuur weerspiegelt (pillar + reeds gepubliceerde topics).
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await checkFeatureAccess(supabase, user.id, "clusters");
  if (!access.allowed) {
    return NextResponse.json({ error: "Upgrade naar Pro om clusters te gebruiken" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const { siteId, name, pillar, members } = (body ?? {}) as {
    siteId?: string;
    name?: string;
    pillar?: MemberInput;
    members?: MemberInput[];
  };

  if (!siteId || !pillar?.title) {
    return NextResponse.json({ error: "siteId en pillar zijn verplicht" }, { status: 400 });
  }

  const { data: site } = await supabase
    .from("asc_sites")
    .select("id")
    .eq("id", siteId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!site) return NextResponse.json({ error: "Site niet gevonden" }, { status: 404 });

  const { data: cluster, error: clusterError } = await supabase
    .from("asc_clusters")
    .insert({
      user_id: user.id,
      site_id: siteId,
      name: (name && name.trim()) || pillar.title,
      pillar_topic: pillar.title,
      pillar_keywords: [],
      pillar_wp_post_id: pillar.wpPostId ?? null,
      pillar_wp_post_url: pillar.url ?? null,
      mode: "editorial",
      content_type: "posts",
      status: "complete", // weerspiegelt bestaande, al gepubliceerde content
    })
    .select("id")
    .single();

  if (clusterError || !cluster) {
    return NextResponse.json({ error: clusterError?.message ?? "Aanmaken mislukt" }, { status: 500 });
  }

  // Members (zonder de pillar) als reeds gepubliceerde topics.
  const topicMembers = (members ?? []).filter((m) => m.wpPostId !== pillar.wpPostId);
  if (topicMembers.length > 0) {
    const rows = topicMembers.map((m, i) => ({
      cluster_id: cluster.id,
      user_id: user.id,
      title: m.title,
      target_keywords: [],
      sort_order: i,
      status: "published",
      wp_post_id: m.wpPostId ?? null,
      wp_post_url: m.url ?? null,
    }));
    await supabase.from("asc_cluster_topics").insert(rows);
  }

  return NextResponse.json({ clusterId: cluster.id, topics: topicMembers.length }, { status: 201 });
}
