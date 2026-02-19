"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface Site {
  id: string;
  name: string;
}

interface ScanReport {
  id: string;
  site_id: string;
  status: string;
  pages_scanned: number | null;
  issues_found: number | null;
  issues_fixed: number | null;
  created_at: string;
  finished_at: string | null;
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Wachtend", variant: "secondary" },
  running: { label: "Bezig...", variant: "default" },
  completed: { label: "Voltooid", variant: "outline" },
  failed: { label: "Mislukt", variant: "destructive" },
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("nl-NL");
}

export default function ScannerPage() {
  const router = useRouter();
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [reports, setReports] = useState<ScanReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sites")
      .then((r) => r.json())
      .then((d) => {
        const list = d.sites ?? [];
        setSites(list);
        if (list.length > 0) setSiteId(list[0].id);
      });
  }, []);

  const fetchReports = useCallback(async (options?: { silent?: boolean }) => {
    if (!siteId) return;
    if (!options?.silent) {
      setLoading(true);
    }
    try {
      const res = await fetch(`/api/scanner?siteId=${siteId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Kon scans niet ophalen");
      }
      const data = await res.json();
      setReports(data.reports ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kon scans niet ophalen");
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [siteId]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  useEffect(() => {
    const hasRunningScan = reports.some((report) =>
      report.status === "running" || report.status === "pending"
    );

    if (!hasRunningScan) return;

    const pollId = setInterval(() => {
      void fetchReports({ silent: true });
    }, 5000);

    return () => clearInterval(pollId);
  }, [reports, fetchReports]);

  async function startScan() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/scanner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message = data.error || "Scan starten mislukt";
        setError(message);
        window.alert(message);
        await fetchReports({ silent: true });
        return;
      }

      if (data.report) {
        setReports((prev) => {
          const exists = prev.some((report) => report.id === data.report.id);
          if (exists) return prev;
          return [data.report, ...prev];
        });
      }

      await fetchReports({ silent: true });
    } finally {
      setStarting(false);
    }
  }

  async function deleteReport(reportId: string) {
    if (!window.confirm("Deze scan verwijderen?")) return;

    setDeletingId(reportId);
    setError(null);
    try {
      const res = await fetch(`/api/scanner/${reportId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message = data.error || "Scan verwijderen mislukt";
        setError(message);
        window.alert(message);
        return;
      }

      setReports((prev) => prev.filter((report) => report.id !== reportId));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Site Scanner</h1>
          <p className="text-muted-foreground mt-1">
            Scan je WordPress-site op SEO-problemen. Fixen doe je daarna handmatig per
            issue of in bulk.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {sites.length > 1 && (
            <NativeSelect value={siteId} onChange={(e) => setSiteId(e.target.value)} className="w-48">
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </NativeSelect>
          )}
          <Button onClick={startScan} disabled={starting || !siteId}>
            {starting ? "Bezig..." : "Nieuwe scan"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : reports.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed p-12">
          <p className="text-muted-foreground text-sm">
            Nog geen scans uitgevoerd. Start een scan om SEO-problemen te vinden.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Pagina&apos;s</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Issues</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Gefixt</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Gestart</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Voltooid</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {reports.map((report) => {
                const status = STATUS_MAP[report.status] ?? { label: report.status, variant: "secondary" as const };
                return (
                  <tr key={report.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </td>
                    <td className="px-4 py-3">{report.pages_scanned ?? "—"}</td>
                    <td className="px-4 py-3">
                      {report.issues_found !== null ? (
                        <span className={report.issues_found > 0 ? "text-red-600 font-medium" : "text-green-600"}>
                          {report.issues_found}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {report.issues_fixed !== null ? (
                        <span className="text-green-600">{report.issues_fixed}</span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {formatDate(report.created_at)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {formatDate(report.finished_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {report.status === "completed" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/scanner/${report.id}`)}
                          >
                            Bekijken
                          </Button>
                        )}
                        {(report.status === "running" || report.status === "pending") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteReport(report.id)}
                            disabled={deletingId === report.id}
                          >
                            {deletingId === report.id ? "Verwijderen..." : "Verwijder"}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
