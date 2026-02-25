"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
} from "recharts";

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

function csvRow(cells: (string | number)[]): string {
  return cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",");
}

function exportCsv(report: SearchConsoleReport, propertyUrl: string) {
  const lines: string[] = [];
  const p = report.period;

  lines.push(csvRow(["Search Console Rapport"]));
  lines.push(csvRow(["Property", propertyUrl]));
  lines.push(csvRow(["Periode", `${p.startDate} t/m ${p.endDate}`]));
  lines.push(csvRow(["Vergelijking", `${p.previousStartDate} t/m ${p.previousEndDate}`]));
  lines.push("");

  lines.push(csvRow(["Samenvatting", "Huidig", "Vorige periode", "Delta"]));
  const s = report.summary;
  lines.push(csvRow(["Clicks", s.current.clicks, s.previous.clicks, formatDelta(s.delta.clicks)]));
  lines.push(csvRow(["Impressions", s.current.impressions, s.previous.impressions, formatDelta(s.delta.impressions)]));
  lines.push(csvRow(["CTR", formatPercent(s.current.ctr), formatPercent(s.previous.ctr), formatDelta(s.delta.ctr)]));
  lines.push(csvRow(["Gem. positie", s.current.position.toFixed(1), s.previous.position.toFixed(1), formatDelta(s.delta.position, true)]));
  lines.push("");

  lines.push(csvRow(["Top Queries"]));
  lines.push(csvRow(["Query", "Clicks", "Impressions", "CTR", "Positie"]));
  for (const row of report.topQueries) {
    lines.push(csvRow([row.query, row.clicks, row.impressions, formatPercent(row.ctr), row.position.toFixed(1)]));
  }
  lines.push("");

  lines.push(csvRow(["Top Pagina's"]));
  lines.push(csvRow(["Pagina", "Clicks", "Impressions", "CTR", "Positie"]));
  for (const row of report.topPages) {
    lines.push(csvRow([row.page, row.clicks, row.impressions, formatPercent(row.ctr), row.position.toFixed(1)]));
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `search-console-rapport-${p.startDate}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportPdf(report: SearchConsoleReport, propertyUrl: string) {
  const p = report.period;
  const s = report.summary;

  const queryRows = report.topQueries
    .map((r) => `<tr><td>${r.query}</td><td>${r.clicks}</td><td>${r.impressions}</td><td>${formatPercent(r.ctr)}</td><td>${r.position.toFixed(1)}</td></tr>`)
    .join("");

  const pageRows = report.topPages
    .map((r) => `<tr><td style="word-break:break-all">${r.page}</td><td>${r.clicks}</td><td>${r.impressions}</td><td>${formatPercent(r.ctr)}</td><td>${r.position.toFixed(1)}</td></tr>`)
    .join("");

  const insightsList = report.insights.length > 0
    ? `<ul>${report.insights.map((i) => `<li>${i}</li>`).join("")}</ul>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8"/>
  <title>Search Console Rapport — ${p.startDate}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:#111;padding:2.5rem}
    h1{font-size:1.4rem;font-weight:700;margin-bottom:.25rem}
    h2{font-size:1rem;font-weight:600;margin:1.5rem 0 .5rem}
    .meta{color:#555;font-size:.8rem;margin-bottom:1.5rem}
    .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:.75rem;margin-bottom:1.5rem}
    .metric{border:1px solid #e2e8f0;border-radius:.5rem;padding:.75rem}
    .metric-label{font-size:.7rem;color:#777;text-transform:uppercase;letter-spacing:.05em}
    .metric-value{font-size:1.4rem;font-weight:700;margin:.2rem 0}
    .metric-delta{font-size:.75rem;color:#555}
    table{width:100%;border-collapse:collapse;margin-bottom:1.5rem;font-size:.8rem}
    th{background:#f8fafc;border:1px solid #e2e8f0;padding:.4rem .6rem;text-align:left;font-weight:600}
    td{border:1px solid #e2e8f0;padding:.4rem .6rem}
    ul{padding-left:1.25rem;margin-bottom:1rem}
    li{margin:.25rem 0;font-size:.85rem;color:#444}
    @media print{body{padding:1rem}@page{margin:1.5cm}}
  </style>
</head>
<body>
  <h1>Search Console Rapport</h1>
  <p class="meta">
    Property: <strong>${propertyUrl}</strong><br/>
    Periode: ${p.startDate} t/m ${p.endDate} &nbsp;|&nbsp; Vergelijking: ${p.previousStartDate} t/m ${p.previousEndDate}
  </p>
  <h2>Samenvatting</h2>
  <div class="metrics">
    <div class="metric"><div class="metric-label">Clicks</div><div class="metric-value">${s.current.clicks}</div><div class="metric-delta">${formatDelta(s.delta.clicks)} vs. vorige periode</div></div>
    <div class="metric"><div class="metric-label">Impressions</div><div class="metric-value">${s.current.impressions}</div><div class="metric-delta">${formatDelta(s.delta.impressions)} vs. vorige periode</div></div>
    <div class="metric"><div class="metric-label">CTR</div><div class="metric-value">${formatPercent(s.current.ctr)}</div><div class="metric-delta">${formatDelta(s.delta.ctr)} vs. vorige periode</div></div>
    <div class="metric"><div class="metric-label">Gem. positie</div><div class="metric-value">${s.current.position.toFixed(1)}</div><div class="metric-delta">${formatDelta(s.delta.position, true)} vs. vorige periode</div></div>
  </div>
  ${report.insights.length > 0 ? `<h2>Inzichten</h2>${insightsList}` : ""}
  <h2>Top Queries</h2>
  <table><thead><tr><th>Query</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Positie</th></tr></thead><tbody>${queryRows}</tbody></table>
  <h2>Top Pagina's</h2>
  <table><thead><tr><th>Pagina</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Positie</th></tr></thead><tbody>${pageRows}</tbody></table>
  <script>window.onload=function(){window.print()}<\/script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

function MiniSparkline({
  prev,
  curr,
  reverse = false,
}: {
  prev: number;
  curr: number;
  reverse?: boolean;
}) {
  const isPositive = reverse ? curr < prev : curr > prev;
  const color = isPositive ? "#10b981" : "#ef4444";
  const data = [{ v: prev }, { v: curr }];
  return (
    <LineChart data={data} width={60} height={28} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
      <Line type="monotone" dataKey="v" dot={false} stroke={color} strokeWidth={2} />
    </LineChart>
  );
}

function DeltaBadge({ value, reverse = false }: { value: number | null; reverse?: boolean }) {
  if (value === null) return <span className="text-xs text-muted-foreground">—</span>;
  const isPositive = reverse ? value < 0 : value > 0;
  const sign = value > 0 ? "+" : "";
  return (
    <span className={`text-xs font-semibold ${isPositive ? "text-emerald-600" : "text-red-500"}`}>
      {sign}{value.toFixed(1)}% vs. vorige periode
    </span>
  );
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
  const s = report?.summary;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Search Console</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Koppel Google Search Console (read-only) om query- en performance-data op te halen.
        </p>
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

      {/* Site selector */}
      {!loadingSites && sites.length > 1 && (
        <NativeSelect
          value={siteId}
          onChange={(event) => setSiteId(event.target.value)}
          className="w-full sm:w-72"
        >
          {sites.map((site) => (
            <option key={site.id} value={site.id}>{site.name}</option>
          ))}
        </NativeSelect>
      )}

      {siteId && loadingStatus ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : siteId && status ? (
        <div className="space-y-5">

          {/* ── Connection + property bar ── */}
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className={`size-2 shrink-0 rounded-full ${status.connected ? "bg-emerald-500" : "bg-amber-400"}`} />
                <span className="text-sm font-medium">
                  {status.connected ? "Google verbonden" : "Niet verbonden"}
                </span>
                {status.googleAccountEmail && (
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    ({status.googleAccountEmail})
                  </span>
                )}
                {(status.needsReconnect || status.error) && (
                  <span className="text-xs text-red-600">
                    {status.needsReconnect ? "Token verlopen — koppel opnieuw" : status.error}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!status.connected ? (
                  <Button size="sm" onClick={connect} disabled={connecting}>
                    {connecting ? "Doorsturen..." : "Koppel met Google"}
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" size="sm" onClick={connect} disabled={connecting}>
                      {connecting ? "..." : "Opnieuw koppelen"}
                    </Button>
                    <Button variant="destructive" size="sm" onClick={disconnect} disabled={disconnecting}>
                      {disconnecting ? "..." : "Ontkoppelen"}
                    </Button>
                  </>
                )}
              </div>
            </div>
            {status.connected && (
              <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2.5">
                <span className="text-xs text-muted-foreground shrink-0">Property</span>
                <NativeSelect
                  value={selectedProperty}
                  onChange={(event) => setSelectedProperty(event.target.value)}
                  className="h-7 flex-1 max-w-sm text-xs"
                >
                  <option value="">Selecteer property</option>
                  {properties.map((p) => (
                    <option key={p.siteUrl} value={p.siteUrl}>
                      {p.siteUrl} ({p.permissionLevel})
                    </option>
                  ))}
                </NativeSelect>
                <Button variant="outline" size="sm" onClick={saveProperty} disabled={!selectedProperty || savingProperty}>
                  {savingProperty ? "Opslaan..." : "Opslaan"}
                </Button>
              </div>
            )}
          </div>

          {/* ── Report section ── */}
          {status.connected && selectedProperty && (
            <>
              {/* Single control bar: period + generate + export (export only when report exists) */}
              <div className="flex flex-wrap items-center gap-2">
                <NativeSelect
                  value={reportDays}
                  onChange={(event) => setReportDays(event.target.value)}
                  className="w-28 text-xs h-8"
                >
                  <option value="7">7 dagen</option>
                  <option value="14">14 dagen</option>
                  <option value="28">28 dagen</option>
                  <option value="60">60 dagen</option>
                  <option value="90">90 dagen</option>
                </NativeSelect>
                <Button onClick={generateReport} disabled={generatingReport} size="sm">
                  {generatingReport ? "Genereren..." : "Genereer rapport"}
                </Button>
                {report && (
                  <>
                    <div className="h-4 w-px bg-border mx-1" />
                    <button
                      onClick={() => exportCsv(report, selectedProperty)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-xs transition-colors hover:bg-emerald-100"
                    >
                      <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                      CSV
                    </button>
                    <button
                      onClick={() => exportPdf(report, selectedProperty)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-xs transition-colors hover:bg-rose-100"
                    >
                      <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                      PDF
                    </button>
                    <span className="ml-1 text-xs text-muted-foreground">
                      {report.period.startDate} – {report.period.endDate}
                    </span>
                  </>
                )}
              </div>

              {/* ── Dashboard ── */}
              {report && s ? (
                <div className="space-y-4">

                  {/* 4 stat cards */}
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {[
                      { label: "Clicks", curr: s.current.clicks, prev: s.previous.clicks, delta: s.delta.clicks, fmt: (v: number) => String(v), reverse: false },
                      { label: "Impressions", curr: s.current.impressions, prev: s.previous.impressions, delta: s.delta.impressions, fmt: (v: number) => String(v), reverse: false },
                      { label: "CTR", curr: s.current.ctr, prev: s.previous.ctr, delta: s.delta.ctr, fmt: (v: number) => formatPercent(v), reverse: false },
                      { label: "Gem. positie", curr: s.current.position, prev: s.previous.position, delta: s.delta.position, fmt: (v: number) => v.toFixed(1), reverse: true },
                    ].map((card) => (
                      <div key={card.label} className="rounded-xl border bg-card p-4 shadow-sm">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{card.label}</p>
                        <div className="mt-2 flex items-end justify-between gap-2">
                          <p className="text-2xl font-bold leading-none">{card.fmt(card.curr)}</p>
                          <MiniSparkline prev={card.prev} curr={card.curr} reverse={card.reverse} />
                        </div>
                        <div className="mt-1.5">
                          <DeltaBadge value={card.delta} reverse={card.reverse} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Dark chart + top pages */}
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    <div className="xl:col-span-2 rounded-xl bg-slate-950 p-5">
                      <p className="mb-4 text-sm font-semibold text-white">Top Queries — Clicks</p>
                      <ResponsiveContainer width="100%" height={report.topQueries.length > 5 ? 280 : 180}>
                        <BarChart
                          data={report.topQueries.slice(0, 8)}
                          layout="vertical"
                          margin={{ top: 0, right: 24, bottom: 0, left: 0 }}
                        >
                          <XAxis
                            type="number"
                            stroke="#374151"
                            tick={{ fill: "#9ca3af", fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            type="category"
                            dataKey="query"
                            width={130}
                            tick={{ fill: "#d1d5db", fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v: string) => v.length > 20 ? v.slice(0, 20) + "…" : v}
                          />
                          <Tooltip
                            contentStyle={{ background: "#1e293b", border: "none", borderRadius: "8px", color: "#f1f5f9", fontSize: "12px" }}
                            cursor={{ fill: "rgba(255,255,255,0.04)" }}
                          />
                          <Bar dataKey="clicks" fill="#a3e635" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="rounded-xl border bg-card p-4 shadow-sm">
                      <p className="mb-3 text-sm font-semibold">Top Pagina&apos;s</p>
                      <div className="space-y-3">
                        {report.topPages.slice(0, 7).map((p, i) => (
                          <div key={p.page} className="flex items-start gap-3">
                            <span className="mt-0.5 text-xs font-semibold text-muted-foreground w-4 shrink-0">{i + 1}</span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium" title={p.page}>
                                {p.page.replace(/https?:\/\/[^/]+/, "") || "/"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {p.clicks} clicks · {formatPercent(p.ctr)} CTR · pos {p.position.toFixed(1)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Insights */}
                  {report.insights.length > 0 && (
                    <div className="rounded-xl border bg-card p-4 shadow-sm">
                      <p className="text-sm font-semibold">Inzichten</p>
                      <ul className="mt-2 space-y-1.5">
                        {report.insights.map((insight, index) => (
                          <li key={`${index}-${insight}`} className="flex gap-2 text-sm text-muted-foreground">
                            <span className="mt-px shrink-0 text-indigo-400">•</span>
                            <span>{insight}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Full tables */}
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                      <div className="border-b px-4 py-3"><p className="text-sm font-semibold">Top Queries</p></div>
                      {report.topQueries.length === 0 ? (
                        <p className="px-4 py-6 text-sm text-muted-foreground">Geen data.</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead><tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                            <th className="px-4 py-2.5 text-left font-medium">Query</th>
                            <th className="px-3 py-2.5 text-right font-medium">Clicks</th>
                            <th className="px-3 py-2.5 text-right font-medium">Impr.</th>
                            <th className="px-3 py-2.5 text-right font-medium">CTR</th>
                            <th className="px-3 py-2.5 text-right font-medium">Pos.</th>
                          </tr></thead>
                          <tbody>
                            {report.topQueries.slice(0, 10).map((row) => (
                              <tr key={row.query} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                                <td className="max-w-[160px] truncate px-4 py-2.5 text-xs" title={row.query}>{row.query}</td>
                                <td className="px-3 py-2.5 text-right text-xs">{row.clicks}</td>
                                <td className="px-3 py-2.5 text-right text-xs">{row.impressions}</td>
                                <td className="px-3 py-2.5 text-right text-xs">{formatPercent(row.ctr)}</td>
                                <td className="px-3 py-2.5 text-right text-xs">{row.position.toFixed(1)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                      <div className="border-b px-4 py-3"><p className="text-sm font-semibold">Top Pagina&apos;s</p></div>
                      {report.topPages.length === 0 ? (
                        <p className="px-4 py-6 text-sm text-muted-foreground">Geen data.</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead><tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                            <th className="px-4 py-2.5 text-left font-medium">Pagina</th>
                            <th className="px-3 py-2.5 text-right font-medium">Clicks</th>
                            <th className="px-3 py-2.5 text-right font-medium">Impr.</th>
                            <th className="px-3 py-2.5 text-right font-medium">CTR</th>
                            <th className="px-3 py-2.5 text-right font-medium">Pos.</th>
                          </tr></thead>
                          <tbody>
                            {report.topPages.slice(0, 10).map((row) => (
                              <tr key={row.page} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                                <td className="max-w-[160px] truncate px-4 py-2.5 text-xs" title={row.page}>
                                  {row.page.replace(/https?:\/\/[^/]+/, "") || "/"}
                                </td>
                                <td className="px-3 py-2.5 text-right text-xs">{row.clicks}</td>
                                <td className="px-3 py-2.5 text-right text-xs">{row.impressions}</td>
                                <td className="px-3 py-2.5 text-right text-xs">{formatPercent(row.ctr)}</td>
                                <td className="px-3 py-2.5 text-right text-xs">{row.position.toFixed(1)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>

                </div>
              ) : (
                <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                  Kies een periode en klik op &ldquo;Genereer rapport&rdquo; om te starten.
                </div>
              )}
            </>
          )}

        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Selecteer een site om Search Console te koppelen.
        </div>
      )}
    </div>
  );
}
