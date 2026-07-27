import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkFeatureAccess } from "@/lib/billing";
import { analyzeClusters, type AnalysisPost } from "@/lib/cluster-analysis";

// pgvector komt via PostgREST binnen als string "[0.1,0.2,...]" of als array.
function parseEmbedding(value: unknown): number[] | null {
  if (Array.isArray(value)) return value as number[];
  if (typeof value === "string" && value.startsWith("[")) {
    try {
      const arr = JSON.parse(value);
      return Array.isArray(arr) ? arr : null;
    } catch {
      return null;
    }
  }
  return null;
}

// POST /api/clusters/analyze — detecteer bestaande clusters uit de contentcache
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await checkFeatureAccess(supabase, user.id, "clusters");
  if (!access.allowed) {
    return NextResponse.json({ error: "Upgrade naar Pro om clusters te gebruiken" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const siteId = (body ?? {}).siteId as string | undefined;
  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  const { data: site } = await supabase
    .from("asc_sites")
    .select("id")
    .eq("id", siteId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!site) return NextResponse.json({ error: "Site niet gevonden" }, { status: 404 });

  const { data: posts } = await supabase
    .from("asc_wp_posts")
    .select("wp_post_id, title, slug, url, content, embedding")
    .eq("site_id", siteId)
    .eq("user_id", user.id)
    .eq("status", "publish")
    .order("last_synced_at", { ascending: false })
    .limit(400);

  if (!posts || posts.length === 0) {
    return NextResponse.json(
      { error: "Geen gecachte posts. Synchroniseer eerst de site." },
      { status: 400 }
    );
  }

  const analysisPosts: AnalysisPost[] = posts.map((p) => ({
    wpPostId: p.wp_post_id,
    title: p.title,
    slug: p.slug,
    url: p.url,
    content: p.content,
    embedding: parseEmbedding(p.embedding),
  }));

  const analysis = analyzeClusters(analysisPosts);
  return NextResponse.json(analysis);
}
