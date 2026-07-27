"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Sparkles, Trash2, ChevronDown, Database, X } from "lucide-react";

interface Site {
  id: string;
  name: string;
}
interface Opportunity {
  id: string;
  keyword: string;
  source: string;
  intent: string | null;
  volume: number | null;
  difficulty: number | null;
  position: number | null;
  impressions: number | null;
  gap_score: number | null;
  paa: string[];
  related: string[];
  serp_titles: string[];
  status: string;
}

const INTENT_LABEL: Record<string, string> = {
  informational: "Informatief",
  commercial: "Commercieel",
  transactional: "Transactioneel",
  navigational: "Navigatie",
};

export default function KeywordsPage() {
  const searchParams = useSearchParams();
  const urlSiteId = searchParams.get("siteId") || "";

  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [loading, setLoading] = useState(true);

  const [seed, setSeed] = useState("");
  const [researching, setResearching] = useState(false);
  const [gscLoading, setGscLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [serperWarning, setSerperWarning] = useState(false);

  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [datasetName, setDatasetName] = useState("");
  const [creatingDataset, setCreatingDataset] = useState(false);
  const [createdDatasetId, setCreatedDatasetId] = useState<string | null>(null);

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

  const loadOpportunities = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/keywords?siteId=${siteId}`);
      const data = await res.json();
      setOpportunities(data.opportunities ?? []);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    loadOpportunities();
    setSelected(new Set());
    setCreatedDatasetId(null);
  }, [loadOpportunities]);

  async function research() {
    if (!seed.trim() || !siteId) return;
    setResearching(true);
    setMessage(null);
    setSerperWarning(false);
    try {
      const res = await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, seed }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error === "insufficient_credits" ? "Niet genoeg credits" : data.error || "Onderzoek mislukt");
        return;
      }
      window.dispatchEvent(new Event("credits-updated"));
      if (!data.serperConfigured) setSerperWarning(true);
      setSeed("");
      await loadOpportunities();
    } finally {
      setResearching(false);
    }
  }

  async function pullGsc() {
    if (!siteId) return;
    setGscLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/keywords/gsc-opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error || "Search Console ophalen mislukt");
        return;
      }
      setMessage(`${data.inserted} quick wins uit Search Console opgehaald.`);
      await loadOpportunities();
    } finally {
      setGscLoading(false);
    }
  }

  async function dismiss(id: string) {
    await fetch(`/api/keywords/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dismissed" }),
    });
    setOpportunities((prev) => prev.filter((o) => o.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createDataset() {
    if (selected.size === 0) return;
    setCreatingDataset(true);
    try {
      const res = await fetch("/api/keywords/to-dataset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          name: datasetName || "Keyword-set",
          keywordIds: Array.from(selected),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error || "Dataset aanmaken mislukt");
        return;
      }
      setCreatedDatasetId(data.datasetId);
      setSelected(new Set());
      setDatasetName("");
      await loadOpportunities();
    } finally {
      setCreatingDataset(false);
    }
  }

  if (sites.length === 0 && !loading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed p-12">
        <p className="text-muted-foreground text-sm">Voeg eerst een site toe om keyword-onderzoek te gebruiken.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Keyword-onderzoek</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Vind echte zoekkansen uit Google en Search Console. Zet ze om in een dataset voor
            programmatic pagina&apos;s of gebruik ze als onderwerp voor een cluster.
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

      {/* Research bar */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && research()}
            placeholder="Zoekwoord onderzoeken, bijv. dakkapel plaatsen"
            className="flex-1"
          />
          <Button onClick={research} disabled={researching || !seed.trim()}>
            <Search className="h-4 w-4 mr-1.5" />
            {researching ? "Onderzoeken…" : "Onderzoek (1 credit)"}
          </Button>
          <Button variant="outline" onClick={pullGsc} disabled={gscLoading}>
            <Sparkles className="h-4 w-4 mr-1.5" />
            {gscLoading ? "Ophalen…" : "Quick wins uit Search Console"}
          </Button>
        </div>
        {serperWarning && (
          <p className="text-xs text-yellow-700 dark:text-yellow-300">
            SERPER_API_KEY niet ingesteld — het zoekwoord is opgeslagen zonder SERP-context (titels/PAA/gerelateerd).
          </p>
        )}
        {message && <p className="text-xs text-muted-foreground">{message}</p>}
      </div>

      {createdDatasetId && (
        <div className="flex items-center justify-between rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/20 px-4 py-3 text-sm text-green-800 dark:text-green-200">
          <span>Dataset aangemaakt. Ga verder in Programmatic om er pagina&apos;s van te genereren.</span>
          <Link href={`/programmatic?siteId=${siteId}`} className="underline font-medium shrink-0 ml-3">
            Naar Programmatic →
          </Link>
        </div>
      )}

      {/* Opportunities */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : opportunities.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed p-12">
          <p className="text-muted-foreground text-sm">
            Nog geen zoekkansen. Onderzoek een zoekwoord of haal quick wins op uit Search Console.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {opportunities.map((o) => {
            const hasContext = o.paa.length > 0 || o.related.length > 0 || o.serp_titles.length > 0;
            return (
              <div key={o.id} className="rounded-lg border bg-card">
                <div className="flex items-center gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(o.id)}
                    onChange={() => toggleSelect(o.id)}
                    className="h-4 w-4 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{o.keyword}</span>
                      <Badge variant="outline" className="text-xs">
                        {o.source === "gsc" ? "Search Console" : "Google SERP"}
                      </Badge>
                      {o.intent && (
                        <Badge variant="secondary" className="text-xs">{INTENT_LABEL[o.intent] ?? o.intent}</Badge>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      <span>Volume: {o.volume ?? "—"}</span>
                      <span>Difficulty: {o.difficulty ?? "—"}</span>
                      {o.source === "gsc" && (
                        <>
                          <span>Positie: {o.position ?? "—"}</span>
                          <span>Vertoningen: {o.impressions ?? "—"}</span>
                          <span>Kansscore: {o.gap_score ?? "—"}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {hasContext && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}
                        title="SERP-context"
                      >
                        <ChevronDown className={`h-4 w-4 transition-transform ${expandedId === o.id ? "rotate-180" : ""}`} />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => dismiss(o.id)} title="Verbergen">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {expandedId === o.id && hasContext && (
                  <div className="border-t bg-muted/20 px-4 py-3 space-y-3 text-xs">
                    {o.paa.length > 0 && (
                      <div>
                        <p className="font-semibold mb-1">Mensen vragen ook</p>
                        <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                          {o.paa.map((q, i) => <li key={i}>{q}</li>)}
                        </ul>
                      </div>
                    )}
                    {o.related.length > 0 && (
                      <div>
                        <p className="font-semibold mb-1">Gerelateerde zoekopdrachten</p>
                        <div className="flex flex-wrap gap-1.5">
                          {o.related.map((r, i) => (
                            <span key={i} className="rounded-md border bg-background px-2 py-0.5">{r}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {o.serp_titles.length > 0 && (
                      <div>
                        <p className="font-semibold mb-1">Top-10 titels (concurrentie)</p>
                        <ul className="list-decimal pl-4 space-y-0.5 text-muted-foreground">
                          {o.serp_titles.map((t, i) => <li key={i}>{t}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Selection action bar */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-lg sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            <span className="text-sm font-medium">{selected.size} geselecteerd</span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="space-y-1">
              <Label className="text-xs sr-only">Datasetnaam</Label>
              <Input
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
                placeholder="Datasetnaam (optioneel)"
                className="sm:w-56"
              />
            </div>
            <Button onClick={createDataset} disabled={creatingDataset}>
              <Database className="h-4 w-4 mr-1.5" />
              {creatingDataset ? "Aanmaken…" : "Maak dataset van selectie"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
