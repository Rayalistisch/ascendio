"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { NativeSelect } from "@/components/ui/select";

interface DailyDataPoint {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface ReportSummary {
  current: { clicks: number; impressions: number; ctr: number; position: number };
  previous: { clicks: number; impressions: number; ctr: number; position: number };
  delta: { clicks: number | null; impressions: number | null; ctr: number | null; position: number | null };
}

interface TopQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface ReportData {
  dailyData: DailyDataPoint[];
  summary: ReportSummary;
  topQueries: TopQuery[];
  topPages: Array<{ page: string; clicks: number; impressions: number; ctr: number; position: number }>;
}

function formatDelta(value: number | null, reverse = false): string {
  if (value === null) return "";
  const normalized = reverse ? -value : value;
  const sign = normalized > 0 ? "+" : "";
  return `${sign}${normalized.toFixed(1)}%`;
}

function deltaColor(value: number | null, reverse = false): string {
  if (value === null) return "text-muted-foreground";
  const normalized = reverse ? -value : value;
  return normalized >= 0 ? "text-emerald-600" : "text-red-500";
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString("nl-NL");
}

export function SearchConsoleCharts({ siteId }: { siteId: string }) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState("28");

  const fetchReport = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/search-console/report?siteId=${siteId}&days=${days}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Kon data niet ophalen");
        setData(null);
        return;
      }
      const json = await res.json();
      setData(json);
    } catch {
      setError("Kon Search Console data niet laden");
    } finally {
      setLoading(false);
    }
  }, [siteId, days]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        {error === "Search Console is niet gekoppeld voor deze site"
          ? "Koppel Search Console in instellingen om hier statistieken te zien."
          : error}
      </div>
    );
  }

  if (!data) return null;

  const { summary, dailyData, topQueries } = data;
  const chartData = dailyData.map((d) => ({
    ...d,
    label: formatShortDate(d.date),
    ctrPct: +(d.ctr * 100).toFixed(2),
  }));

  const metrics = [
    {
      label: "Clicks",
      value: formatNumber(summary.current.clicks),
      delta: formatDelta(summary.delta.clicks),
      deltaClass: deltaColor(summary.delta.clicks),
      color: "bg-blue-500/10 text-blue-600",
    },
    {
      label: "Impressions",
      value: formatNumber(summary.current.impressions),
      delta: formatDelta(summary.delta.impressions),
      deltaClass: deltaColor(summary.delta.impressions),
      color: "bg-violet-500/10 text-violet-600",
    },
    {
      label: "CTR",
      value: `${(summary.current.ctr * 100).toFixed(2)}%`,
      delta: formatDelta(summary.delta.ctr),
      deltaClass: deltaColor(summary.delta.ctr),
      color: "bg-emerald-500/10 text-emerald-600",
    },
    {
      label: "Gem. positie",
      value: summary.current.position.toFixed(1),
      delta: formatDelta(summary.delta.position, true),
      deltaClass: deltaColor(summary.delta.position, true),
      color: "bg-amber-500/10 text-amber-600",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Search Console</h2>
        <NativeSelect
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="w-32"
        >
          <option value="7">7 dagen</option>
          <option value="14">14 dagen</option>
          <option value="28">28 dagen</option>
          <option value="60">60 dagen</option>
          <option value="90">90 dagen</option>
        </NativeSelect>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="rounded-xl border bg-card p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">{m.label}</p>
              {m.delta && (
                <span className={`text-xs font-medium ${m.deltaClass}`}>{m.delta}</span>
              )}
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      {chartData.length > 0 && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {/* Clicks & Impressions */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <p className="mb-4 text-sm font-medium text-muted-foreground">Clicks & Impressions</p>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradClicks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradImpressions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  className="fill-muted-foreground"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  className="fill-muted-foreground"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "0.5rem",
                    fontSize: "0.8rem",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="impressions"
                  stroke="#8b5cf6"
                  fill="url(#gradImpressions)"
                  strokeWidth={2}
                  name="Impressions"
                />
                <Area
                  type="monotone"
                  dataKey="clicks"
                  stroke="#3b82f6"
                  fill="url(#gradClicks)"
                  strokeWidth={2}
                  name="Clicks"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Position & CTR */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <p className="mb-4 text-sm font-medium text-muted-foreground">Gem. positie & CTR</p>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  className="fill-muted-foreground"
                />
                <YAxis
                  yAxisId="position"
                  orientation="left"
                  reversed
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  className="fill-muted-foreground"
                  domain={["dataMin - 2", "dataMax + 2"]}
                />
                <YAxis
                  yAxisId="ctr"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  className="fill-muted-foreground"
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "0.5rem",
                    fontSize: "0.8rem",
                  }}
                  formatter={(value: number | undefined, name: string | undefined) =>
                    name === "CTR (%)" ? `${value ?? 0}%` : (value ?? 0).toFixed(1)
                  }
                />
                <Line
                  yAxisId="position"
                  type="monotone"
                  dataKey="position"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                  name="Positie"
                />
                <Line
                  yAxisId="ctr"
                  type="monotone"
                  dataKey="ctrPct"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  name="CTR (%)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Top queries */}
      {topQueries.length > 0 && (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="border-b px-4 py-3">
            <p className="text-sm font-medium">Top zoekopdrachten</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Query</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Clicks</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Impressions</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">CTR</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Positie</th>
                </tr>
              </thead>
              <tbody>
                {topQueries.slice(0, 10).map((row) => (
                  <tr key={row.query} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 font-medium">{row.query}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{row.clicks}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(row.impressions)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{(row.ctr * 100).toFixed(2)}%</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{row.position.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
