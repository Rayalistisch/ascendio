"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Network, Crown, ExternalLink, ChevronDown, Sparkles } from "lucide-react";

interface Site {
  id: string;
  name: string;
}
interface Member {
  wpPostId: number;
  title: string;
  url: string;
  inLinks: number;
}
interface DetectedCluster {
  pillar: Member;
  members: Member[];
  size: number;
  cohesionPct: number;
  avgSimilarity: number | null;
}
interface Analysis {
  method: "semantic" | "links";
  totalPosts: number;
  postsWithEmbedding: number;
  totalInternalLinks: number;
  clusters: DetectedCluster[];
  orphans: Member[];
}

export default function DiscoverClustersPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlSiteId = searchParams.get("siteId") || "";

  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [creatingIdx, setCreatingIdx] = useState<number | null>(null);
  const [createdIdx, setCreatedIdx] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showOrphans, setShowOrphans] = useState(false);

  useEffect(() => {
    fetch("/api/sites")
      .then((r) => r.json())
      .then((d) => {
        const list: Site[] = d.sites ?? [];
        setSites(list);
        if (list.length > 0) {
          setSiteId(urlSiteId && list.some((s) => s.id === urlSiteId) ? urlSiteId : list[0].id);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const analyze = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    setAnalysis(null);
    setCreatedIdx(new Set());
    try {
      const res = await fetch("/api/clusters/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error || "Analyse mislukt");
        return;
      }
      setAnalysis(data);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  async function createCluster(cluster: DetectedCluster, idx: number) {
    setCreatingIdx(idx);
    try {
      const res = await fetch("/api/clusters/from-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          name: cluster.pillar.title,
          pillar: cluster.pillar,
          members: cluster.members,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error || "Cluster aanmaken mislukt");
        return;
      }
      setCreatedIdx((prev) => new Set(prev).add(idx));
    } finally {
      setCreatingIdx(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.push("/clusters")}>&larr; Clusters</Button>
          </div>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Bestaande structuur analyseren</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Detecteert welke topic-clusters er al in je content zitten op basis van de interne links
            en semantische gelijkenis. Zo zie je wat er organisch al staat — en welke pagina&apos;s
            los hangen.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {sites.length > 1 && (
            <NativeSelect value={siteId} onChange={(e) => setSiteId(e.target.value)} className="w-48">
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </NativeSelect>
          )}
          <Button onClick={analyze} disabled={loading || !siteId}>
            <Sparkles className="h-4 w-4 mr-1.5" />
            {loading ? "Analyseren…" : "Analyseer"}
          </Button>
        </div>
      </div>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      )}

      {analysis && (
        <>
          <div className="flex flex-wrap gap-4 rounded-lg border bg-muted/20 px-4 py-3 text-sm">
            <span><strong>{analysis.clusters.length}</strong> clusters gevonden</span>
            <span>{analysis.totalPosts} pagina&apos;s geanalyseerd</span>
            <span>{analysis.totalInternalLinks} interne links</span>
            <span className="text-muted-foreground">
              Methode: {analysis.method === "semantic" ? "semantisch (embeddings)" : "linkstructuur"}
            </span>
            {analysis.method === "links" && (
              <span className="text-yellow-700 dark:text-yellow-300">
                Tip: bouw de link-graaf voor een scherpere semantische analyse.
              </span>
            )}
          </div>

          {analysis.clusters.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Geen duidelijke clusters gevonden. Bij weinig interne links helpt het om eerst de
              link-graaf op te bouwen (Optimaliseren → Link-graaf).
            </div>
          ) : (
            <div className="space-y-3">
              {analysis.clusters.map((c, idx) => (
                <div key={idx} className="rounded-xl border bg-card shadow-sm">
                  <div className="flex items-start justify-between gap-3 p-4">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setExpanded(expanded === idx ? null : idx)}>
                      <div className="flex items-center gap-2">
                        <Crown className="h-4 w-4 text-amber-500 shrink-0" />
                        <span className="font-semibold truncate">{c.pillar.title}</span>
                        <Badge variant="outline" className="text-xs">{c.size} pagina&apos;s</Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                        <span>Cohesie: {c.cohesionPct}% onderling gelinkt</span>
                        {c.avgSimilarity !== null && <span>Gelijkenis: {Math.round(c.avgSimilarity * 100)}%</span>}
                        <span>Pillar heeft {c.pillar.inLinks} interne links</span>
                      </div>
                      {c.cohesionPct < 30 && (
                        <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-300">
                          Deze pagina&apos;s horen bij elkaar maar linken nog nauwelijks onderling — kans voor interne links.
                        </p>
                      )}
                    </button>
                    <Button
                      size="sm"
                      variant={createdIdx.has(idx) ? "outline" : "default"}
                      onClick={() => createCluster(c, idx)}
                      disabled={creatingIdx === idx || createdIdx.has(idx)}
                      className="shrink-0"
                    >
                      <Network className="h-4 w-4 mr-1" />
                      {createdIdx.has(idx) ? "Aangemaakt ✓" : creatingIdx === idx ? "Bezig…" : "Maak cluster"}
                    </Button>
                  </div>

                  {expanded === idx && (
                    <div className="border-t px-4 py-3 space-y-1.5">
                      {c.members.map((m) => (
                        <div key={m.wpPostId} className="flex items-center justify-between rounded-md border px-3 py-1.5">
                          <span className="text-sm truncate flex items-center gap-1.5">
                            {m.wpPostId === c.pillar.wpPostId && <Crown className="h-3 w-3 text-amber-500 shrink-0" />}
                            {m.title}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-muted-foreground">{m.inLinks} links</span>
                            {m.url && (
                              <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {analysis.orphans.length > 0 && (
            <div className="rounded-xl border bg-card">
              <button type="button" onClick={() => setShowOrphans(!showOrphans)} className="flex w-full items-center justify-between p-4 text-left">
                <span className="font-semibold">
                  {analysis.orphans.length} losse pagina&apos;s <span className="font-normal text-muted-foreground">(geen interne links)</span>
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${showOrphans ? "rotate-180" : ""}`} />
              </button>
              {showOrphans && (
                <div className="border-t px-4 py-3 space-y-1.5">
                  <p className="text-xs text-muted-foreground mb-2">
                    Deze pagina&apos;s staan geïsoleerd — geen enkele interne link naar of vanaf. Goede kandidaten om in een cluster op te nemen.
                  </p>
                  {analysis.orphans.map((o) => (
                    <div key={o.wpPostId} className="flex items-center justify-between rounded-md border px-3 py-1.5">
                      <span className="text-sm truncate">{o.title}</span>
                      {o.url && (
                        <a href={o.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground shrink-0">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
