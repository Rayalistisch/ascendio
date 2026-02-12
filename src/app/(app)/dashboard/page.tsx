import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "queued":
      return <Badge variant="secondary">In wachtrij</Badge>;
    case "running":
      return <Badge variant="default">Bezig...</Badge>;
    case "published":
      return (
        <Badge variant="outline" className="border-green-500 text-green-600">
          Gepubliceerd
        </Badge>
      );
    case "failed":
      return <Badge variant="destructive">Mislukt</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Fetch all stats in parallel
  const [
    sitesResult,
    schedulesResult,
    publishedResult,
    recentRunsResult,
    seoIssuesResult,
    socialPostsResult,
    indexedResult,
    avgSeoScoreResult,
  ] = await Promise.all([
    supabase
      .from("asc_sites")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("asc_schedules")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_enabled", true),
    supabase
      .from("asc_runs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "published"),
    supabase
      .from("asc_runs")
      .select(
        "id, topic, article_title, status, wp_post_url, images_count, internal_links_added, external_links_added, created_at, asc_sites(name)"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("asc_scan_issues")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_fixed", true),
    supabase
      .from("asc_social_posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "sent"),
    supabase
      .from("asc_indexing_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "submitted"),
    supabase
      .from("asc_wp_posts")
      .select("seo_score")
      .eq("user_id", user.id)
      .not("seo_score", "is", null),
  ]);

  const sitesCount = sitesResult.count ?? 0;
  const schedulesCount = schedulesResult.count ?? 0;
  const publishedCount = publishedResult.count ?? 0;
  const issuesFixedCount = seoIssuesResult.count ?? 0;
  const socialSentCount = socialPostsResult.count ?? 0;
  const indexedCount = indexedResult.count ?? 0;

  // Calculate average SEO score
  const seoScores = (avgSeoScoreResult.data ?? [])
    .map((p: { seo_score: number | null }) => p.seo_score)
    .filter((s): s is number => s !== null);
  const avgSeoScore =
    seoScores.length > 0
      ? Math.round(seoScores.reduce((a, b) => a + b, 0) / seoScores.length)
      : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recentRuns = (recentRunsResult.data ?? []).map((r: any) => ({
    id: r.id as string,
    topic: r.topic as string | null,
    articleTitle: r.article_title as string | null,
    status: r.status as string,
    wp_post_url: r.wp_post_url as string | null,
    images_count: r.images_count as number | null,
    internal_links: r.internal_links_added as number | null,
    external_links: r.external_links_added as number | null,
    created_at: r.created_at as string,
    site_name: Array.isArray(r.asc_sites)
      ? r.asc_sites[0]?.name
      : r.asc_sites?.name ?? null,
  }));

  const stats = [
    { label: "Sites", value: sitesCount, href: "/sites" },
    { label: "Actieve schema's", value: schedulesCount, href: "/schedule" },
    { label: "Gepubliceerd", value: publishedCount, href: "/runs" },
    {
      label: "Gem. SEO-score",
      value: avgSeoScore !== null ? `${avgSeoScore}/100` : "—",
      href: "/seo-editor",
    },
    { label: "Issues gefixt", value: issuesFixedCount, href: "/scanner" },
    { label: "Social posts", value: socialSentCount, href: "/social" },
    { label: "Geïndexeerd", value: indexedCount, href: "/indexing" },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Overzicht van je AI-powered SEO platform.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="group rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-accent/50"
          >
            <p className="text-xs font-medium text-muted-foreground">
              {stat.label}
            </p>
            <p className="mt-1 text-2xl font-bold tracking-tight">
              {stat.value}
            </p>
          </Link>
        ))}
      </div>

      {/* Recent runs */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            Recente runs
          </h2>
          <Link
            href="/runs"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Alles bekijken
          </Link>
        </div>

        {recentRuns.length === 0 ? (
          <div className="rounded-xl border bg-card p-12 text-center">
            <p className="text-muted-foreground">
              Nog geen runs uitgevoerd. Maak een{" "}
              <Link
                href="/schedule"
                className="text-primary underline underline-offset-4"
              >
                schema
              </Link>{" "}
              aan om te beginnen.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Site
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Artikel
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Details
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Datum
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {recentRuns.map((run) => (
                    <tr
                      key={run.id}
                      className="transition-colors hover:bg-muted/30"
                    >
                      <td className="px-4 py-3 font-medium">
                        {run.site_name ?? "—"}
                      </td>
                      <td className="px-4 py-3 max-w-[250px]">
                        {run.wp_post_url ? (
                          <a
                            href={run.wp_post_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline underline-offset-4 truncate block"
                          >
                            {run.articleTitle || run.topic || "Bekijk artikel"}
                          </a>
                        ) : (
                          <span className="text-muted-foreground truncate block">
                            {run.articleTitle || run.topic || "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={run.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {run.status === "published" && (
                          <span className="flex gap-2">
                            {run.images_count && (
                              <span>{run.images_count} img</span>
                            )}
                            {run.internal_links !== null &&
                              run.internal_links > 0 && (
                                <span>{run.internal_links} int. links</span>
                              )}
                            {run.external_links !== null &&
                              run.external_links > 0 && (
                                <span>{run.external_links} ext. links</span>
                              )}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {formatDate(run.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
