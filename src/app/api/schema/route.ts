import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { auditSchemaForPost, type SchemaAuditPage } from "@/lib/schema-audit";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");
  const search = searchParams.get("search")?.trim() || "";

  if (!siteId) {
    return NextResponse.json({ error: "Missing siteId" }, { status: 400 });
  }

  let query = supabase
    .from("asc_wp_posts")
    .select("id, wp_post_id, title, slug, url, content, excerpt, wp_modified_at")
    .eq("user_id", user.id)
    .eq("site_id", siteId)
    .order("wp_modified_at", { ascending: false })
    .limit(300);

  if (search) {
    query = query.or(`title.ilike.%${search}%,slug.ilike.%${search}%`);
  }

  const { data: posts, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pages: SchemaAuditPage[] = (posts || []).map((post) =>
    auditSchemaForPost({
      id: post.id,
      wp_post_id: post.wp_post_id,
      title: post.title,
      slug: post.slug,
      url: post.url,
      content: post.content,
      excerpt: post.excerpt,
    })
  );

  pages.sort((a, b) => {
    if (a.coverageScore !== b.coverageScore) {
      return a.coverageScore - b.coverageScore;
    }
    return a.title.localeCompare(b.title);
  });

  const pagesWithSchema = pages.filter((page) => page.schemaCount > 0).length;
  const totalSchemaEntities = pages.reduce((sum, page) => sum + page.schemaCount, 0);
  const avgCoverageScore =
    pages.length > 0
      ? Math.round(
          pages.reduce((sum, page) => sum + page.coverageScore, 0) / pages.length
        )
      : 0;

  const typeCounts = new Map<string, number>();
  for (const page of pages) {
    for (const type of page.schemaTypes) {
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    }
  }

  const typeSummary = Array.from(typeCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    summary: {
      totalPages: pages.length,
      pagesWithSchema,
      pagesWithoutSchema: pages.length - pagesWithSchema,
      totalSchemaEntities,
      avgCoverageScore,
      typeSummary,
    },
    pages,
  });
}
