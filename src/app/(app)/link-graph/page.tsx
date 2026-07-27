"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Waypoints } from "lucide-react";

interface Site {
  id: string;
  name: string;
}

export default function LinkGraphPage() {
  const searchParams = useSearchParams();
  const urlSiteId = searchParams.get("siteId") || "";

  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{ total: number; embedded: number } | null>(null);
  const [building, setBuilding] = useState(false);
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

  const loadStatus = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/link-graph?siteId=${siteId}`);
      const data = await res.json();
      if (res.ok) setStatus(data);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    loadStatus();
    setMessage(null);
  }, [loadStatus]);

  async function buildGraph() {
    if (!siteId) return;
    setBuilding(true);
    setMessage(null);
    try {
      // Loop in batches of 50 until nothing remains (bounded safety cap).
      let totalEmbedded = 0;
      for (let i = 0; i < 40; i++) {
        const res = await fetch("/api/link-graph", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ siteId }),
        });
        const data = await res.json();
        if (!res.ok) {
          window.alert(data.error || "Bouwen mislukt");
          break;
        }
        totalEmbedded += data.embedded ?? 0;
        setMessage(`${totalEmbedded} posts geïndexeerd…`);
        await loadStatus();
        if (!data.remaining || data.embedded === 0) break;
      }
      setMessage(`Klaar — ${totalEmbedded} posts geïndexeerd.`);
    } finally {
      setBuilding(false);
      await loadStatus();
    }
  }

  if (sites.length === 0 && !loading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed p-12">
        <p className="text-muted-foreground text-sm">Voeg eerst een site toe.</p>
      </div>
    );
  }

  const pct = status && status.total > 0 ? Math.round((status.embedded / status.total) * 100) : 0;
  const remaining = status ? status.total - status.embedded : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Interne link-graaf</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            De link-graaf laat nieuwe artikelen semantisch naar je meest relevante bestaande
            pagina&apos;s linken — in plaats van de AI te laten gokken uit een lijst recente titels.
            Bouw hem één keer op; nieuwe pagina&apos;s worden daarna automatisch toegevoegd.
          </p>
        </div>
        {sites.length > 1 && (
          <NativeSelect value={siteId} onChange={(e) => setSiteId(e.target.value)} className="w-48">
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </NativeSelect>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-5">
          <div className="flex items-center gap-2">
            <Waypoints className="h-4 w-4" />
            <h2 className="font-semibold">Status</h2>
          </div>

          <div>
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-muted-foreground">
                {status?.embedded ?? 0} van {status?.total ?? 0} pagina&apos;s geïndexeerd
              </span>
              <span className="font-medium">{pct}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {status?.total === 0 && (
            <p className="text-sm text-muted-foreground">
              Nog geen pagina&apos;s in de cache. Genereer of synchroniseer eerst content; dan kun je
              de graaf opbouwen.
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={buildGraph} disabled={building || (status?.total ?? 0) === 0}>
              <Waypoints className="h-4 w-4 mr-1.5" />
              {building ? "Bouwen…" : remaining > 0 ? `Bouw graaf (${remaining} te doen)` : "Graaf verversen"}
            </Button>
            {message && <span className="text-sm text-muted-foreground">{message}</span>}
          </div>

          <p className="text-xs text-muted-foreground border-t pt-4">
            Indexeren gebruikt OpenAI-embeddings (text-embedding-3-small) — goedkoop en kost geen
            credits. Zonder <code>OPENAI_API_KEY</code> werkt dit niet.
          </p>
        </div>
      )}
    </div>
  );
}
