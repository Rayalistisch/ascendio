import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";
import { deletePost } from "@/lib/wordpress";
import { checkFeatureAccess } from "@/lib/billing";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await checkFeatureAccess(supabase, user.id, "clusters");
  if (!access.allowed) return NextResponse.json({ error: "Upgrade naar Pro om clusters te gebruiken" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const clusterId = searchParams.get("clusterId");
  if (!clusterId) return NextResponse.json({ error: "Missing clusterId" }, { status: 400 });

  const { data, error } = await supabase
    .from("asc_cluster_topics")
    .select("*")
    .eq("cluster_id", clusterId)
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich topics with internal post IDs for SEO editor links
  const topics = data ?? [];
  const wpPostIds = topics
    .filter((t) => t.wp_post_id != null)
    .map((t) => t.wp_post_id as number);

  let postIdMap: Record<number, string> = {};
  if (wpPostIds.length > 0) {
    const { data: posts } = await supabase
      .from("asc_wp_posts")
      .select("id, wp_post_id")
      .in("wp_post_id", wpPostIds);

    if (posts) {
      for (const post of posts) {
        postIdMap[post.wp_post_id] = post.id;
      }
    }
  }

  const enrichedTopics = topics.map((t) => ({
    ...t,
    internal_post_id: t.wp_post_id ? postIdMap[t.wp_post_id] ?? null : null,
  }));

  return NextResponse.json({ topics: enrichedTopics });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await checkFeatureAccess(supabase, user.id, "clusters");
  if (!access.allowed) return NextResponse.json({ error: "Upgrade naar Pro om clusters te gebruiken" }, { status: 403 });

  const body = await request.json();
  const { clusterId, title, description, targetKeywords, sortOrder } = body;

  if (!clusterId || !title) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Verify ownership through cluster
  const { data: cluster } = await supabase
    .from("asc_clusters")
    .select("id")
    .eq("id", clusterId)
    .eq("user_id", user.id)
    .single();
  if (!cluster) return NextResponse.json({ error: "Cluster not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("asc_cluster_topics")
    .insert({
      cluster_id: clusterId,
      user_id: user.id,
      title,
      description: description || null,
      target_keywords: targetKeywords || [],
      sort_order: sortOrder ?? 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ topic: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await checkFeatureAccess(supabase, user.id, "clusters");
  if (!access.allowed) return NextResponse.json({ error: "Upgrade naar Pro om clusters te gebruiken" }, { status: 403 });

  const body = await request.json();
  const { id, title, description, targetKeywords, sortOrder, status } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (targetKeywords !== undefined) updates.target_keywords = targetKeywords;
  if (sortOrder !== undefined) updates.sort_order = sortOrder;
  if (status !== undefined) updates.status = status;

  const { data, error } = await supabase
    .from("asc_cluster_topics")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ topic: data });
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

  const { data: topic, error: topicError } = await supabase
    .from("asc_cluster_topics")
    .select("id, cluster_id, wp_post_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (topicError || !topic) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  const { data: cluster } = await supabase
    .from("asc_clusters")
    .select("site_id, content_type")
    .eq("id", topic.cluster_id)
    .eq("user_id", user.id)
    .single();

  if (!cluster) return NextResponse.json({ error: "Cluster not found" }, { status: 404 });

  if (topic.wp_post_id) {
    const { data: site } = await supabase
      .from("asc_sites")
      .select("wp_base_url, wp_username, wp_app_password_encrypted")
      .eq("id", cluster.site_id)
      .eq("user_id", user.id)
      .single();

    if (!site?.wp_base_url || !site?.wp_username || !site?.wp_app_password_encrypted) {
      return NextResponse.json(
        { error: "WordPress credentials ontbreken; kan clusterpagina niet verwijderen." },
        { status: 400 }
      );
    }

    try {
      await deletePost(
        {
          baseUrl: site.wp_base_url,
          username: site.wp_username,
          appPassword: decrypt(site.wp_app_password_encrypted),
        },
        topic.wp_post_id,
        {
          force: true,
          collection: cluster.content_type === "pages" ? "pages" : "posts",
        }
      );
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "WordPress post verwijderen mislukt",
        },
        { status: 502 }
      );
    }

    await supabase
      .from("asc_wp_posts")
      .delete()
      .eq("site_id", cluster.site_id)
      .eq("user_id", user.id)
      .eq("wp_post_id", topic.wp_post_id);
  }

  const { error } = await supabase
    .from("asc_cluster_topics")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
