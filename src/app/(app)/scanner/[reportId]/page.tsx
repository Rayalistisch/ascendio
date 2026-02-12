"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { NativeSelect } from "@/components/ui/select";
import { IssueTypeBadge } from "@/components/issue-type-badge";

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
  is_fixed: boolean;
  fix_details: string | null;
}

export default function ScanReportPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = params.reportId as string;

  const [report, setReport] = useState<ScanReport | null>(null);
  const [issues, setIssues] = useState<ScanIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
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
      await fetch("/api/scanner/issues/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId }),
      });
      fetchData();
    } finally {
      setFixingId(null);
    }
  }

  async function fixAll() {
    setFixingAll(true);
    try {
      await fetch("/api/scanner/issues/fix-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId }),
      });
      fetchData();
    } finally {
      setFixingAll(false);
    }
  }

  const filteredIssues = issues.filter((issue) => {
    if (filter === "unfixed") return !issue.is_fixed;
    if (filter === "fixed") return issue.is_fixed;
    if (filter === "critical") return issue.severity === "critical";
    return true;
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

      {/* Filter */}
      <div className="flex items-center gap-3">
        <NativeSelect value={filter} onChange={(e) => setFilter(e.target.value)} className="w-48">
          <option value="all">Alle issues ({issues.length})</option>
          <option value="unfixed">Onopgelost ({unfixedCount})</option>
          <option value="fixed">Gefixt ({issues.length - unfixedCount})</option>
          <option value="critical">Kritiek ({issues.filter((i) => i.severity === "critical").length})</option>
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
          {filteredIssues.map((issue) => (
            <div key={issue.id} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <IssueTypeBadge type={issue.issue_type} severity={issue.severity} />
                    {issue.is_fixed && <Badge className="bg-green-600 text-white">Gefixt</Badge>}
                  </div>
                  <p className="text-sm">{issue.description}</p>
                  <a href={issue.page_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline underline-offset-4 mt-1 inline-block">
                    {issue.page_url}
                  </a>
                  {issue.fix_details && (
                    <p className="text-xs text-muted-foreground mt-1">Fix: {issue.fix_details}</p>
                  )}
                </div>
                {!issue.is_fixed && (
                  <Button variant="outline" size="sm" onClick={() => fixIssue(issue.id)} disabled={fixingId === issue.id} className="shrink-0">
                    {fixingId === issue.id ? "Bezig..." : "Fixen"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
