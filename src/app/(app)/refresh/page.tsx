"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, TrendingDown, Anchor, ExternalLink, X, Play } from "lucide-react";

interface Site {
  id: string;
  name: string;
}
interface RefreshItem {
  id: string;
  wp_post_id: number;
  url: string;
  title: string | null;
  reason: "decay" | "stuck";
  score: number;
  status: string;
  error_message: string | null;
  metrics: {
    clicks_now?: number;
    clicks_prev?: number;
    impressions?: number;
    position?: number;
    top_queries?: string[];
  };
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Wachtend",
  refreshing: "Verversen…",
  refreshed: "Ververst",
  failed: "Mislukt",
};

export default function RefreshPage() {
  const searchParams = useSearchParams();
  const urlSiteId = searchParams.get("siteId") || "";

  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<RefreshItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sites")
      .then((r) => r.json())
      .then((d) => {
        const list: Site[] = d.sites ?? [];
        setSites(list);
        if (list.length > 0) {
          setSiteId(urlSiteId && list.some((s) => s.id === urlSiteId) ? urlSiteId : list[0].id);
        } else {
          setLoading(false);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/refresh?siteId=${siteId}`);
      const data = await res.json();
      if (res.ok) setItems(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    load();
    setMessage(null);
  }, [load]);

  // Poll while anything is refreshing
  useEffect(() => {
    if (!items.some((i) => i.status === "refreshing")) return;
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  async function scan() {
    if (!siteId) return;
    setScanning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/refresh/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error || "Scan mislukt");
        return;
      }
      setMessage(`${data.inserted} pagina's gevonden om te verversen.`);
      await load();
    } finally {
      setScanning(false);
    }
  }

  async function run(refreshIds?: string[]) {
    if (!siteId) return;
    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/refresh/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, refreshIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.message || data.error || "Verversen mislukt");
        return;
      }
      window.dispatchEvent(new Event("credits-updated"));
      const parts = [`${data.started} refreshes gestart`];
      if (data.remaining > 0) parts.push(`${data.remaining} resterend`);
      if (data.creditLimited) parts.push("(beperkt door credits)");
      setMessage(parts.join(" — "));
      await load();
    } finally {
      setRunning(false);
    }
  }

  async function dismiss(id: string) {
    await fetch(`/api/refresh/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dismissed" }),
    });
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  if (sites.length === 0 && !loading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed p-12">
        <p className="text-muted-foreground text-sm">Voeg eerst een site toe.</p>
      </div>
    );
  }

  const pendingCount = items.filter((i) => i.status === "pending" || i.status === "failed").length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Content refreshen</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Vind pagina&apos;s die verkeer verliezen of net buiten de top-10 blijven hangen, en
            werk ze automatisch bij op basis van Search Console-data. De scan draait ook wekelijks
            vanzelf.
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
          <Button variant="outline" onClick={scan} disabled={scanning}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${scanning ? "animate-spin" : ""}`} />
            {scanning ? "Scannen…" : "Scan op verval"}
          </Button>
        </div>
      </div>

      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed p-12">
          <p className="text-muted-foreground text-sm">
            Geen refresh-kandidaten. Draai een scan (vereist een gekoppelde Search Console).
          </p>
        </div>
      ) : (
        <>
          {pendingCount > 0 && (
            <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3">
              <span className="text-sm">{pendingCount} pagina&apos;s klaar om te verversen (3 credits per stuk)</span>
              <Button size="sm" onClick={() => run()} disabled={running}>
                <Play className="h-4 w-4 mr-1.5" />
                {running ? "Starten…" : "Ververs alles"}
              </Button>
            </div>
          )}

          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="rounded-lg border bg-card px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium truncate">{item.title || item.url}</span>
                      <Badge
                        variant={item.reason === "decay" ? "destructive" : "secondary"}
                        className="text-xs"
                      >
                        {item.reason === "decay" ? (
                          <><TrendingDown className="h-3 w-3 mr-1" /> Verval</>
                        ) : (
                          <><Anchor className="h-3 w-3 mr-1" /> Vastgelopen</>
                        )}
                      </Badge>
                      <Badge variant="outline" className="text-xs">{STATUS_LABEL[item.status] ?? item.status}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      {item.reason === "decay" ? (
                        <span>Klikken: {item.metrics.clicks_prev ?? 0} → {item.metrics.clicks_now ?? 0}</span>
                      ) : (
                        <span>Positie: {item.metrics.position ?? "—"}</span>
                      )}
                      <span>Vertoningen: {item.metrics.impressions ?? "—"}</span>
                      {item.metrics.top_queries && item.metrics.top_queries.length > 0 && (
                        <span className="truncate">Zoekwoorden: {item.metrics.top_queries.slice(0, 3).join(", ")}</span>
                      )}
                    </div>
                    {item.error_message && (
                      <p className="mt-1 text-xs text-destructive">{item.error_message}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent" title="Bekijk pagina">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                    {(item.status === "pending" || item.status === "failed") && (
                      <Button size="sm" variant="outline" onClick={() => run([item.id])} disabled={running}>
                        Ververs
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => dismiss(item.id)} title="Negeren">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
