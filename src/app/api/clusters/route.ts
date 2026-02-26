import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";
import { deletePost } from "@/lib/wordpress";
import { normalizeGenerationSettings } from "@/lib/generation-settings";
import { checkFeatureAccess } from "@/lib/billing";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await checkFeatureAccess(supabase, user.id, "clusters");
  if (!access.allowed) return NextResponse.json({ error: "Upgrade naar Pro om clusters te gebruiken" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  const { data: clusters, error } = await supabase
    .from("asc_clusters")
    .select("*, asc_cluster_topics(id, status)")
    .eq("user_id", user.id)
    .eq("site_id", siteId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Compute topic counts per cluster
  const enriched = (clusters ?? []).map((c) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const topics = (c as any).asc_cluster_topics ?? [];
    return {
      ...c,
      asc_cluster_topics: undefined,
      topic_count: topics.length,
      published_count: topics.filter((t: { status: string }) => t.status === "published").length,
    };
  });

  return NextResponse.json({ clusters: enriched });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await checkFeatureAccess(supabase, user.id, "clusters");
  if (!access.allowed) return NextResponse.json({ error: "Upgrade naar Pro om clusters te gebruiken" }, { status: 403 });

  const body = await request.json();
  const {
    siteId,
    name,
    pillarTopic,
    pillarDescription,
    pillarKeywords,
    templateId,
    contentType,
    generationSettings,
  } = body;

  if (!siteId || !name || !pillarTopic) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { data: site } = await supabase
    .from("asc_sites")
    .select("id")
    .eq("id", siteId)
    .eq("user_id", user.id)
    .single();
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const insertPayload: Record<string, unknown> = {
    user_id: user.id,
    site_id: siteId,
    name,
    pillar_topic: pillarTopic,
    pillar_description: pillarDescription || null,
    pillar_keywords: pillarKeywords || [],
    template_id: templateId || null,
    content_type: contentType || "pages",
  };
  if (generationSettings !== undefined) {
    insertPayload.generation_settings = normalizeGenerationSettings(generationSettings);
  }

  const { data, error } = await supabase
    .from("asc_clusters")
    .insert(insertPayload)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cluster: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await checkFeatureAccess(supabase, user.id, "clusters");
  if (!access.allowed) return NextResponse.json({ error: "Upgrade naar Pro om clusters te gebruiken" }, { status: 403 });

  const body = await request.json();
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.name !== undefined) updates.name = fields.name;
  if (fields.pillarTopic !== undefined) updates.pillar_topic = fields.pillarTopic;
  if (fields.pillarDescription !== undefined) updates.pillar_description = fields.pillarDescription;
  if (fields.pillarKeywords !== undefined) updates.pillar_keywords = fields.pillarKeywords;
  if (fields.templateId !== undefined) updates.template_id = fields.templateId || null;
  if (fields.status !== undefined) updates.status = fields.status;
  if (fields.generationSettings !== undefined) {
    updates.generation_settings = normalizeGenerationSettings(fields.generationSettings);
  }
  if (fields.pillarWpPostId !== undefined) {
    updates.pillar_wp_post_id = fields.pillarWpPostId ?? null;
  }
  if (fields.pillarWpPostUrl !== undefined) {
    updates.pillar_wp_post_url = fields.pillarWpPostUrl ?? null;
  }
  if (fields.contentType !== undefined) {
    // Block content type change if cluster already has published content
    const { data: existing } = await supabase
      .from("asc_clusters")
      .select("pillar_wp_post_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();
    if (existing?.pillar_wp_post_id) {
      return NextResponse.json(
        { error: "Kan publicatietype niet wijzigen als er al gepubliceerde content is." },
        { status: 400 }
      );
    }
    updates.content_type = fields.contentType;
  }

  const { data, error } = await supabase
    .from("asc_clusters")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cluster: data });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await checkFeatureAccess(supabase, user.id, "clusters");
  if (!access.allowed) return NextResponse.json({ error: "Upgrade naar Pro om clusters te gebruiken" }, { status: 403 });

  const body = await request.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { data: cluster, error: clusterError } = await supabase
    .from("asc_clusters")
    .select("id, site_id, pillar_wp_post_id, content_type")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (clusterError || !cluster) {
    return NextResponse.json({ error: "Cluster not found" }, { status: 404 });
  }

  const { data: clusterTopics } = await supabase
    .from("asc_cluster_topics")
    .select("wp_post_id")
    .eq("cluster_id", id)
    .eq("user_id", user.id);

  const wpPostIds = Array.from(
    new Set(
      [cluster.pillar_wp_post_id, ...(clusterTopics ?? []).map((topic) => topic.wp_post_id)]
        .filter((postId): postId is number => typeof postId === "number")
    )
  );

  if (wpPostIds.length > 0) {
    const { data: site } = await supabase
      .from("asc_sites")
      .select("wp_base_url, wp_username, wp_app_password_encrypted")
      .eq("id", cluster.site_id)
      .eq("user_id", user.id)
      .single();

    if (!site?.wp_base_url || !site?.wp_username || !site?.wp_app_password_encrypted) {
      return NextResponse.json(
        { error: "WordPress credentials ontbreken; kan clusterpagina's niet verwijderen." },
        { status: 400 }
      );
    }

    const creds = {
      baseUrl: site.wp_base_url,
      username: site.wp_username,
      appPassword: decrypt(site.wp_app_password_encrypted),
    };

    const wpDeletionResults = await Promise.allSettled(
      wpPostIds.map((postId) =>
        deletePost(creds, postId, {
          force: true,
          collection: cluster.content_type === "pages" ? "pages" : "posts",
        })
      )
    );

    const failedDeletions = wpDeletionResults
      .map((result, index) => ({
        postId: wpPostIds[index],
        ok: result.status === "fulfilled",
        error: result.status === "rejected"
          ? (result.reason instanceof Error ? result.reason.message : String(result.reason))
          : null,
      }))
      .filter((result) => !result.ok);

    if (failedDeletions.length > 0) {
      return NextResponse.json(
        {
          error: "Niet alle WordPress clusterpagina's konden worden verwijderd.",
          failed: failedDeletions,
        },
        { status: 502 }
      );
    }

    await supabase
      .from("asc_wp_posts")
      .delete()
      .eq("site_id", cluster.site_id)
      .eq("user_id", user.id)
      .in("wp_post_id", wpPostIds);
  }

  const { error } = await supabase
    .from("asc_clusters")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
