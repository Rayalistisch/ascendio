"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

interface RunLog {
  id: string;
  level: string;
  message: string;
  meta: Record<string, unknown> | null;
  created_at: string;
}

interface Run {
  id: string;
  site_id: string;
  schedule_id: string;
  status: "queued" | "running" | "published" | "failed";
  topic: string | null;
  wp_post_id: string | null;
  wp_post_url: string | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  asc_sites: { name: string } | null;
  asc_run_logs: RunLog[];
}

const STATUS_CONFIG: Record<
  Run["status"],
  { label: string; className: string; pulse?: boolean }
> = {
  queued: {
    label: "In wachtrij",
    className: "bg-secondary text-secondary-foreground",
  },
  running: {
    label: "Actief",
    className: "bg-blue-100 text-blue-800",
    pulse: true,
  },
  published: {
    label: "Gepubliceerd",
    className: "bg-green-100 text-green-800",
  },
  failed: {
    label: "Mislukt",
    className: "bg-red-100 text-red-800",
  },
};

const LOG_LEVEL_COLORS: Record<string, string> = {
  info: "text-gray-500",
  warn: "text-yellow-600",
  error: "text-red-600",
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleString("nl-NL");
}

function StatusBadge({ status }: { status: Run["status"] }) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border border-transparent px-2.5 py-0.5 text-xs font-semibold ${config.className}`}
    >
      {config.pulse && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
        </span>
      )}
      {config.label}
    </span>
  );
}

function LogEntry({ log }: { log: RunLog }) {
  const levelColor = LOG_LEVEL_COLORS[log.level] ?? "text-gray-500";

  return (
    <div className="flex gap-3 py-1.5 text-sm font-mono">
      <span className="text-muted-foreground shrink-0">
        {formatDate(log.created_at)}
      </span>
      <span className={`shrink-0 uppercase font-semibold w-12 ${levelColor}`}>
        {log.level}
      </span>
      <span className="text-foreground break-all">{log.message}</span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/runs");
      if (!res.ok) throw new Error("Fout bij ophalen van runs");
      const data = await res.json();
      setRuns(data.runs ?? []);
    } catch {
      // Silently fail on auto-refresh; initial load will show empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRuns();
    const interval = setInterval(fetchRuns, 30_000);
    return () => clearInterval(interval);
  }, [fetchRuns]);

  function toggleExpand(runId: string) {
    setExpandedRunId((prev) => (prev === runId ? null : runId));
  }

  async function cleanupRuns() {
    const cleanupCandidates = runs.filter(
      (run) => run.status === "failed" || run.status === "running"
    );
    if (cleanupCandidates.length === 0) return;

    const confirmed = window.confirm(
      `Weet je zeker dat je ${cleanupCandidates.length} mislukte/actieve runs wilt verwijderen?`
    );
    if (!confirmed) return;

    setCleanupLoading(true);
    try {
      const res = await fetch("/api/runs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statuses: ["failed", "running"] }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || "Runs opschonen mislukt.");
        return;
      }

      const data = await res.json().catch(() => ({}));
      const deletedCount = typeof data.deleted === "number" ? data.deleted : 0;

      setExpandedRunId(null);
      await fetchRuns();

      if (deletedCount > 0) {
        window.alert(`${deletedCount} runs verwijderd.`);
      }
    } finally {
      setCleanupLoading(false);
    }
  }

  const cleanupCandidatesCount = runs.filter(
    (run) => run.status === "failed" || run.status === "running"
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Runs</h1>
          <p className="text-muted-foreground mt-1">
            Geschiedenis van alle AI-publicaties.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={cleanupRuns}
          disabled={loading || cleanupLoading || cleanupCandidatesCount === 0}
        >
          {cleanupLoading
            ? "Opschonen..."
            : `Opschonen (${cleanupCandidatesCount})`}
        </Button>
      </div>

      {loading ? (
        <LoadingSkeleton />
      ) : runs.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed p-12">
          <p className="text-muted-foreground text-sm">
            Nog geen runs gevonden.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead>Onderwerp</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Gepubliceerd URL</TableHead>
                <TableHead>Gestart</TableHead>
                <TableHead>Voltooid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => {
                const isExpanded = expandedRunId === run.id;
                const logs = [...(run.asc_run_logs ?? [])].sort(
                  (a, b) =>
                    new Date(a.created_at).getTime() -
                    new Date(b.created_at).getTime()
                );

                return (
                  <TableRow key={run.id} className="group">
                    <TableCell colSpan={6} className="p-0">
                      {/* Clickable row */}
                      <button
                        type="button"
                        onClick={() => toggleExpand(run.id)}
                        className="flex w-full cursor-pointer items-center text-left hover:bg-muted/50 transition-colors"
                      >
                        <span className="w-full grid grid-cols-6 items-center">
                          <span className="p-2 truncate">
                            {run.asc_sites?.name ?? "—"}
                          </span>
                          <span className="p-2 truncate">
                            {run.topic ?? "—"}
                          </span>
                          <span className="p-2">
                            <StatusBadge status={run.status} />
                          </span>
                          <span className="p-2 truncate">
                            {run.wp_post_url ? (
                              <a
                                href={run.wp_post_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-blue-600 hover:underline"
                              >
                                {run.wp_post_url}
                              </a>
                            ) : (
                              "—"
                            )}
                          </span>
                          <span className="p-2 text-muted-foreground text-sm">
                            {formatDate(run.started_at)}
                          </span>
                          <span className="p-2 text-muted-foreground text-sm">
                            {formatDate(run.finished_at)}
                          </span>
                        </span>
                      </button>

                      {/* Expanded log section */}
                      {isExpanded && (
                        <div className="border-t bg-muted/30 px-4 py-4 space-y-3">
                          {run.error_message && (
                            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                              <span className="font-semibold">Fout:</span>{" "}
                              {run.error_message}
                            </div>
                          )}

                          {logs.length > 0 ? (
                            <div className="space-y-0 divide-y divide-border">
                              {logs.map((log) => (
                                <LogEntry key={log.id} log={log} />
                              ))}
                            </div>
                          ) : (
                            <p className="text-muted-foreground text-sm">
                              Geen logs beschikbaar voor deze run.
                            </p>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
