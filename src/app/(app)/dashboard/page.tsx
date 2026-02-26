import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
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

  if (!activeSiteId) {
    const { data: firstSite } = await supabase
      .from("asc_sites")
      .select("id, name")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (firstSite) {
      activeSiteId = firstSite.id;
      activeSiteName = firstSite.name;
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
    seoIssuesResult,
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
        .from("asc_scan_issues")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_fixed", true)
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
  const issuesFixedCount = seoIssuesResult.count ?? 0;
  const indexedCount = indexedResult.count ?? 0;

  // Calculate average SEO score
  const seoScores = (avgSeoScoreResult.data ?? [])
    .map((p: { seo_score: number | null }) => p.seo_score)
    .filter((s): s is number => s !== null);
  const avgSeoScore =
    seoScores.length > 0
      ? Math.round(seoScores.reduce((a, b) => a + b, 0) / seoScores.length)
      : null;

  function scoreNumberClass(score: number | null): string {
    if (score === null) return "text-muted-foreground";
    if (score >= 80) return "text-emerald-600";
    if (score >= 50) return "text-amber-500";
    return "text-red-500";
  }

  function scoreBarClass(score: number | null): string {
    if (score === null) return "bg-muted-foreground";
    if (score >= 80) return "bg-emerald-400";
    if (score >= 50) return "bg-amber-400";
    return "bg-red-400";
  }

  const stats = [
    {
      label: "Gepubliceerd",
      subLabel: "Artikelen live gezet",
      value: publishedCount,
      suffix: "",
      href: withSiteHref("/runs"),
      numberClass: "text-blue-600",
      barClass: "bg-blue-400",
      bars: [4, 6, 5, 8, 6, 9, 7],
    },
    {
      label: "Gem. SEO-score",
      subLabel: "Over al je pagina's",
      value: avgSeoScore !== null ? `${avgSeoScore}` : "—",
      suffix: avgSeoScore !== null ? "/100" : "",
      href: withSiteHref("/seo-editor"),
      numberClass: scoreNumberClass(avgSeoScore),
      barClass: scoreBarClass(avgSeoScore),
      bars: [7, 6, 8, 7, 9, 8, 9],
    },
    {
      label: "Issues gefixt",
      subLabel: "SEO-problemen opgelost",
      value: issuesFixedCount,
      suffix: "",
      href: withSiteHref("/scanner"),
      numberClass: "text-violet-600",
      barClass: "bg-violet-400",
      bars: [3, 5, 4, 7, 5, 8, 6],
    },
    {
      label: "Geïndexeerd",
      subLabel: "Pagina's bij Google",
      value: indexedCount,
      suffix: "",
      href: withSiteHref("/indexing"),
      numberClass: "text-amber-600",
      barClass: "bg-amber-400",
      bars: [5, 6, 7, 8, 7, 9, 8],
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {activeSiteName ? `${activeSiteName}` : "Dashboard"}
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          {activeSiteName
            ? "Overzicht van je SEO-prestaties"
            : "Overzicht van je AI-powered SEO platform."}
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="group relative flex flex-col justify-between rounded-2xl border border-white/70 bg-white/60 p-5 shadow-md shadow-black/5 backdrop-blur-sm transition-all hover:bg-white/80 hover:shadow-lg"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">{stat.label}</span>
              <span className="rounded-full bg-muted/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                Bekijk
              </span>
            </div>

            {/* Sub-label */}
            <p className="mt-2 text-xs text-muted-foreground">{stat.subLabel}</p>

            {/* Number + sparkline */}
            <div className="mt-5 flex items-end justify-between">
              <div className="leading-none">
                <span className={`text-4xl font-bold tracking-tight ${stat.numberClass}`}>
                  {stat.value}
                </span>
                {stat.suffix && (
                  <span className="ml-1 text-sm font-normal text-muted-foreground">{stat.suffix}</span>
                )}
              </div>
              <div className="flex items-end gap-0.5 pb-0.5">
                {stat.bars.map((h, i) => (
                  <div
                    key={i}
                    className={`w-1.5 rounded-sm opacity-35 ${stat.barClass}`}
                    style={{ height: `${h * 3}px` }}
                  />
                ))}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Search Console Charts */}
      {activeSiteId && <SearchConsoleCharts siteId={activeSiteId} />}

      {!activeSiteId && (
        <div className="rounded-2xl border border-dashed p-12 text-center">
          <p className="text-muted-foreground">
            Selecteer een site in de zijbalk om Search Console statistieken te bekijken.
          </p>
        </div>
      )}
    </div>
  );
}
