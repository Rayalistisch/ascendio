"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { KeywordInput } from "@/components/keyword-input";
import { Plus, Trash2, Sparkles, Play, ExternalLink } from "lucide-react";

interface Site {
  id: string;
  name: string;
}

interface Template {
  id: string;
  name: string;
}

interface Cluster {
  id: string;
  site_id: string;
  name: string;
  pillar_topic: string;
  pillar_description: string | null;
  pillar_keywords: string[];
  pillar_wp_post_url: string | null;
  status: string;
  template_id: string | null;
  topic_count: number;
  published_count: number;
  created_at: string;
}

interface ClusterTopic {
  id: string;
  title: string;
  description: string | null;
  target_keywords: string[];
  sort_order: number;
  status: string;
  wp_post_url: string | null;
}

interface Suggestion {
  title: string;
  description: string;
  keywords: string[];
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "Concept", variant: "secondary" },
  in_progress: { label: "Bezig", variant: "default" },
  complete: { label: "Compleet", variant: "outline" },
  pending: { label: "Wachtend", variant: "secondary" },
  generating: { label: "Genereren...", variant: "default" },
  published: { label: "Gepubliceerd", variant: "outline" },
  failed: { label: "Mislukt", variant: "destructive" },
};

export default function ClustersPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [templateSavingClusterId, setTemplateSavingClusterId] = useState<string | null>(null);

  // Expanded cluster
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [topics, setTopics] = useState<ClusterTopic[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);

  // Create cluster dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPillar, setNewPillar] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newKeywords, setNewKeywords] = useState<string[]>([]);
  const [newTemplateId, setNewTemplateId] = useState("");
  const [creating, setCreating] = useState(false);

  // Add topic
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [addingTopic, setAddingTopic] = useState(false);

  // Suggestions
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);

  // Generate
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetch("/api/sites")
      .then((r) => r.json())
      .then((d) => {
        const list = d.sites ?? [];
        setSites(list);
        if (list.length > 0) setSiteId(list[0].id);
      });
  }, []);

  const fetchClusters = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/clusters?siteId=${siteId}`);
      const data = await res.json();
      setClusters(data.clusters ?? []);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  const fetchTemplates = useCallback(async () => {
    if (!siteId) return;
    const res = await fetch(`/api/article-templates?siteId=${siteId}`);
    const data = await res.json();
    setTemplates(data.templates ?? []);
  }, [siteId]);

  useEffect(() => {
    fetchClusters();
    fetchTemplates();
  }, [fetchClusters, fetchTemplates]);

  useEffect(() => {
    setNewTemplateId("");
  }, [siteId]);

  async function fetchTopics(clusterId: string) {
    setTopicsLoading(true);
    try {
      const res = await fetch(`/api/clusters/topics?clusterId=${clusterId}`);
      const data = await res.json();
      setTopics(data.topics ?? []);
    } finally {
      setTopicsLoading(false);
    }
  }

  async function loadTopics(clusterId: string) {
    if (expandedId === clusterId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(clusterId);
    setSuggestions([]);
    await fetchTopics(clusterId);
  }

  async function createCluster() {
    setCreating(true);
    try {
      const res = await fetch("/api/clusters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          name: newName,
          pillarTopic: newPillar,
          pillarDescription: newDescription || undefined,
          pillarKeywords: newKeywords,
          templateId: newTemplateId || undefined,
        }),
      });
      if (res.ok) {
        setDialogOpen(false);
        setNewName("");
        setNewPillar("");
        setNewDescription("");
        setNewKeywords([]);
        setNewTemplateId("");
        fetchClusters();
      }
    } finally {
      setCreating(false);
    }
  }

  async function deleteCluster(id: string) {
    const confirmed = window.confirm(
      "Weet je zeker dat je dit cluster wilt verwijderen? Gepubliceerde cluster-artikelen worden ook uit WordPress verwijderd."
    );
    if (!confirmed) return;

    const res = await fetch("/api/clusters", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.alert(data.error || "Cluster verwijderen mislukt.");
      return;
    }
    if (expandedId === id) setExpandedId(null);
    fetchClusters();
  }

  async function updateClusterTemplate(clusterId: string, templateId: string) {
    setTemplateSavingClusterId(clusterId);
    try {
      const res = await fetch("/api/clusters", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: clusterId,
          templateId: templateId || null,
        }),
      });
      if (!res.ok) return;

      const data = await res.json();
      const updatedTemplateId = data.cluster?.template_id ?? null;
      setClusters((prev) => prev.map((cluster) => (
        cluster.id === clusterId
          ? { ...cluster, template_id: updatedTemplateId }
          : cluster
      )));
    } finally {
      setTemplateSavingClusterId(null);
    }
  }

  async function addTopic(clusterId: string) {
    if (!newTopicTitle.trim()) return;
    setAddingTopic(true);
    try {
      const res = await fetch("/api/clusters/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clusterId,
          title: newTopicTitle,
          sortOrder: topics.length,
        }),
      });
      if (res.ok) {
        setNewTopicTitle("");
        await fetchTopics(clusterId);
        fetchClusters();
      }
    } finally {
      setAddingTopic(false);
    }
  }

  async function addSuggestionAsTopic(clusterId: string, suggestion: Suggestion) {
    await fetch("/api/clusters/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clusterId,
        title: suggestion.title,
        description: suggestion.description,
        targetKeywords: suggestion.keywords,
        sortOrder: topics.length,
      }),
    });
    setSuggestions((prev) => prev.filter((s) => s.title !== suggestion.title));
    await fetchTopics(clusterId);
    fetchClusters();
  }

  async function deleteTopic(topicId: string, clusterId: string) {
    const confirmed = window.confirm(
      "Weet je zeker dat je dit subtopic wilt verwijderen? Als er al een artikel is gepubliceerd, wordt die ook uit WordPress verwijderd."
    );
    if (!confirmed) return;

    const res = await fetch("/api/clusters/topics", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: topicId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.alert(data.error || "Subtopic verwijderen mislukt.");
      return;
    }
    await fetchTopics(clusterId);
    fetchClusters();
  }

  async function getSuggestions(cluster: Cluster) {
    setSuggesting(true);
    try {
      const res = await fetch("/api/clusters/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: cluster.site_id,
          clusterId: cluster.id,
          pillarTopic: cluster.pillar_topic,
          existingTopics: topics.map((t) => t.title),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions ?? []);
      }
    } finally {
      setSuggesting(false);
    }
  }

  async function generateArticles(clusterId: string) {
    setGenerating(true);
    try {
      await fetch("/api/clusters/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clusterId }),
      });
      if (expandedId !== clusterId) setExpandedId(clusterId);
      await fetchTopics(clusterId);
      fetchClusters();
    } finally {
      setGenerating(false);
    }
  }

  const retryableTopicCount = topics.filter((t) => t.status === "pending" || t.status === "failed").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">SEO Clusters</h1>
          <p className="text-muted-foreground mt-1">
            Beheer topic clusters voor gestructureerde interne linking.
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
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90">
              Cluster aanmaken
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Nieuw SEO cluster</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Clusternaam</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Bijv. Webdesign" />
                </div>
                <div className="space-y-2">
                  <Label>Pillar topic</Label>
                  <Input value={newPillar} onChange={(e) => setNewPillar(e.target.value)} placeholder="Het hoofdonderwerp van dit cluster" />
                </div>
                <div className="space-y-2">
                  <Label>Beschrijving (optioneel)</Label>
                  <Textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Wat moet het pillar artikel behandelen?" rows={2} />
                </div>
                <div className="space-y-2">
                  <Label>Pillar zoekwoorden</Label>
                  <KeywordInput keywords={newKeywords} onChange={setNewKeywords} />
                </div>
                <div className="space-y-2">
                  <Label>Artikeltemplate</Label>
                  <NativeSelect
                    value={newTemplateId}
                    onChange={(e) => setNewTemplateId(e.target.value)}
                    disabled={templates.length === 0}
                  >
                    <option value="">
                      {templates.length === 0 ? "Nog geen templates beschikbaar" : "Standaard structuur"}
                    </option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </NativeSelect>
                  {templates.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Maak eerst een template aan op de Templates-pagina om deze aan een cluster te koppelen.
                    </p>
                  )}
                </div>
                <Button onClick={createCluster} disabled={creating || !newName.trim() || !newPillar.trim()} className="w-full">
                  {creating ? "Aanmaken..." : "Cluster aanmaken"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : clusters.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed p-12">
          <p className="text-muted-foreground text-sm">
            Nog geen clusters aangemaakt. Maak je eerste SEO cluster aan om te beginnen.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {clusters.map((cluster) => (
            <div key={cluster.id} className="rounded-xl border bg-card shadow-sm">
              <div className="flex items-start justify-between p-4 gap-2">
                <button
                  type="button"
                  onClick={() => loadTopics(cluster.id)}
                  className="flex-1 text-left"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{cluster.name}</span>
                      <Badge variant={STATUS_MAP[cluster.status]?.variant ?? "secondary"}>
                        {STATUS_MAP[cluster.status]?.label ?? cluster.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Pillar: {cluster.pillar_topic}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {cluster.published_count}/{cluster.topic_count} artikelen gepubliceerd
                      {cluster.pillar_wp_post_url && " + pillar"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Template: {templates.find((t) => t.id === cluster.template_id)?.name ?? "Standaard structuur"}
                    </p>
                  </div>
                </button>
                <Button variant="ghost" size="sm" onClick={() => deleteCluster(cluster.id)} className="text-destructive shrink-0">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {expandedId === cluster.id && (
                <div className="border-t px-4 py-3 space-y-4">
                  {topicsLoading ? (
                    <Skeleton className="h-8 w-full" />
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold">Template voor dit cluster</Label>
                        <NativeSelect
                          value={cluster.template_id ?? ""}
                          onChange={(e) => updateClusterTemplate(cluster.id, e.target.value)}
                          disabled={templateSavingClusterId === cluster.id || templates.length === 0}
                          className="w-full sm:w-80"
                        >
                          <option value="">
                            {templates.length === 0 ? "Nog geen templates beschikbaar" : "Standaard structuur"}
                          </option>
                          {templates.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </NativeSelect>
                        {templates.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Maak eerst een template aan op de Templates-pagina om te koppelen.
                          </p>
                        ) : templateSavingClusterId === cluster.id ? (
                          <p className="text-xs text-muted-foreground">Template opslaan...</p>
                        ) : null}
                      </div>

                      {/* Topics list */}
                      {topics.length > 0 ? (
                        <div className="space-y-2">
                          {topics.map((topic) => (
                            <div key={topic.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium truncate">{topic.title}</span>
                                  <Badge variant={STATUS_MAP[topic.status]?.variant ?? "secondary"} className="text-xs shrink-0">
                                    {STATUS_MAP[topic.status]?.label ?? topic.status}
                                  </Badge>
                                </div>
                                {topic.target_keywords.length > 0 && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {topic.target_keywords.join(", ")}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {topic.wp_post_url && (
                                  <a
                                    href={topic.wp_post_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                )}
                                <Button variant="ghost" size="sm" onClick={() => deleteTopic(topic.id, cluster.id)} className="text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Nog geen subtopics. Voeg er handmatig toe of gebruik AI suggesties.</p>
                      )}

                      {/* Add topic inline */}
                      <div className="flex items-center gap-2">
                        <Input
                          value={newTopicTitle}
                          onChange={(e) => setNewTopicTitle(e.target.value)}
                          placeholder="Nieuw subtopic toevoegen..."
                          onKeyDown={(e) => e.key === "Enter" && addTopic(cluster.id)}
                          className="flex-1"
                        />
                        <Button size="sm" onClick={() => addTopic(cluster.id)} disabled={addingTopic || !newTopicTitle.trim()}>
                          <Plus className="h-4 w-4 mr-1" /> Toevoegen
                        </Button>
                      </div>

                      {/* AI suggestions */}
                      {suggestions.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold">AI Suggesties</Label>
                          {suggestions.map((s, i) => (
                            <div key={i} className="flex items-center justify-between rounded-lg border border-dashed px-3 py-2 bg-muted/30">
                              <div className="min-w-0">
                                <span className="text-sm font-medium">{s.title}</span>
                                <p className="text-xs text-muted-foreground">{s.description}</p>
                              </div>
                              <Button size="sm" variant="outline" onClick={() => addSuggestionAsTopic(cluster.id, s)} className="shrink-0 ml-2">
                                <Plus className="h-4 w-4 mr-1" /> Toevoegen
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => getSuggestions(cluster)} disabled={suggesting}>
                          <Sparkles className="h-4 w-4 mr-1" />
                          {suggesting ? "Laden..." : "AI Suggesties"}
                        </Button>
                        {retryableTopicCount > 0 && (
                          <Button size="sm" onClick={() => generateArticles(cluster.id)} disabled={generating}>
                            <Play className="h-4 w-4 mr-1" />
                            {generating ? "Starten..." : `Genereer ${retryableTopicCount} artikelen`}
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
