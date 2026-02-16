"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface Site {
  id: string;
  name: string;
}

type SchemaIssueSeverity = "critical" | "warning" | "info";

interface SchemaIssue {
  severity: SchemaIssueSeverity;
  message: string;
  suggestion?: string;
}

interface SchemaEntity {
  index: number;
  types: string[];
  keys: string[];
  fieldCount: number;
}

interface SchemaAuditPage {
  id: string;
  wpPostId: number | null;
  title: string;
  slug: string;
  url: string;
  schemaCount: number;
  schemaTypes: string[];
  malformedBlockCount: number;
  coverageScore: number;
  entities: SchemaEntity[];
  issues: SchemaIssue[];
}

interface SchemaSummary {
  totalPages: number;
  pagesWithSchema: number;
  pagesWithoutSchema: number;
  totalSchemaEntities: number;
  avgCoverageScore: number;
  typeSummary: Array<{ type: string; count: number }>;
}

function getSeverityStyle(severity: SchemaIssueSeverity): string {
  if (severity === "critical") {
    return "border-red-200 bg-red-50 text-red-800";
  }
  if (severity === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function scoreBadgeClass(score: number): string {
  if (score >= 80) return "bg-green-100 text-green-800";
  if (score >= 50) return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-700";
}

function toPathLabel(url: string, fallbackSlug: string): string {
  if (url) {
    try {
      const parsed = new URL(url);
      return parsed.pathname || "/";
    } catch {
      // Ignore invalid URL
    }
  }
  return fallbackSlug ? `/${fallbackSlug}` : "(onbekende pagina)";
}

export default function SchemaPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [pages, setPages] = useState<SchemaAuditPage[]>([]);
  const [summary, setSummary] = useState<SchemaSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    fetch("/api/sites")
      .then((res) => res.json())
      .then((data) => {
        const list = data.sites ?? [];
        setSites(list);
        if (list.length > 0) {
          setSiteId(list[0].id);
        }
      })
      .catch(() => {
        setError("Kon sites niet laden.");
      });
  }, []);

  const fetchAudit = useCallback(async () => {
    if (!siteId) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ siteId });
      if (debouncedSearch) params.set("search", debouncedSearch);

      const res = await fetch(`/api/schema?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Schema audit ophalen mislukt");
      }

      const incomingPages = data.pages ?? [];
      setPages(incomingPages);
      setSummary(data.summary ?? null);

      setSelectedPageId((prev) => {
        if (prev && incomingPages.some((p: SchemaAuditPage) => p.id === prev)) {
          return prev;
        }
        return incomingPages[0]?.id || null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
      setPages([]);
      setSummary(null);
      setSelectedPageId(null);
    } finally {
      setLoading(false);
    }
  }, [siteId, debouncedSearch]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  async function syncPosts() {
    if (!siteId) return;

    setSyncing(true);
    try {
      await fetch("/api/wp-posts/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      await fetchAudit();
    } finally {
      setSyncing(false);
    }
  }

  const selectedPage = useMemo(
    () => pages.find((page) => page.id === selectedPageId) || null,
    [pages, selectedPageId]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Schema Audit</h1>
          <p className="mt-1 text-muted-foreground">
            Bekijk per pagina welke schema.org markup aanwezig is en waar je kunt verbeteren.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {sites.length > 1 && (
            <NativeSelect
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="w-52"
            >
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </NativeSelect>
          )}
          <Button variant="outline" onClick={syncPosts} disabled={syncing || !siteId}>
            {syncing ? "Synchroniseren..." : "Sync pagina's"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Pagina's</p>
          <p className="mt-1 text-xl font-semibold">{summary?.totalPages ?? 0}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Met schema</p>
          <p className="mt-1 text-xl font-semibold text-green-700">{summary?.pagesWithSchema ?? 0}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Zonder schema</p>
          <p className="mt-1 text-xl font-semibold text-red-700">{summary?.pagesWithoutSchema ?? 0}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Schema entities</p>
          <p className="mt-1 text-xl font-semibold">{summary?.totalSchemaEntities ?? 0}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Gem. score</p>
          <p className="mt-1 text-xl font-semibold">{summary?.avgCoverageScore ?? 0}/100</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr,1.2fr]">
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="border-b p-4">
            <p className="text-lg font-semibold">Pages markup</p>
            <p className="text-xs text-muted-foreground">
              {summary?.pagesWithSchema ?? 0} van {summary?.totalPages ?? 0} pagina's met schema markup
            </p>
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Zoek op pagina of slug..."
              className="mt-3"
            />
          </div>

          <div className="max-h-[560px] overflow-auto p-2">
            {loading ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 8 }).map((_, idx) => (
                  <Skeleton key={idx} className="h-14 w-full" />
                ))}
              </div>
            ) : pages.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                Geen pagina's gevonden voor deze selectie.
              </div>
            ) : (
              pages.map((page) => {
                const selected = page.id === selectedPageId;
                const pathLabel = toPathLabel(page.url, page.slug);

                return (
                  <button
                    key={page.id}
                    type="button"
                    onClick={() => setSelectedPageId(page.id)}
                    className={`mb-2 w-full rounded-lg border p-3 text-left transition ${
                      selected
                        ? "border-primary bg-primary/5"
                        : "border-transparent hover:border-border hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{page.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{pathLabel}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`rounded px-2 py-1 text-xs font-medium ${scoreBadgeClass(page.coverageScore)}`}>
                          {page.coverageScore}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {page.schemaCount}/{Math.max(page.schemaCount + page.issues.length, 1)}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card shadow-sm">
          <div className="border-b p-4">
            <p className="text-lg font-semibold">Markup details</p>
            {selectedPage ? (
              <>
                <p className="mt-1 text-sm font-medium">{selectedPage.title}</p>
                {selectedPage.url && (
                  <a
                    href={selectedPage.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    {toPathLabel(selectedPage.url, selectedPage.slug)}
                  </a>
                )}
              </>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Selecteer een pagina links.</p>
            )}
          </div>

          <div className="space-y-5 p-4">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {!selectedPage ? (
              <p className="text-sm text-muted-foreground">Geen pagina geselecteerd.</p>
            ) : (
              <>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Gevonden schema types
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedPage.schemaTypes.length > 0 ? (
                      selectedPage.schemaTypes.map((type) => (
                        <span
                          key={type}
                          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium"
                        >
                          {type}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-red-700">Geen schema gevonden</span>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Verbeterpunten
                  </p>
                  {selectedPage.issues.length === 0 ? (
                    <div className="mt-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                      Geen problemen gevonden. Deze pagina heeft nette schema markup.
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {selectedPage.issues.map((issue, index) => (
                        <div
                          key={`${issue.message}-${index}`}
                          className={`rounded-lg border p-3 ${getSeverityStyle(issue.severity)}`}
                        >
                          <p className="text-sm font-medium">{issue.message}</p>
                          {issue.suggestion && (
                            <p className="mt-1 text-xs opacity-90">Tip: {issue.suggestion}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    JSON-LD entities
                  </p>
                  {selectedPage.entities.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">Geen entities beschikbaar.</p>
                  ) : (
                    <div className="mt-2 overflow-hidden rounded-lg border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">#</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Type(s)</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Fields</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedPage.entities.map((entity) => (
                            <tr key={entity.index} className="border-t">
                              <td className="px-3 py-2">{entity.index}</td>
                              <td className="px-3 py-2">
                                {entity.types.length > 0 ? entity.types.join(", ") : "(zonder type)"}
                              </td>
                              <td className="px-3 py-2">{entity.fieldCount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {summary && summary.typeSummary.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Type distributie over site
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {summary.typeSummary.slice(0, 8).map((entry) => (
                        <span
                          key={entry.type}
                          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs"
                        >
                          {entry.type}: {entry.count}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
