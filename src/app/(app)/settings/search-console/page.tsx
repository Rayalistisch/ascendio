"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface Site {
  id: string;
  name: string;
}

interface Property {
  siteUrl: string;
  permissionLevel: string;
}

interface TopQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface SearchConsoleStatus {
  connected: boolean;
  needsReconnect?: boolean;
  error?: string;
  googleAccountEmail?: string | null;
  propertyUrl?: string | null;
  properties?: Property[];
  topQueries?: TopQuery[];
}

interface ReportSummaryMetrics {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface SearchConsoleReport {
  generatedAt: string;
  propertyUrl: string;
  period: {
    days: number;
    startDate: string;
    endDate: string;
    previousStartDate: string;
    previousEndDate: string;
  };
  summary: {
    current: ReportSummaryMetrics;
    previous: ReportSummaryMetrics;
    delta: {
      clicks: number | null;
      impressions: number | null;
      ctr: number | null;
      position: number | null;
    };
  };
  insights: string[];
  topQueries: Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
  topPages: Array<{
    page: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
}

function formatPercent(value: number, fractionDigits = 2): string {
  return `${(value * 100).toFixed(fractionDigits)}%`;
}

function formatDelta(value: number | null, reverse = false): string {
  if (value === null) return "—";
  const normalized = reverse ? -value : value;
  const sign = normalized > 0 ? "+" : "";
  return `${sign}${normalized.toFixed(1)}%`;
}

export default function SearchConsoleSettingsPage() {
  const searchParams = useSearchParams();
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [status, setStatus] = useState<SearchConsoleStatus | null>(null);
  const [loadingSites, setLoadingSites] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [savingProperty, setSavingProperty] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState("");
  const [reportDays, setReportDays] = useState("28");
  const [report, setReport] = useState<SearchConsoleReport | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  const callbackStatus = searchParams.get("status");
  const callbackMessage = searchParams.get("message");

  useEffect(() => {
    async function loadSites() {
      setLoadingSites(true);
      try {
        const res = await fetch("/api/sites");
        const data = await res.json();
        const list: Site[] = data.sites ?? [];
        setSites(list);

        const siteFromUrl = searchParams.get("siteId");
        if (siteFromUrl && list.some((site) => site.id === siteFromUrl)) {
          setSiteId(siteFromUrl);
        } else if (list.length > 0) {
          setSiteId(list[0].id);
        }
      } finally {
        setLoadingSites(false);
      }
    }
    loadSites();
  }, [searchParams]);

  const fetchStatus = useCallback(async () => {
    if (!siteId) return;
    setLoadingStatus(true);
    try {
      const res = await fetch(
        `/api/search-console?siteId=${siteId}&includeTopQueries=1&days=28`
      );
      const data = await res.json();
      setStatus(data);
      setSelectedProperty(data.propertyUrl || "");
    } finally {
      setLoadingStatus(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    setReport(null);
  }, [siteId]);

  async function connect() {
    if (!siteId) return;
    setConnecting(true);
    try {
      const res = await fetch(`/api/search-console/connect?siteId=${siteId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.authUrl) {
        window.alert(data.error || "Kon Google connect URL niet ophalen");
        return;
      }
      window.location.href = data.authUrl;
    } catch {
      window.alert("Kon Google connect URL niet ophalen");
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect() {
    if (!siteId) return;
    const confirmed = window.confirm(
      "Weet je zeker dat je de Search Console koppeling voor deze site wilt verwijderen?"
    );
    if (!confirmed) return;

    setDisconnecting(true);
    try {
      const res = await fetch(`/api/search-console?siteId=${siteId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(data.error || "Ontkoppelen mislukt");
        return;
      }
      await fetchStatus();
    } finally {
      setDisconnecting(false);
    }
  }

  async function saveProperty() {
    if (!siteId || !selectedProperty) return;
    setSavingProperty(true);
    try {
      const res = await fetch("/api/search-console", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, propertyUrl: selectedProperty }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(data.error || "Property opslaan mislukt");
        return;
      }
      await fetchStatus();
    } finally {
      setSavingProperty(false);
    }
  }

  async function generateReport() {
    if (!siteId) return;
    setGeneratingReport(true);
    try {
      const res = await fetch(
        `/api/search-console/report?siteId=${siteId}&days=${encodeURIComponent(
          reportDays
        )}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(data.error || "Rapportage genereren mislukt");
        return;
      }
      setReport(data as SearchConsoleReport);
    } finally {
      setGeneratingReport(false);
    }
  }

  const callbackBanner = useMemo(() => {
    if (!callbackStatus) return null;
    if (callbackStatus === "connected") {
      return {
        tone: "success",
        text: "Search Console is succesvol gekoppeld.",
      };
    }
    return {
      tone: "error",
      text: callbackMessage || "Koppeling is mislukt.",
    };
  }, [callbackStatus, callbackMessage]);

  const properties = status?.properties || [];
  const topQueries = status?.topQueries || [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Search Console</h1>
          <p className="text-muted-foreground mt-1">
            Koppel Google Search Console (read-only) om query- en performance-data op te halen.
          </p>
        </div>
        <Button variant="outline" onClick={() => (window.location.href = "/settings")}>
          Terug
        </Button>
      </div>

      {callbackBanner && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            callbackBanner.tone === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {callbackBanner.text}
        </div>
      )}

      {loadingSites ? (
        <Skeleton className="h-10 w-64" />
      ) : (
        <div className="space-y-2">
          <label className="text-sm font-medium">Site</label>
          <NativeSelect
            value={siteId}
            onChange={(event) => setSiteId(event.target.value)}
            className="w-full sm:w-80"
            disabled={sites.length === 0}
          >
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      {siteId && loadingStatus ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : siteId && status ? (
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">
                  Status: {status.connected ? "Gekoppeld" : "Niet gekoppeld"}
                </p>
                {status.googleAccountEmail && (
                  <p className="text-sm text-muted-foreground">
                    Google account: {status.googleAccountEmail}
                  </p>
                )}
                {status.needsReconnect && (
                  <p className="text-sm text-red-600 mt-1">
                    Token ongeldig of verlopen. Koppel opnieuw.
                  </p>
                )}
                {status.error && !status.needsReconnect && (
                  <p className="text-sm text-red-600 mt-1">{status.error}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!status.connected ? (
                  <Button onClick={connect} disabled={connecting || !siteId}>
                    {connecting ? "Doorsturen..." : "Koppel met Google"}
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={connect}
                      disabled={connecting}
                    >
                      {connecting ? "..." : "Opnieuw koppelen"}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={disconnect}
                      disabled={disconnecting}
                    >
                      {disconnecting ? "Ontkoppelen..." : "Ontkoppelen"}
                    </Button>
                  </>
                )}
              </div>
            </div>

            {status.connected && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Property</label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <NativeSelect
                    value={selectedProperty}
                    onChange={(event) => setSelectedProperty(event.target.value)}
                    className="w-full sm:w-[30rem]"
                  >
                    <option value="">Selecteer property</option>
                    {properties.map((property) => (
                      <option key={property.siteUrl} value={property.siteUrl}>
                        {property.siteUrl} ({property.permissionLevel})
                      </option>
                    ))}
                  </NativeSelect>
                  <Button
                    variant="outline"
                    onClick={saveProperty}
                    disabled={!selectedProperty || savingProperty}
                  >
                    {savingProperty ? "Opslaan..." : "Opslaan"}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {status.connected && selectedProperty && (
            <div className="space-y-4">
              <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <div className="border-b px-4 py-3">
                  <h2 className="font-semibold">Top queries (snelle preview, 28 dagen)</h2>
                </div>
                {topQueries.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-muted-foreground">
                    Geen query-data beschikbaar voor deze periode.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="px-4 py-2 text-left font-medium">Query</th>
                        <th className="px-4 py-2 text-left font-medium">Clicks</th>
                        <th className="px-4 py-2 text-left font-medium">Impressions</th>
                        <th className="px-4 py-2 text-left font-medium">CTR</th>
                        <th className="px-4 py-2 text-left font-medium">Positie</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topQueries.map((row) => (
                        <tr key={row.query} className="border-b last:border-b-0">
                          <td className="px-4 py-2">{row.query}</td>
                          <td className="px-4 py-2">{row.clicks}</td>
                          <td className="px-4 py-2">{row.impressions}</td>
                          <td className="px-4 py-2">{formatPercent(row.ctr)}</td>
                          <td className="px-4 py-2">{row.position.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="rounded-xl border bg-card p-4 shadow-sm space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-semibold">Rapportage genereren</h2>
                    <p className="text-sm text-muted-foreground">
                      Vergelijk huidige periode met de vorige periode van gelijke lengte.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <NativeSelect
                      value={reportDays}
                      onChange={(event) => setReportDays(event.target.value)}
                      className="w-32"
                    >
                      <option value="7">7 dagen</option>
                      <option value="14">14 dagen</option>
                      <option value="28">28 dagen</option>
                      <option value="60">60 dagen</option>
                      <option value="90">90 dagen</option>
                    </NativeSelect>
                    <Button onClick={generateReport} disabled={generatingReport}>
                      {generatingReport ? "Genereren..." : "Genereer rapport"}
                    </Button>
                  </div>
                </div>

                {report ? (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Periode: {report.period.startDate} t/m {report.period.endDate} (vergelijking: {report.period.previousStartDate} t/m {report.period.previousEndDate})
                    </p>

                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Clicks</p>
                        <p className="text-xl font-semibold">{report.summary.current.clicks}</p>
                        <p className="text-xs text-muted-foreground">{formatDelta(report.summary.delta.clicks)}</p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Impressions</p>
                        <p className="text-xl font-semibold">{report.summary.current.impressions}</p>
                        <p className="text-xs text-muted-foreground">{formatDelta(report.summary.delta.impressions)}</p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">CTR</p>
                        <p className="text-xl font-semibold">{formatPercent(report.summary.current.ctr)}</p>
                        <p className="text-xs text-muted-foreground">{formatDelta(report.summary.delta.ctr)}</p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Gem. positie</p>
                        <p className="text-xl font-semibold">{report.summary.current.position.toFixed(1)}</p>
                        <p className="text-xs text-muted-foreground">{formatDelta(report.summary.delta.position, true)}</p>
                      </div>
                    </div>

                    {report.insights.length > 0 && (
                      <div className="rounded-lg border p-3">
                        <h3 className="text-sm font-semibold">Inzichten</h3>
                        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                          {report.insights.map((insight, index) => (
                            <li key={`${index}-${insight}`}>• {insight}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                      <div className="rounded-lg border overflow-hidden">
                        <div className="border-b px-3 py-2 text-sm font-medium">Top queries</div>
                        {report.topQueries.length === 0 ? (
                          <p className="px-3 py-4 text-sm text-muted-foreground">Geen query-data.</p>
                        ) : (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b bg-muted/40">
                                <th className="px-3 py-2 text-left font-medium">Query</th>
                                <th className="px-3 py-2 text-left font-medium">Clicks</th>
                                <th className="px-3 py-2 text-left font-medium">CTR</th>
                              </tr>
                            </thead>
                            <tbody>
                              {report.topQueries.slice(0, 10).map((row) => (
                                <tr key={row.query} className="border-b last:border-b-0">
                                  <td className="px-3 py-2">{row.query}</td>
                                  <td className="px-3 py-2">{row.clicks}</td>
                                  <td className="px-3 py-2">{formatPercent(row.ctr)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>

                      <div className="rounded-lg border overflow-hidden">
                        <div className="border-b px-3 py-2 text-sm font-medium">Top pagina's</div>
                        {report.topPages.length === 0 ? (
                          <p className="px-3 py-4 text-sm text-muted-foreground">Geen pagina-data.</p>
                        ) : (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b bg-muted/40">
                                <th className="px-3 py-2 text-left font-medium">Pagina</th>
                                <th className="px-3 py-2 text-left font-medium">Clicks</th>
                                <th className="px-3 py-2 text-left font-medium">CTR</th>
                              </tr>
                            </thead>
                            <tbody>
                              {report.topPages.slice(0, 10).map((row) => (
                                <tr key={row.page} className="border-b last:border-b-0">
                                  <td className="px-3 py-2 truncate max-w-[300px]">{row.page}</td>
                                  <td className="px-3 py-2">{row.clicks}</td>
                                  <td className="px-3 py-2">{formatPercent(row.ctr)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nog geen rapport gegenereerd voor deze site.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
          Selecteer eerst een site om Search Console te koppelen.
        </div>
      )}
    </div>
  );
}
