import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BlogsClient, type BlogTopic } from "./blogs-client";

export default async function BlogsPage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string }>;
}) {
  const { siteId } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let activeSiteId = siteId;
  if (!activeSiteId) {
    const { data: firstSite } = await supabase
      .from("asc_sites")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    activeSiteId = firstSite?.id;
  }

  if (!activeSiteId) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Blogs</h1>
        <p className="text-muted-foreground">
          Voeg eerst een site toe om blogs te publiceren.
        </p>
      </div>
    );
  }

  const { data: cluster } = await supabase
    .from("asc_clusters")
    .select("id")
    .eq("user_id", user.id)
    .eq("site_id", activeSiteId)
    .eq("name", "Blogs")
    .maybeSingle();

  let topics: BlogTopic[] = [];
  if (cluster) {
    const { data } = await supabase
      .from("asc_cluster_topics")
      .select("id, title, status, generated_title, wp_post_url, created_at")
      .eq("cluster_id", cluster.id)
      .order("created_at", { ascending: false });
    topics = (data as BlogTopic[] | null) ?? [];
  }

  return <BlogsClient siteId={activeSiteId} initialTopics={topics} />;
}
