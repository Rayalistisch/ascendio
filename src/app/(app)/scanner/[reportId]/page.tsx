"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { NativeSelect } from "@/components/ui/select";
import { IssueTypeBadge } from "@/components/issue-type-badge";
import { isIssueTypeAutoFixable } from "@/lib/seo-fix";

interface ScanReport {
  id: string;
  status: string;
  total_pages: number | null;
  total_issues: number | null;
  fixed_issues: number | null;
  created_at: string;
}

interface ScanIssue {
  id: string;
  wp_post_id: number;
  page_url: string;
  issue_type: string;
  severity: string;
  description: string;
  current_value: string | null;
  suggested_fix: string | null;
  is_fixed: boolean;
  auto_fixable: boolean;
  fix_details: string | null;
}

function pagePathLabel(pageUrl: string): string {
  try {
    return new URL(pageUrl).pathname || "/";
  } catch {
    return pageUrl;
  }
}

export default function ScanReportPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = params.reportId as string;

  const [report, setReport] = useState<ScanReport | null>(null);
  const [issues, setIssues] = useState<ScanIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [pageFilter, setPageFilter] = useState("all");
  const [sortMode, setSortMode] = useState("issues_desc");
  const [fixingAll, setFixingAll] = useState(false);
  const [fixingId, setFixingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [reportRes, issuesRes] = await Promise.all([
        fetch(`/api/scanner/${reportId}`),
        fetch(`/api/scanner/issues?reportId=${reportId}`),
      ]);
      const reportData = await reportRes.json();
      const issuesData = await issuesRes.json();
      setReport(reportData.report ?? null);
      setIssues(issuesData.issues ?? []);
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function fixIssue(issueId: string) {
    setFixingId(issueId);
    try {
      const res = await fetch("/api/scanner/issues/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || "Fixen mislukt");
        return;
      }
      await fetchData();
    } finally {
      setFixingId(null);
    }
  }

  async function fixAll() {
    setFixingAll(true);
    try {
      const res = await fetch("/api/scanner/issues/fix-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(data.error || "Bulk fixen mislukt");
        return;
      }
      if ((data.enqueued ?? 0) === 0) {
        window.alert("Geen auto-fixbare issues gevonden voor deze selectie.");
      }
      await fetchData();
    } finally {
      setFixingAll(false);
    }
  }

  const filteredIssues = issues.filter((issue) => {
    const matchesStatus =
      filter === "unfixed"
        ? !issue.is_fixed
        : filter === "fixed"
          ? issue.is_fixed
          : filter === "critical"
            ? issue.severity === "critical"
            : true;

    const matchesPage = pageFilter === "all" || issue.page_url === pageFilter;
    return matchesStatus && matchesPage;
  });

  const pageOptions = Array.from(new Set(issues.map((issue) => issue.page_url))).sort();

  const groupedIssues = filteredIssues.reduce<Record<string, ScanIssue[]>>((groups, issue) => {
    if (!groups[issue.page_url]) groups[issue.page_url] = [];
    groups[issue.page_url].push(issue);
    return groups;
  }, {});

  const groupedEntries = Object.entries(groupedIssues).sort((a, b) => {
    if (sortMode === "alpha_asc") {
      return pagePathLabel(a[0]).localeCompare(pagePathLabel(b[0]), "nl");
    }
    return b[1].length - a[1].length;
  });

  const unfixedCount = issues.filter((i) => !i.is_fixed).length;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-20 w-full" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Rapport niet gevonden.</p>
        <Button variant="outline" onClick={() => router.push("/scanner")}>Terug</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.push("/scanner")}>
              &larr; Terug
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">Scan Rapport</h1>
          </div>
          <p className="text-muted-foreground mt-1">
            {report.total_pages ?? 0} pagina&apos;s gescand &middot; {report.total_issues ?? 0} issues gevonden &middot; {report.fixed_issues ?? 0} gefixt
          </p>
        </div>
        {unfixedCount > 0 && (
          <Button onClick={fixAll} disabled={fixingAll}>
            {fixingAll ? "Bezig..." : `Alles fixen (${unfixedCount})`}
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <NativeSelect value={filter} onChange={(e) => setFilter(e.target.value)} className="w-48">
          <option value="all">Alle issues ({issues.length})</option>
          <option value="unfixed">Onopgelost ({unfixedCount})</option>
          <option value="fixed">Gefixt ({issues.length - unfixedCount})</option>
          <option value="critical">Kritiek ({issues.filter((i) => i.severity === "critical").length})</option>
        </NativeSelect>
        <NativeSelect
          value={pageFilter}
          onChange={(e) => setPageFilter(e.target.value)}
          className="w-full max-w-md"
        >
          <option value="all">Alle pagina&apos;s ({pageOptions.length})</option>
          {pageOptions.map((url) => (
            <option key={url} value={url}>
              {url}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value)}
          className="w-56"
        >
          <option value="issues_desc">Meeste issues eerst</option>
          <option value="alpha_asc">Alfabetisch (A-Z)</option>
        </NativeSelect>
      </div>

      {filteredIssues.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed p-12">
          <p className="text-muted-foreground text-sm">
            Geen issues gevonden met dit filter.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {groupedEntries.map(([pageUrl, pageIssues]) => (
            <details key={pageUrl} className="rounded-xl border bg-card shadow-sm">
              <summary className="cursor-pointer list-none p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{pagePathLabel(pageUrl)}</p>
                    <a
                      href={pageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline underline-offset-4"
                    >
                      {pageUrl}
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{pageIssues.length} issues</Badge>
                    <Badge variant="secondary">
                      {pageIssues.filter((issue) => !issue.is_fixed).length} open
                    </Badge>
                  </div>
                </div>
              </summary>
              <div className="space-y-3 border-t p-4">
                {pageIssues.map((issue) => (
                  <div key={issue.id} className="rounded-lg border bg-background p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <IssueTypeBadge type={issue.issue_type} severity={issue.severity} />
                          {issue.is_fixed && <Badge className="bg-green-600 text-white">Gefixt</Badge>}
                        </div>
                        <p className="text-sm">{issue.description}</p>
                        {issue.current_value && (
                          <p className="text-muted-foreground mt-1 text-xs break-words">
                            Details: {issue.current_value}
                          </p>
                        )}
                        {issue.suggested_fix && (
                          <p className="text-muted-foreground mt-1 text-xs break-words">
                            Advies: {issue.suggested_fix}
                          </p>
                        )}
                        {issue.fix_details && (
                          <p className="text-muted-foreground mt-1 text-xs">Fix: {issue.fix_details}</p>
                        )}
                      </div>
                      {!issue.is_fixed && isIssueTypeAutoFixable(issue.issue_type) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fixIssue(issue.id)}
                          disabled={fixingId === issue.id}
                          className="shrink-0"
                        >
                          {fixingId === issue.id ? "Bezig..." : "Fixen"}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
