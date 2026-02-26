"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TiptapEditor } from "@/components/tiptap-editor";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { KeywordInput } from "@/components/keyword-input";
import { Plus, Trash2, Sparkles, Play, ExternalLink, Globe, Pencil, Save, X, FileEdit } from "lucide-react";
import Link from "next/link";
import {
  DEFAULT_GENERATION_SETTINGS,
  normalizeGenerationSettings,
  type GenerationSettings,
  type HeadingLetterCase,
  type KnowledgeMode,
} from "@/lib/generation-settings";

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
  pillar_wp_post_id: number | null;
  pillar_wp_post_url: string | null;
  status: string;
  content_type: string;
  template_id: string | null;
  generation_settings: GenerationSettings | null;
  topic_count: number;
  published_count: number;
  created_at: string;
}

interface WpPostOption {
  wp_post_id: number;
  title: string;
  url: string;
}

interface ClusterTopic {
  id: string;
  title: string;
  description: string | null;
  target_keywords: string[];
  sort_order: number;
  status: string;
  wp_post_url: string | null;
  internal_post_id: string | null;
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

const SETTINGS_TABS = [
  { key: "details", label: "Details" },
  { key: "knowledge", label: "Knowledge" },
  { key: "formatting", label: "Formatting" },
  { key: "structure", label: "Structure" },
  { key: "internal", label: "Internal Linking" },
  { key: "external", label: "External Linking" },
  { key: "images", label: "Images" },
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]["key"];

const KNOWLEDGE_OPTIONS: Array<{
  value: KnowledgeMode;
  title: string;
  description: string;
}> = [
  {
    value: "connect_web",
    title: "Connect to Web",
    description: "Gebruik webcontext en actuele best practices in de output.",
  },
  {
    value: "use_sources",
    title: "Use Knowledge Base",
    description: "Leun zoveel mogelijk op je broncontent en referenties.",
  },
  {
    value: "no_extra",
    title: "No Extra Knowledge",
    description: "Gebruik geen extra externe kennis of webcitaten.",
  },
];

const HEADING_CASE_OPTIONS: Array<{
  value: HeadingLetterCase;
  label: string;
}> = [
  { value: "title_case", label: "Title Case" },
  { value: "sentence_case", label: "Sentence case" },
  { value: "keep", label: "Contextual" },
];

const FORMATTING_TOGGLES: Array<{
  key: "bold" | "italics" | "tables" | "quotes" | "lists";
  label: string;
  description: string;
}> = [
  {
    key: "bold",
    label: "Bold",
    description: "Benadruk belangrijke keywords met <strong>.",
  },
  {
    key: "italics",
    label: "Italics",
    description: "Gebruik subtiele nadruk met <em>.",
  },
  {
    key: "tables",
    label: "Tables",
    description: "Gebruik tabellen voor vergelijking/samenvatting.",
  },
  {
    key: "quotes",
    label: "Quotes",
    description: "Gebruik quotes of key takeaways.",
  },
  {
    key: "lists",
    label: "Lists",
    description: "Gebruik bullet/numbered lists waar nuttig.",
  },
];

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

  // Generation settings modal
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [settingsClusterId, setSettingsClusterId] = useState<string | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<GenerationSettings>(
    DEFAULT_GENERATION_SETTINGS
  );
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("details");
  const [savingSettings, setSavingSettings] = useState(false);

  // Cluster editing (expanded view)
  const [editClusterName, setEditClusterName] = useState("");
  const [editClusterPillar, setEditClusterPillar] = useState("");
  const [editClusterDescription, setEditClusterDescription] = useState("");
  const [editClusterKeywords, setEditClusterKeywords] = useState<string[]>([]);
  const [savingCluster, setSavingCluster] = useState(false);

  // Topic editing
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editTopicTitle, setEditTopicTitle] = useState("");
  const [editTopicDescription, setEditTopicDescription] = useState("");
  const [editTopicKeywords, setEditTopicKeywords] = useState<string[]>([]);
  const [savingTopic, setSavingTopic] = useState(false);

  // Content type for new cluster
  const [newContentType, setNewContentType] = useState("pages");

  // Pillar page selector
  const [wpPostOptions, setWpPostOptions] = useState<WpPostOption[]>([]);
  const [selectedPillarId, setSelectedPillarId] = useState<string>("");
  const [settingPillar, setSettingPillar] = useState(false);

  // Sitemap
  const [sitemapOverlaps, setSitemapOverlaps] = useState<Array<{ url: string; reason: string }>>([]);
  const [sitemapLoading, setSitemapLoading] = useState(false);
  const [sitemapScanning, setSitemapScanning] = useState(false);
  const [sitemapCount, setSitemapCount] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/sites")
      .then((r) => r.json())
      .then((d) => {
        const list = d.sites ?? [];
        setSites(list);
        if (list.length > 0) setSiteId(list[0].id);
      });
  }, []);

  const fetchClusters = useCallback(async (silent = false) => {
    if (!siteId) return;
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/clusters?siteId=${siteId}`);
      const data = await res.json();
      const normalizedClusters: Cluster[] = (data.clusters ?? []).map(
        (cluster: Cluster & { generation_settings?: unknown }) => ({
          ...cluster,
          generation_settings: normalizeGenerationSettings(cluster.generation_settings),
        })
      );
      setClusters(normalizedClusters);
    } finally {
      if (!silent) setLoading(false);
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

  // Poll while topics are generating
  useEffect(() => {
    const hasGenerating = topics.some((t) => t.status === "generating");
    if (!hasGenerating || !expandedId) return;
    const interval = setInterval(() => {
      void fetchTopics(expandedId, true);
      void fetchClusters(true);
    }, 5000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topics, expandedId]);

  async function fetchTopics(clusterId: string, silent = false) {
    if (!silent) setTopicsLoading(true);
    try {
      const res = await fetch(`/api/clusters/topics?clusterId=${clusterId}`);
      const data = await res.json();
      setTopics(data.topics ?? []);
    } finally {
      if (!silent) setTopicsLoading(false);
    }
  }

  async function loadTopics(clusterId: string) {
    if (expandedId === clusterId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(clusterId);
    setEditingTopicId(null);
    setSuggestions([]);
    setSitemapOverlaps([]);

    // Populate cluster edit state
    const c = clusters.find((item) => item.id === clusterId);
    if (c) {
      setEditClusterName(c.name);
      setEditClusterPillar(c.pillar_topic);
      setEditClusterDescription(c.pillar_description ?? "");
      setEditClusterKeywords(c.pillar_keywords ?? []);
    }
    await fetchTopics(clusterId);

    // Fetch sitemap overlaps and WP posts for this cluster
    const cluster = clusters.find((c) => c.id === clusterId);
    if (cluster) {
      setSitemapLoading(true);
      setSelectedPillarId("");
      try {
        const [sitemapRes, wpRes] = await Promise.all([
          fetch(`/api/sitemap?siteId=${cluster.site_id}&clusterId=${clusterId}`),
          cluster.content_type === "pages"
            ? fetch(`/api/clusters/wp-pages?siteId=${cluster.site_id}`)
            : Promise.resolve(null),
        ]);
        if (sitemapRes.ok) {
          const data = await sitemapRes.json();
          setSitemapOverlaps(data.overlapping ?? []);
        }
        if (wpRes?.ok) {
          const data = await wpRes.json();
          setWpPostOptions(
            (data.pages ?? []).map((p: { wp_post_id: number; title: string; url: string }) => ({
              wp_post_id: p.wp_post_id,
              title: p.title || p.url,
              url: p.url,
            }))
          );
        }
      } finally {
        setSitemapLoading(false);
      }
    }
  }

  async function setPillarPage(clusterId: string, siteId: string) {
    const post = wpPostOptions.find((p) => String(p.wp_post_id) === selectedPillarId);
    if (!post) return;
    setSettingPillar(true);
    try {
      const res = await fetch("/api/clusters", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: clusterId,
          pillarWpPostId: post.wp_post_id,
          pillarWpPostUrl: post.url,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || "Pillar koppelen mislukt");
        return;
      }
      setClusters((prev) =>
        prev.map((c) =>
          c.id === clusterId
            ? { ...c, pillar_wp_post_id: post.wp_post_id, pillar_wp_post_url: post.url }
            : c
        )
      );
      setSelectedPillarId("");
    } finally {
      setSettingPillar(false);
    }
    void siteId; // used implicitly via wpPostOptions
  }

  async function unlinkPillarPage(clusterId: string) {
    setSettingPillar(true);
    try {
      await fetch("/api/clusters", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: clusterId, pillarWpPostId: null, pillarWpPostUrl: null }),
      });
      setClusters((prev) =>
        prev.map((c) =>
          c.id === clusterId ? { ...c, pillar_wp_post_id: null, pillar_wp_post_url: null } : c
        )
      );
    } finally {
      setSettingPillar(false);
    }
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
          contentType: newContentType,
        }),
      });
      if (res.ok) {
        setDialogOpen(false);
        setNewName("");
        setNewPillar("");
        setNewDescription("");
        setNewKeywords([]);
        setNewTemplateId("");
        setNewContentType("pages");
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
        window.dispatchEvent(new Event("credits-updated"));
      }
    } finally {
      setSuggesting(false);
    }
  }

  async function generateArticles(clusterId: string) {
    setGenerating(true);
    try {
      const cluster = clusters.find((item) => item.id === clusterId);
      const res = await fetch("/api/clusters/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clusterId,
          generationSettings: cluster?.generation_settings
            ? normalizeGenerationSettings(cluster.generation_settings)
            : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || "Genereren mislukt");
        return;
      }
      if (expandedId !== clusterId) setExpandedId(clusterId);
      await fetchTopics(clusterId);
      fetchClusters();
    } finally {
      setGenerating(false);
    }
  }

  function openGenerationSettings(cluster: Cluster) {
    setSettingsClusterId(cluster.id);
    setSettingsDraft(
      normalizeGenerationSettings(cluster.generation_settings ?? undefined)
    );
    setSettingsTab("details");
    setSettingsDialogOpen(true);
  }

  async function saveGenerationSettings() {
    if (!settingsClusterId) return;
    setSavingSettings(true);
    try {
      const normalized = normalizeGenerationSettings(settingsDraft);
      const res = await fetch("/api/clusters", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: settingsClusterId,
          generationSettings: normalized,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || "SEO artikel-instellingen opslaan mislukt.");
        return;
      }

      setClusters((prev) =>
        prev.map((cluster) =>
          cluster.id === settingsClusterId
            ? { ...cluster, generation_settings: normalized }
            : cluster
        )
      );
      setSettingsDialogOpen(false);
    } finally {
      setSavingSettings(false);
    }
  }

  async function scanSitemap() {
    if (!siteId) return;
    setSitemapScanning(true);
    try {
      const res = await fetch("/api/sitemap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      if (res.ok) {
        const data = await res.json();
        setSitemapCount(data.count ?? 0);
      }
    } finally {
      setSitemapScanning(false);
    }
  }

  async function saveClusterDetails(clusterId: string) {
    setSavingCluster(true);
    try {
      const res = await fetch("/api/clusters", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: clusterId,
          name: editClusterName,
          pillarTopic: editClusterPillar,
          pillarDescription: editClusterDescription || null,
          pillarKeywords: editClusterKeywords,
        }),
      });
      if (res.ok) {
        setClusters((prev) =>
          prev.map((c) =>
            c.id === clusterId
              ? {
                  ...c,
                  name: editClusterName,
                  pillar_topic: editClusterPillar,
                  pillar_description: editClusterDescription || null,
                  pillar_keywords: editClusterKeywords,
                }
              : c
          )
        );
      }
    } finally {
      setSavingCluster(false);
    }
  }

  function startEditTopic(topic: ClusterTopic) {
    setEditingTopicId(topic.id);
    setEditTopicTitle(topic.title);
    setEditTopicDescription(topic.description ?? "");
    setEditTopicKeywords(topic.target_keywords ?? []);
  }

  async function saveTopic(topicId: string, clusterId: string) {
    setSavingTopic(true);
    try {
      const res = await fetch("/api/clusters/topics", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: topicId,
          title: editTopicTitle,
          description: editTopicDescription || null,
          targetKeywords: editTopicKeywords,
        }),
      });
      if (res.ok) {
        setEditingTopicId(null);
        await fetchTopics(clusterId);
      }
    } finally {
      setSavingTopic(false);
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
          <Button
            variant="outline"
            size="sm"
            onClick={scanSitemap}
            disabled={sitemapScanning || !siteId}
          >
            <Globe className="h-4 w-4 mr-1.5" />
            {sitemapScanning
              ? "Scannen..."
              : sitemapCount !== null
                ? `Sitemap (${sitemapCount} URL's)`
                : "Sitemap scannen"}
          </Button>
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
                  <TiptapEditor content={newDescription} onChange={setNewDescription} placeholder="Wat moet het pillar artikel behandelen?" />
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
                <div className="space-y-2">
                  <Label>Publicatietype</Label>
                  <NativeSelect
                    value={newContentType}
                    onChange={(e) => setNewContentType(e.target.value)}
                  >
                    <option value="pages">Pagina&apos;s (hiërarchisch)</option>
                    <option value="posts">Blogposts (standaard)</option>
                  </NativeSelect>
                  <p className="text-xs text-muted-foreground">
                    {newContentType === "pages"
                      ? "Pillar wordt een hoofdpagina, subtopics worden kindpagina's (bijv. /pillar/subtopic)."
                      : "Alle artikelen worden als losse blogposts gepubliceerd."}
                  </p>
                </div>
                <Button onClick={createCluster} disabled={creating || !newName.trim() || !newPillar.trim()} className="w-full">
                  {creating ? "Aanmaken..." : "Cluster aanmaken"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent className="max-w-5xl p-0 overflow-hidden">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>SEO Article Details</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Stel per cluster in hoe artikelen worden gegenereerd.
            </p>
          </DialogHeader>

          <div className="grid gap-0 md:grid-cols-[220px_1fr]">
            <aside className="border-r bg-muted/20 p-3">
              <div className="space-y-1">
                {SETTINGS_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setSettingsTab(tab.key)}
                    className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      settingsTab === tab.key
                        ? "bg-background font-medium shadow-sm"
                        : "text-muted-foreground hover:bg-background/70"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </aside>

            <div className="max-h-[68vh] overflow-y-auto p-6">
              {settingsTab === "details" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Focus keyword</Label>
                    <Input
                      value={settingsDraft.details.focusKeyword}
                      onChange={(e) =>
                        setSettingsDraft((prev) => ({
                          ...prev,
                          details: { ...prev.details, focusKeyword: e.target.value },
                        }))
                      }
                      placeholder="Bijv. klantportalen"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Include keywords</Label>
                    <KeywordInput
                      keywords={settingsDraft.details.includeKeywords}
                      onChange={(keywords) =>
                        setSettingsDraft((prev) => ({
                          ...prev,
                          details: { ...prev.details, includeKeywords: keywords },
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Deze keywords worden extra meegenomen in de SEO-focus.
                    </p>
                  </div>
                </div>
              )}

              {settingsTab === "knowledge" && (
                <div className="space-y-3">
                  {KNOWLEDGE_OPTIONS.map((option) => {
                    const active = settingsDraft.knowledge.mode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setSettingsDraft((prev) => ({
                            ...prev,
                            knowledge: { mode: option.value },
                          }))
                        }
                        className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                          active
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-muted/30"
                        }`}
                      >
                        <p className="font-medium">{option.title}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {option.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}

              {settingsTab === "formatting" && (
                <div className="space-y-4">
                  {FORMATTING_TOGGLES.map((item) => (
                    <div key={item.key} className="flex items-center justify-between rounded-lg border px-4 py-3">
                      <div>
                        <p className="font-medium">{item.label}</p>
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                      </div>
                      <Switch
                        checked={settingsDraft.formatting[item.key]}
                        onCheckedChange={(checked) =>
                          setSettingsDraft((prev) => ({
                            ...prev,
                            formatting: {
                              ...prev.formatting,
                              [item.key]: checked,
                            },
                          }))
                        }
                      />
                    </div>
                  ))}

                  <div className="space-y-2">
                    <Label>Heading letter case</Label>
                    <NativeSelect
                      value={settingsDraft.formatting.headingLetterCase}
                      onChange={(e) =>
                        setSettingsDraft((prev) => ({
                          ...prev,
                          formatting: {
                            ...prev.formatting,
                            headingLetterCase: e.target.value as HeadingLetterCase,
                          },
                        }))
                      }
                    >
                      {HEADING_CASE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                </div>
              )}

              {settingsTab === "structure" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Target word count</Label>
                    <Input
                      type="number"
                      min={900}
                      max={3500}
                      value={settingsDraft.structure.targetWordCount}
                      onChange={(e) =>
                        setSettingsDraft((prev) => ({
                          ...prev,
                          structure: {
                            ...prev.structure,
                            targetWordCount: Number(e.target.value) || prev.structure.targetWordCount,
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Minimum H2</Label>
                    <Input
                      type="number"
                      min={3}
                      max={10}
                      value={settingsDraft.structure.minH2}
                      onChange={(e) =>
                        setSettingsDraft((prev) => ({
                          ...prev,
                          structure: {
                            ...prev.structure,
                            minH2: Number(e.target.value) || prev.structure.minH2,
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Minimum H3</Label>
                    <Input
                      type="number"
                      min={0}
                      max={12}
                      value={settingsDraft.structure.minH3}
                      onChange={(e) =>
                        setSettingsDraft((prev) => ({
                          ...prev,
                          structure: {
                            ...prev.structure,
                            minH3: Number(e.target.value) || 0,
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>FAQ count</Label>
                    <Input
                      type="number"
                      min={0}
                      max={8}
                      value={settingsDraft.structure.faqCount}
                      onChange={(e) =>
                        setSettingsDraft((prev) => ({
                          ...prev,
                          structure: {
                            ...prev.structure,
                            faqCount: Number(e.target.value) || 0,
                          },
                        }))
                      }
                    />
                  </div>
                </div>
              )}

              {settingsTab === "internal" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                    <div>
                      <p className="font-medium">Internal links inschakelen</p>
                      <p className="text-sm text-muted-foreground">
                        Voeg interne links toe naar cluster/sitemap content.
                      </p>
                    </div>
                    <Switch
                      checked={settingsDraft.internalLinking.enabled}
                      onCheckedChange={(checked) =>
                        setSettingsDraft((prev) => ({
                          ...prev,
                          internalLinking: { ...prev.internalLinking, enabled: checked },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Links per H2</Label>
                    <Input
                      type="number"
                      min={0}
                      max={4}
                      disabled={!settingsDraft.internalLinking.enabled}
                      value={settingsDraft.internalLinking.linksPerH2}
                      onChange={(e) =>
                        setSettingsDraft((prev) => ({
                          ...prev,
                          internalLinking: {
                            ...prev.internalLinking,
                            linksPerH2: Number(e.target.value) || 0,
                          },
                        }))
                      }
                    />
                  </div>
                </div>
              )}

              {settingsTab === "external" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                    <div>
                      <p className="font-medium">External links inschakelen</p>
                      <p className="text-sm text-muted-foreground">
                        Voeg autoritatieve bronnen toe in het artikel.
                      </p>
                    </div>
                    <Switch
                      checked={settingsDraft.externalLinking.enabled}
                      onCheckedChange={(checked) =>
                        setSettingsDraft((prev) => ({
                          ...prev,
                          externalLinking: { ...prev.externalLinking, enabled: checked },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Externe links per artikel</Label>
                    <Input
                      type="number"
                      min={0}
                      max={8}
                      disabled={!settingsDraft.externalLinking.enabled}
                      value={settingsDraft.externalLinking.linksPerArticle}
                      onChange={(e) =>
                        setSettingsDraft((prev) => ({
                          ...prev,
                          externalLinking: {
                            ...prev.externalLinking,
                            linksPerArticle: Number(e.target.value) || 0,
                          },
                        }))
                      }
                    />
                  </div>
                </div>
              )}

              {settingsTab === "images" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                    <div>
                      <p className="font-medium">Featured image</p>
                      <p className="text-sm text-muted-foreground">
                        Genereer een uitgelichte afbeelding.
                      </p>
                    </div>
                    <Switch
                      checked={settingsDraft.images.featuredEnabled}
                      onCheckedChange={(checked) =>
                        setSettingsDraft((prev) => ({
                          ...prev,
                          images: { ...prev.images, featuredEnabled: checked },
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Inline afbeeldingen</Label>
                    <Input
                      type="number"
                      min={0}
                      max={3}
                      value={settingsDraft.images.inlineImageCount}
                      onChange={(e) =>
                        setSettingsDraft((prev) => ({
                          ...prev,
                          images: {
                            ...prev.images,
                            inlineImageCount: Number(e.target.value) || 0,
                          },
                        }))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                    <div>
                      <p className="font-medium">YouTube embeds</p>
                      <p className="text-sm text-muted-foreground">
                        Voeg video-embed markers toe waar relevant.
                      </p>
                    </div>
                    <Switch
                      checked={settingsDraft.images.youtubeEnabled}
                      onCheckedChange={(checked) =>
                        setSettingsDraft((prev) => ({
                          ...prev,
                          images: { ...prev.images, youtubeEnabled: checked },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Aantal YouTube embeds</Label>
                    <Input
                      type="number"
                      min={0}
                      max={3}
                      disabled={!settingsDraft.images.youtubeEnabled}
                      value={settingsDraft.images.youtubeCount}
                      onChange={(e) =>
                        setSettingsDraft((prev) => ({
                          ...prev,
                          images: {
                            ...prev.images,
                            youtubeCount: Number(e.target.value) || 0,
                          },
                        }))
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-6 py-4">
            <Button
              variant="outline"
              onClick={() => setSettingsDraft(DEFAULT_GENERATION_SETTINGS)}
            >
              Revert to defaults
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setSettingsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveGenerationSettings} disabled={savingSettings}>
                {savingSettings ? "Opslaan..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
                      <Badge variant="outline" className="text-xs">
                        {cluster.content_type === "pages" ? "Pagina's" : "Posts"}
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
                      {/* Cluster details editing */}
                      <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-semibold">Cluster details</Label>
                          <Button
                            size="sm"
                            onClick={() => saveClusterDetails(cluster.id)}
                            disabled={savingCluster}
                          >
                            <Save className="h-3.5 w-3.5 mr-1" />
                            {savingCluster ? "Opslaan..." : "Opslaan"}
                          </Button>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Clusternaam</Label>
                            <Input
                              value={editClusterName}
                              onChange={(e) => setEditClusterName(e.target.value)}
                              placeholder="Bijv. Webdesign"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Pillar topic</Label>
                            <Input
                              value={editClusterPillar}
                              onChange={(e) => setEditClusterPillar(e.target.value)}
                              placeholder="Hoofdonderwerp"
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Beschrijving</Label>
                          <TiptapEditor
                            content={editClusterDescription}
                            onChange={setEditClusterDescription}
                            placeholder="Wat moet het pillar artikel behandelen?"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Pillar zoekwoorden</Label>
                          <KeywordInput keywords={editClusterKeywords} onChange={setEditClusterKeywords} />
                        </div>
                      </div>

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

                      {/* Pillar page linker (pages mode only) */}
                      {cluster.content_type === "pages" && (
                        <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
                          <Label className="text-xs font-semibold">Pillar pagina</Label>
                          {cluster.pillar_wp_post_id ? (
                            <div className="flex items-center gap-2">
                              <a
                                href={cluster.pillar_wp_post_url ?? "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 truncate text-sm text-primary underline underline-offset-2"
                              >
                                {wpPostOptions.find((p) => p.wp_post_id === cluster.pillar_wp_post_id)?.title ?? cluster.pillar_wp_post_url ?? `Pagina #${cluster.pillar_wp_post_id}`}
                              </a>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="shrink-0 text-destructive"
                                onClick={() => unlinkPillarPage(cluster.id)}
                                disabled={settingPillar}
                              >
                                <X className="h-3.5 w-3.5 mr-1" /> Ontkoppelen
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <NativeSelect
                                value={selectedPillarId}
                                onChange={(e) => setSelectedPillarId(e.target.value)}
                                className="flex-1"
                                disabled={wpPostOptions.length === 0}
                              >
                                <option value="">
                                  {wpPostOptions.length === 0
                                    ? "Geen pagina's gevonden in cache — synchroniseer eerst"
                                    : "Selecteer een bestaande pagina…"}
                                </option>
                                {wpPostOptions.map((p) => (
                                  <option key={p.wp_post_id} value={String(p.wp_post_id)}>
                                    {p.title}
                                  </option>
                                ))}
                              </NativeSelect>
                              <Button
                                size="sm"
                                className="shrink-0"
                                onClick={() => setPillarPage(cluster.id, cluster.site_id)}
                                disabled={!selectedPillarId || settingPillar}
                              >
                                {settingPillar ? "Koppelen..." : "Koppel"}
                              </Button>
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {cluster.pillar_wp_post_id
                              ? "Subtopics worden als kindpagina van deze pillar aangemaakt."
                              : "Bestaat de pillar al? Koppel hem hier zodat subtopics er automatisch onder vallen. Of laat het leeg om een nieuwe pillar te laten genereren."}
                          </p>
                        </div>
                      )}

                      {/* Sitemap overlap warning */}
                      {sitemapLoading && (
                        <p className="text-xs text-muted-foreground">Sitemap controleren...</p>
                      )}
                      {sitemapOverlaps.length > 0 && (
                        <div className="rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20 px-3 py-2">
                          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                            Bestaande content gedetecteerd ({sitemapOverlaps.length} pagina&apos;s)
                          </p>
                          <ul className="mt-1 space-y-1">
                            {sitemapOverlaps.map((item, i) => (
                              <li key={i} className="text-xs text-yellow-700 dark:text-yellow-300">
                                <a href={item.url} target="_blank" rel="noopener noreferrer" className="underline break-all">{item.url}</a>
                                <span className="ml-1 text-yellow-600 dark:text-yellow-400"> — {item.reason}</span>
                              </li>
                            ))}
                          </ul>
                          <p className="mt-1.5 text-xs text-yellow-600 dark:text-yellow-400">
                            Nieuwe content zal automatisch naar deze pagina&apos;s linken.
                          </p>
                        </div>
                      )}

                      {/* Topics list */}
                      {topics.length > 0 ? (
                        <div className="space-y-2">
                          {topics.map((topic) => (
                            <div key={topic.id} className="rounded-lg border">
                              <div className="flex items-center justify-between px-3 py-2">
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
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      editingTopicId === topic.id
                                        ? setEditingTopicId(null)
                                        : startEditTopic(topic)
                                    }
                                  >
                                    {editingTopicId === topic.id ? (
                                      <X className="h-4 w-4" />
                                    ) : (
                                      <Pencil className="h-4 w-4" />
                                    )}
                                  </Button>
                                  {topic.internal_post_id && (
                                    <Link
                                      href={`/seo-editor/${topic.internal_post_id}`}
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground"
                                      title="Inhoud bewerken in SEO Editor"
                                    >
                                      <FileEdit className="h-4 w-4" />
                                    </Link>
                                  )}
                                  {topic.wp_post_url && (
                                    <a
                                      href={topic.wp_post_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground"
                                      title="Bekijk op WordPress"
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                    </a>
                                  )}
                                  <Button variant="ghost" size="sm" onClick={() => deleteTopic(topic.id, cluster.id)} className="text-destructive">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              {editingTopicId === topic.id && (
                                <div className="border-t bg-muted/20 px-3 py-3 space-y-3">
                                  <div className="space-y-1.5">
                                    <Label className="text-xs">Titel</Label>
                                    <Input
                                      value={editTopicTitle}
                                      onChange={(e) => setEditTopicTitle(e.target.value)}
                                    />
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label className="text-xs">Beschrijving</Label>
                                    <Textarea
                                      value={editTopicDescription}
                                      onChange={(e) => setEditTopicDescription(e.target.value)}
                                      placeholder="Korte beschrijving van dit subtopic..."
                                      rows={2}
                                    />
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label className="text-xs">Zoekwoorden</Label>
                                    <KeywordInput
                                      keywords={editTopicKeywords}
                                      onChange={setEditTopicKeywords}
                                    />
                                  </div>
                                  <Button
                                    size="sm"
                                    onClick={() => saveTopic(topic.id, cluster.id)}
                                    disabled={savingTopic || !editTopicTitle.trim()}
                                  >
                                    <Save className="h-3.5 w-3.5 mr-1" />
                                    {savingTopic ? "Opslaan..." : "Opslaan"}
                                  </Button>
                                </div>
                              )}
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
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openGenerationSettings(cluster)}
                        >
                          SEO instellingen
                        </Button>
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
