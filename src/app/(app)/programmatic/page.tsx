"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Database, Play, Sparkles, Trash2, ExternalLink, AlertTriangle } from "lucide-react";

interface Site {
  id: string;
  name: string;
}
interface Template {
  id: string;
  name: string;
}
interface Dataset {
  id: string;
  name: string;
  columns: string[];
  row_count: number;
}
interface PreviewTopic {
  rowIndex: number;
  title: string;
  slug: string;
  topic: string;
  keywords: string[];
  error?: string;
}
interface PreviewResult {
  columns: string[];
  totalRows: number;
  validCount: number;
  errorCount: number;
  firstError?: string;
  sample: PreviewTopic[];
  costPerPage: number;
  totalCost: number;
  creditsRemaining: number;
  affordable: number;
  enoughForAll: boolean;
}
interface ProgCluster {
  id: string;
  name: string;
  status: string;
  topic_count: number;
  published_count: number;
  mode: string;
}
interface ClusterTopic {
  id: string;
  title: string;
  status: string;
  wp_post_url: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Concept",
  in_progress: "Bezig",
  complete: "Compleet",
  pending: "Wachtend",
  generating: "Genereren…",
  published: "Gepubliceerd",
  failed: "Mislukt",
};

type PatternField = "title" | "slug" | "topic";

export default function ProgrammaticPage() {
  const searchParams = useSearchParams();
  const urlSiteId = searchParams.get("siteId") || "";

  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);

  // New dataset
  const [datasetName, setDatasetName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [uploading, setUploading] = useState(false);

  // Selected dataset + patterns
  const [datasetId, setDatasetId] = useState("");
  const [titlePattern, setTitlePattern] = useState("");
  const [slugPattern, setSlugPattern] = useState("");
  const [topicPattern, setTopicPattern] = useState("");
  const [clusterName, setClusterName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [contentType, setContentType] = useState("posts");
  const [language, setLanguage] = useState("");
  const lastFocused = useRef<PatternField>("title");

  // Preview + generate
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genMessage, setGenMessage] = useState<string | null>(null);

  // Existing programmatic clusters
  const [clusters, setClusters] = useState<ProgCluster[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [topics, setTopics] = useState<ClusterTopic[]>([]);

  const selectedDataset = datasets.find((d) => d.id === datasetId);

  useEffect(() => {
    fetch("/api/sites")
      .then((r) => r.json())
      .then((d) => {
        const list: Site[] = d.sites ?? [];
        setSites(list);
        if (list.length > 0) {
          const preferred =
            urlSiteId && list.some((s) => s.id === urlSiteId) ? urlSiteId : list[0].id;
          setSiteId(preferred);
        } else {
          setLoading(false);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadForSite = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const [dsRes, tplRes, clRes] = await Promise.all([
        fetch(`/api/datasets?siteId=${siteId}`),
        fetch(`/api/article-templates?siteId=${siteId}`),
        fetch(`/api/clusters?siteId=${siteId}`),
      ]);
      const ds = await dsRes.json();
      const tpl = await tplRes.json();
      const cl = clRes.ok ? await clRes.json() : { clusters: [] };
      setDatasets(ds.datasets ?? []);
      setTemplates(tpl.templates ?? []);
      setClusters((cl.clusters ?? []).filter((c: ProgCluster) => c.mode === "programmatic"));
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    loadForSite();
    setDatasetId("");
    setPreview(null);
  }, [loadForSite]);

  // Poll while any topic is generating
  useEffect(() => {
    const busy = topics.some((t) => t.status === "generating") ||
      clusters.some((c) => c.status === "in_progress");
    if (!busy) return;
    const interval = setInterval(() => {
      void loadForSite();
      if (expandedId) void fetchTopics(expandedId);
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topics, clusters, expandedId]);

  async function uploadDataset() {
    if (!csvText.trim() || !siteId) return;
    setUploading(true);
    try {
      const res = await fetch("/api/datasets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, name: datasetName || "Naamloze dataset", csv: csvText }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error || "Upload mislukt");
        return;
      }
      setCsvText("");
      setDatasetName("");
      await loadForSite();
      setDatasetId(data.id);
    } finally {
      setUploading(false);
    }
  }

  async function deleteDataset(id: string) {
    if (!window.confirm("Dataset verwijderen?")) return;
    const res = await fetch(`/api/datasets/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.alert(data.error || "Verwijderen mislukt");
      return;
    }
    if (datasetId === id) setDatasetId("");
    await loadForSite();
  }

  function insertVariable(col: string) {
    const token = `{{${col}}}`;
    if (lastFocused.current === "slug") setSlugPattern((p) => p + token);
    else if (lastFocused.current === "topic") setTopicPattern((p) => p + token);
    else setTitlePattern((p) => p + token);
  }

  async function runPreview() {
    if (!datasetId || !titlePattern.trim()) return;
    setPreviewing(true);
    setGenMessage(null);
    try {
      const res = await fetch("/api/programmatic/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetId, titlePattern, slugPattern, topicPattern }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error || "Preview mislukt");
        return;
      }
      setPreview(data);
    } finally {
      setPreviewing(false);
    }
  }

  async function generate() {
    if (!datasetId || !titlePattern.trim() || !preview) return;
    setGenerating(true);
    setGenMessage(null);
    try {
      const createRes = await fetch("/api/programmatic/clusters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          name: clusterName || selectedDataset?.name || "Programmatic set",
          datasetId,
          titlePattern,
          slugPattern: slugPattern || undefined,
          topicPattern: topicPattern || undefined,
          templateId: templateId || undefined,
          contentType,
          language: language || undefined,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) {
        window.alert(created.error || "Aanmaken mislukt");
        return;
      }
      const genRes = await fetch("/api/clusters/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clusterId: created.clusterId }),
      });
      const gen = await genRes.json();
      if (!genRes.ok) {
        window.alert(gen.message || gen.error || "Genereren mislukt");
        return;
      }
      window.dispatchEvent(new Event("credits-updated"));
      const parts = [`${gen.generated} pagina's gestart`];
      if (gen.remaining > 0) parts.push(`${gen.remaining} in wachtrij`);
      if (gen.creditLimited) parts.push("(beperkt door credits)");
      setGenMessage(parts.join(" — "));
      setPreview(null);
      setDatasetId("");
      setTitlePattern("");
      setSlugPattern("");
      setTopicPattern("");
      setClusterName("");
      await loadForSite();
      setExpandedId(created.clusterId);
      await fetchTopics(created.clusterId);
    } finally {
      setGenerating(false);
    }
  }

  async function fetchTopics(clusterId: string) {
    const res = await fetch(`/api/clusters/topics?clusterId=${clusterId}`);
    const data = await res.json();
    setTopics(data.topics ?? []);
  }

  async function toggleCluster(clusterId: string) {
    if (expandedId === clusterId) {
      setExpandedId(null);
      setTopics([]);
      return;
    }
    setExpandedId(clusterId);
    await fetchTopics(clusterId);
  }

  async function generateMore(clusterId: string) {
    setGenerating(true);
    try {
      const res = await fetch("/api/clusters/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clusterId }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.message || data.error || "Genereren mislukt");
        return;
      }
      window.dispatchEvent(new Event("credits-updated"));
      await loadForSite();
      await fetchTopics(clusterId);
    } finally {
      setGenerating(false);
    }
  }

  if (sites.length === 0 && !loading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed p-12">
        <p className="text-muted-foreground text-sm">
          Voeg eerst een site toe om programmatic SEO te gebruiken.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Programmatic SEO</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Combineer een dataset met een titel-patroon en genereer in bulk unieke pagina&apos;s —
            elk door dezelfde kwaliteits- en uniciteitscontrole als je losse artikelen.
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
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : (
        <>
          {/* Step 1: Dataset */}
          <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              <h2 className="font-semibold">1. Dataset</h2>
            </div>

            {datasets.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs">Bestaande dataset</Label>
                <div className="space-y-2">
                  {datasets.map((d) => (
                    <div
                      key={d.id}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                        datasetId === d.id ? "border-primary bg-primary/5" : ""
                      }`}
                    >
                      <button type="button" className="flex-1 text-left" onClick={() => { setDatasetId(d.id); setPreview(null); }}>
                        <span className="text-sm font-medium">{d.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {d.row_count} rijen · {d.columns.join(", ")}
                        </span>
                      </button>
                      <Button variant="ghost" size="sm" className="text-destructive shrink-0" onClick={() => deleteDataset(d.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2 border-t pt-4">
              <Label className="text-xs">Nieuwe dataset uploaden (CSV plakken)</Label>
              <Input
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
                placeholder="Datasetnaam (bijv. Diensten × Steden)"
              />
              <Textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={5}
                placeholder={"dienst,stad\nDakkapel plaatsen,Amsterdam\nDakkapel plaatsen,Utrecht"}
                className="font-mono text-xs"
              />
              <Button size="sm" onClick={uploadDataset} disabled={uploading || !csvText.trim()}>
                {uploading ? "Uploaden…" : "Dataset opslaan"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Eerste rij = kolomnamen. Deze gebruik je als <code>{"{{kolom}}"}</code> in je patroon.
              </p>
            </div>
          </div>

          {/* Step 2: Patterns */}
          {selectedDataset && (
            <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                <h2 className="font-semibold">2. Patroon</h2>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {selectedDataset.columns.map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => insertVariable(col)}
                    className="rounded-md border bg-muted/40 px-2 py-1 text-xs font-mono hover:bg-muted"
                    title="Voeg toe aan het laatst geselecteerde veld"
                  >
                    {`{{${col}}}`}
                  </button>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Titel-patroon *</Label>
                  <Input
                    value={titlePattern}
                    onFocus={() => (lastFocused.current = "title")}
                    onChange={(e) => setTitlePattern(e.target.value)}
                    placeholder="{{dienst}} in {{stad}} — wat kost het?"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Slug-patroon (optioneel)</Label>
                  <Input
                    value={slugPattern}
                    onFocus={() => (lastFocused.current = "slug")}
                    onChange={(e) => setSlugPattern(e.target.value)}
                    placeholder="{{dienst}}-{{stad}}"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Onderwerp-patroon (optioneel)</Label>
                  <Input
                    value={topicPattern}
                    onFocus={() => (lastFocused.current = "topic")}
                    onChange={(e) => setTopicPattern(e.target.value)}
                    placeholder="Uitleg over {{dienst}} in {{stad}}"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Naam van deze set</Label>
                  <Input value={clusterName} onChange={(e) => setClusterName(e.target.value)} placeholder={selectedDataset.name} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Template</Label>
                  <NativeSelect value={templateId} onChange={(e) => setTemplateId(e.target.value)} disabled={templates.length === 0}>
                    <option value="">{templates.length === 0 ? "Geen templates" : "Standaard structuur"}</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Publicatietype</Label>
                  <NativeSelect value={contentType} onChange={(e) => setContentType(e.target.value)}>
                    <option value="posts">Blogposts</option>
                    <option value="pages">Pagina&apos;s</option>
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Taal (optioneel)</Label>
                  <NativeSelect value={language} onChange={(e) => setLanguage(e.target.value)}>
                    <option value="">Site-standaard</option>
                    <option value="Dutch">Nederlands</option>
                    <option value="English">Engels</option>
                    <option value="German">Duits</option>
                  </NativeSelect>
                </div>
              </div>

              <Button size="sm" variant="outline" onClick={runPreview} disabled={previewing || !titlePattern.trim()}>
                {previewing ? "Preview laden…" : "Preview genereren"}
              </Button>
            </div>
          )}

          {/* Step 3: Preview + generate */}
          {preview && (
            <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <Play className="h-4 w-4" />
                <h2 className="font-semibold">3. Controleren &amp; genereren</h2>
              </div>

              <div className="flex flex-wrap gap-4 text-sm">
                <span><strong>{preview.validCount}</strong> geldige pagina&apos;s</span>
                {preview.errorCount > 0 && (
                  <span className="text-destructive">{preview.errorCount} met fouten</span>
                )}
                <span>Kost <strong>{preview.totalCost}</strong> credits ({preview.costPerPage}/pagina)</span>
                <span className="text-muted-foreground">Je hebt {preview.creditsRemaining} credits</span>
              </div>

              {preview.errorCount > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20 px-3 py-2 text-xs text-yellow-800 dark:text-yellow-200">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{preview.errorCount} rijen worden overgeslagen. Eerste fout: {preview.firstError}</span>
                </div>
              )}

              {!preview.enoughForAll && preview.affordable > 0 && (
                <p className="text-xs text-yellow-700 dark:text-yellow-300">
                  Niet genoeg credits voor alle pagina&apos;s. Er starten er nu maximaal {Math.min(preview.affordable, 25)};
                  de rest blijft in de wachtrij.
                </p>
              )}

              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/40 text-xs">
                    <tr>
                      <th className="px-3 py-2 font-medium">Titel</th>
                      <th className="px-3 py-2 font-medium">Slug</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((t) => (
                      <tr key={t.rowIndex} className="border-t">
                        {t.error ? (
                          <td className="px-3 py-2 text-destructive" colSpan={2}>Rij {t.rowIndex + 1}: {t.error}</td>
                        ) : (
                          <>
                            <td className="px-3 py-2">{t.title}</td>
                            <td className="px-3 py-2 font-mono text-xs text-muted-foreground">/{t.slug}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.totalRows > preview.sample.length && (
                <p className="text-xs text-muted-foreground">
                  Voorbeeld van {preview.sample.length} van {preview.totalRows} rijen.
                </p>
              )}

              <Button onClick={generate} disabled={generating || preview.validCount === 0 || preview.affordable === 0}>
                <Play className="h-4 w-4 mr-1.5" />
                {generating
                  ? "Starten…"
                  : `Genereer ${Math.min(preview.validCount, preview.affordable, 25)} pagina's`}
              </Button>
              {preview.affordable === 0 && (
                <p className="text-xs text-destructive">Niet genoeg credits om te starten.</p>
              )}
            </div>
          )}

          {genMessage && (
            <div className="rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/20 px-3 py-2 text-sm text-green-800 dark:text-green-200">
              {genMessage}
            </div>
          )}

          {/* Existing programmatic sets */}
          {clusters.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-semibold">Je programmatic sets</h2>
              {clusters.map((c) => (
                <div key={c.id} className="rounded-xl border bg-card shadow-sm">
                  <button type="button" onClick={() => toggleCluster(c.id)} className="flex w-full items-center justify-between p-4 text-left">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{c.name}</span>
                        <Badge variant="outline" className="text-xs">{STATUS_LABEL[c.status] ?? c.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {c.published_count}/{c.topic_count} pagina&apos;s gepubliceerd
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => { e.stopPropagation(); generateMore(c.id); }}
                      disabled={generating}
                    >
                      <Play className="h-4 w-4 mr-1" /> Genereer verder
                    </Button>
                  </button>
                  {expandedId === c.id && (
                    <div className="border-t px-4 py-3 space-y-1.5">
                      {topics.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nog geen pagina&apos;s.</p>
                      ) : (
                        topics.map((t) => (
                          <div key={t.id} className="flex items-center justify-between rounded-md border px-3 py-1.5">
                            <span className="text-sm truncate">{t.title}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="outline" className="text-xs">{STATUS_LABEL[t.status] ?? t.status}</Badge>
                              {t.wp_post_url && (
                                <a href={t.wp_post_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
