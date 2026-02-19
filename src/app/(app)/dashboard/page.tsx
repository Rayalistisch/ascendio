import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import {
  FileText,
  BarChart3,
  ShieldCheck,
  Globe,
  Calendar,
  Send,
} from "lucide-react";
import { SearchConsoleCharts } from "@/components/search-console-charts";

interface DashboardPageProps {
  searchParams: Promise<{ siteId?: string | string[] }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const supabase = await createClient();
  const resolvedSearchParams = await searchParams;
  const rawSiteId = resolvedSearchParams.siteId;
  const requestedSiteId = Array.isArray(rawSiteId) ? rawSiteId[0] : rawSiteId;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  let activeSiteId: string | null = null;
  let activeSiteName: string | null = null;

  if (requestedSiteId) {
    const { data: activeSite } = await supabase
      .from("asc_sites")
      .select("id, name")
      .eq("id", requestedSiteId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (activeSite) {
      activeSiteId = activeSite.id;
      activeSiteName = activeSite.name;
    }
  }

  const withSiteFilter = <T,>(query: T): T => {
    if (!activeSiteId) return query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (query as any).eq("site_id", activeSiteId);
  };

  const withSiteHref = (href: string): string => {
    if (!activeSiteId) return href;
    return `${href}?siteId=${encodeURIComponent(activeSiteId)}`;
  };

  // Fetch all stats in parallel
  const [
    publishedResult,
    schedulesResult,
    seoIssuesResult,
    socialPostsResult,
    indexedResult,
    avgSeoScoreResult,
  ] = await Promise.all([
    withSiteFilter(
      supabase
        .from("asc_runs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "published")
    ),
    withSiteFilter(
      supabase
        .from("asc_schedules")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_enabled", true)
    ),
    withSiteFilter(
      supabase
        .from("asc_scan_issues")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_fixed", true)
    ),
    withSiteFilter(
      supabase
        .from("asc_social_posts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "sent")
    ),
    withSiteFilter(
      supabase
        .from("asc_indexing_requests")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "submitted")
    ),
    withSiteFilter(
      supabase
        .from("asc_wp_posts")
        .select("seo_score")
        .eq("user_id", user.id)
        .not("seo_score", "is", null)
    ),
  ]);

  const publishedCount = publishedResult.count ?? 0;
  const schedulesCount = schedulesResult.count ?? 0;
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

  function scoreColor(score: number | null): string {
    if (score === null) return "text-muted-foreground";
    if (score >= 80) return "text-emerald-600";
    if (score >= 50) return "text-amber-500";
    return "text-red-500";
  }

  const stats = [
    {
      label: "Gepubliceerd",
      value: publishedCount,
      icon: FileText,
      href: withSiteHref("/runs"),
      accent: "bg-blue-500/10 text-blue-600",
    },
    {
      label: "Gem. SEO-score",
      value: avgSeoScore !== null ? `${avgSeoScore}` : "—",
      suffix: avgSeoScore !== null ? "/100" : "",
      icon: BarChart3,
      href: withSiteHref("/seo-editor"),
      accent: "bg-emerald-500/10 text-emerald-600",
      valueClass: scoreColor(avgSeoScore),
    },
    {
      label: "Issues gefixt",
      value: issuesFixedCount,
      icon: ShieldCheck,
      href: withSiteHref("/scanner"),
      accent: "bg-violet-500/10 text-violet-600",
    },
    {
      label: "Geïndexeerd",
      value: indexedCount,
      icon: Globe,
      href: withSiteHref("/indexing"),
      accent: "bg-amber-500/10 text-amber-600",
    },
    {
      label: "Planningen",
      value: schedulesCount,
      icon: Calendar,
      href: withSiteHref("/schedule"),
      accent: "bg-pink-500/10 text-pink-600",
    },
    {
      label: "Social posts",
      value: socialSentCount,
      icon: Send,
      href: withSiteHref("/social"),
      accent: "bg-cyan-500/10 text-cyan-600",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          {activeSiteName
            ? `Overzicht voor "${activeSiteName}"`
            : "Overzicht van je AI-powered SEO platform."}
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link
              key={stat.label}
              href={stat.href}
              className="group relative rounded-xl border bg-card p-4 shadow-sm transition-all hover:shadow-md hover:border-primary/20"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  {stat.label}
                </p>
                <div className={`rounded-lg p-1.5 ${stat.accent}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
              </div>
              <p className={`mt-2 text-2xl font-bold tracking-tight ${stat.valueClass ?? ""}`}>
                {stat.value}
                {stat.suffix && (
                  <span className="text-sm font-normal text-muted-foreground">{stat.suffix}</span>
                )}
              </p>
            </Link>
          );
        })}
      </div>

      {/* Search Console Charts */}
      {activeSiteId && <SearchConsoleCharts siteId={activeSiteId} />}

      {!activeSiteId && (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <p className="text-muted-foreground">
            Selecteer een site in de zijbalk om Search Console statistieken te bekijken.
          </p>
        </div>
      )}
    </div>
  );
}
