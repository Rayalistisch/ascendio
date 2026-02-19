"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { NativeSelect } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SeoScoreBadge, type SeoDetails } from "@/components/seo-score-badge";
import { HtmlPreview } from "@/components/html-preview";
import { KeywordInput } from "@/components/keyword-input";
import {
  DEFAULT_GENERATION_SETTINGS,
  normalizeGenerationSettings,
  type GenerationSettings,
  type HeadingLetterCase,
  type KnowledgeMode,
} from "@/lib/generation-settings";

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
    description: "Leun zoveel mogelijk op de huidige content en bestaande bronnen.",
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

interface WpPost {
  id: string;
  wp_post_id: number;
  site_id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  status: string;
  seo_score: number | null;
  meta_title: string | null;
  meta_description: string | null;
  featured_image_url: string | null;
  generation_settings: GenerationSettings | null;
}

export default function SeoEditorPostPage() {
  const params = useParams();
  const router = useRouter();
  const postId = params.postId as string;

  const [post, setPost] = useState<WpPost | null>(null);
  const [loading, setLoading] = useState(true);

  // Editable fields
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // AI tools
  const [rewritePrompt, setRewritePrompt] = useState("");
  const [rewriting, setRewriting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(true);
  const [seoDetails, setSeoDetails] = useState<SeoDetails | null>(null);
  const [uploading, setUploading] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("details");
  const [settingsDraft, setSettingsDraft] = useState<GenerationSettings>(
    DEFAULT_GENERATION_SETTINGS
  );
  const [savingSettings, setSavingSettings] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPost = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/wp-posts/${postId}`);
      const data = await res.json();
      const p = data.post as (WpPost & { generation_settings?: unknown }) | null;
      if (p) {
        const normalizedPost: WpPost = {
          ...p,
          generation_settings: normalizeGenerationSettings(p.generation_settings),
        };
        setPost(normalizedPost);
        setTitle(normalizedPost.title ?? "");
        setContent(normalizedPost.content ?? "");
        setMetaTitle(normalizedPost.meta_title ?? "");
        setMetaDescription(normalizedPost.meta_description ?? "");
        setSettingsDraft(
          normalizeGenerationSettings(normalizedPost.generation_settings ?? undefined)
        );
      }
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    fetchPost();
  }, [fetchPost]);

  async function savePost() {
    setSaving(true);
    try {
      const res = await fetch(`/api/wp-posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, metaTitle, metaDescription }),
      });
      if (res.ok) {
        const data = await res.json();
        const updated = data.post as (WpPost & { generation_settings?: unknown }) | undefined;
        if (updated) {
          setPost({
            ...updated,
            generation_settings: normalizeGenerationSettings(updated.generation_settings),
          });
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function rewriteContent() {
    if (!rewritePrompt.trim()) return;
    setRewriting(true);
    try {
      const mergedKeywords = Array.from(
        new Set(
          [
            ...keywords,
            ...settingsDraft.details.includeKeywords,
            settingsDraft.details.focusKeyword,
          ].filter((item) => typeof item === "string" && item.trim().length > 0)
        )
      );
      const prompt = mergedKeywords.length > 0
        ? `${rewritePrompt}\n\nFocus op deze zoekwoorden: ${mergedKeywords.join(", ")}`
        : rewritePrompt;
      const res = await fetch(`/api/wp-posts/${postId}/rewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          keywords: mergedKeywords.length > 0 ? mergedKeywords : undefined,
          generationSettings: settingsDraft,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.post) {
          setPost({
            ...data.post,
            generation_settings: normalizeGenerationSettings(
              data.post.generation_settings
            ),
          });
          setContent(data.post.content ?? "");
          setMetaTitle(data.post.meta_title ?? "");
          setMetaDescription(data.post.meta_description ?? "");
        }
        setRewritePrompt("");
        window.dispatchEvent(new Event("credits-updated"));
      }
    } finally {
      setRewriting(false);
    }
  }

  async function saveGenerationSettings() {
    setSavingSettings(true);
    try {
      const normalized = normalizeGenerationSettings(settingsDraft);
      const res = await fetch(`/api/wp-posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generationSettings: normalized }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const updated = data.post as (WpPost & { generation_settings?: unknown }) | undefined;
      if (updated) {
        setPost({
          ...updated,
          generation_settings: normalizeGenerationSettings(updated.generation_settings),
        });
      }
      setSettingsDraft(normalized);
      setSettingsDialogOpen(false);
    } finally {
      setSavingSettings(false);
    }
  }

  async function analyzeSeo() {
    setAnalyzing(true);
    try {
      const mergedKeywords = Array.from(
        new Set(
          [
            ...keywords,
            ...settingsDraft.details.includeKeywords,
            settingsDraft.details.focusKeyword,
          ].filter((item) => typeof item === "string" && item.trim().length > 0)
        )
      );
      const res = await fetch(`/api/wp-posts/${postId}/seo-score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords: mergedKeywords.length > 0 ? mergedKeywords : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPost((prev) => prev ? { ...prev, seo_score: data.score } : prev);
        setSeoDetails({
          issues: data.issues ?? [],
          suggestions: data.suggestions ?? [],
        });
        window.dispatchEvent(new Event("credits-updated"));
      }
    } finally {
      setAnalyzing(false);
    }
  }

  async function regenerateImage() {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/wp-posts/${postId}/regenerate-image`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setPost((prev) => prev ? { ...prev, featured_image_url: data.imageUrl } : prev);
        window.dispatchEvent(new Event("credits-updated"));
      }
    } finally {
      setRegenerating(false);
    }
  }

  async function uploadImage(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/wp-posts/${postId}/upload-image`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setPost((prev) => prev ? { ...prev, featured_image_url: data.imageUrl } : prev);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Post niet gevonden.</p>
        <Button variant="outline" onClick={() => router.push("/seo-editor")}>Terug</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => router.push("/seo-editor")}>
            &larr; Terug
          </Button>
          <h1 className="text-2xl font-bold tracking-tight truncate max-w-md">{post.title}</h1>
          <SeoScoreBadge score={post.seo_score} details={seoDetails} />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={analyzeSeo} disabled={analyzing}>
            {analyzing ? "Analyseren..." : "SEO Analyseren"}
          </Button>
          <Button onClick={savePost} disabled={saving}>
            {saving ? "Opslaan..." : "Opslaan & Publiceren"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main editor - 2 columns */}
        <div className="lg:col-span-2 space-y-4">
          <div className="space-y-2">
            <Label>Titel</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{showPreview ? "Content Preview (bewerkbaar)" : "Content (HTML)"}</Label>
              <Button variant="ghost" size="sm" onClick={() => setShowPreview(!showPreview)}>
                {showPreview ? "Codeweergave" : "Preview"}
              </Button>
            </div>
            {showPreview ? (
              <HtmlPreview html={content} editable onChange={setContent} />
            ) : (
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={20}
                className="font-mono text-xs"
              />
            )}
            <p className="text-xs text-muted-foreground">
              Preview staat standaard aan. Je kunt direct in de preview typen; schakel naar codeweergave voor raw HTML.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Meta titel</Label>
              <Input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} placeholder="SEO-titel..." />
              <p className="text-xs text-muted-foreground">{metaTitle.length}/60 tekens</p>
            </div>
            <div className="space-y-2">
              <Label>Meta beschrijving</Label>
              <Textarea value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} placeholder="SEO-beschrijving..." rows={2} />
              <p className="text-xs text-muted-foreground">{metaDescription.length}/160 tekens</p>
            </div>
          </div>
        </div>

        {/* AI Sidebar - 1 column */}
        <div className="space-y-6">
          {/* Featured image */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <h3 className="font-semibold text-sm">Uitgelichte afbeelding</h3>
            {post.featured_image_url ? (
              <img src={post.featured_image_url} alt="Featured" className="w-full rounded-lg" />
            ) : (
              <div className="w-full h-32 rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-sm">
                Geen afbeelding
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={regenerateImage} disabled={regenerating || uploading} className="flex-1">
                {regenerating ? "Genereren..." : "AI Genereren"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || regenerating}
                className="flex-1"
              >
                {uploading ? "Uploaden..." : "Uploaden"}
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadImage(file);
              }}
            />
          </div>

          {/* AI Rewrite */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-sm">AI Herschrijven</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSettingsTab("details");
                  setSettingsDialogOpen(true);
                }}
              >
                SEO instellingen
              </Button>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Zoekwoorden</Label>
              <KeywordInput keywords={keywords} onChange={setKeywords} />
              {settingsDraft.details.focusKeyword && (
                <p className="text-xs text-muted-foreground">
                  Focus keyword: <span className="font-medium">{settingsDraft.details.focusKeyword}</span>
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Instructie</Label>
              <Textarea
                value={rewritePrompt}
                onChange={(e) => setRewritePrompt(e.target.value)}
                placeholder="Bijv. Maak de tekst meer engaging en voeg meer interne links toe..."
                rows={3}
              />
            </div>
            <Button onClick={rewriteContent} disabled={rewriting || !rewritePrompt.trim()} className="w-full">
              {rewriting ? "Herschrijven..." : "Herschrijven met AI"}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent className="max-w-5xl p-0 overflow-hidden">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>SEO Article Details</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Configureer hoe AI herschrijven en contentopbouw in de SEO Editor werkt.
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
                      onChange={(nextKeywords) =>
                        setSettingsDraft((prev) => ({
                          ...prev,
                          details: { ...prev.details, includeKeywords: nextKeywords },
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Deze keywords worden extra meegenomen in herschrijven en SEO-aansturing.
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
                          active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
                        }`}
                      >
                        <p className="font-medium">{option.title}</p>
                        <p className="text-sm text-muted-foreground mt-1">{option.description}</p>
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
                            formatting: { ...prev.formatting, [item.key]: checked },
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
                        Voeg interne links toe waar relevant.
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
                        Voeg autoritatieve bronnen toe waar relevant.
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
                        Houd rekening met uitgelichte afbeeldingen in output.
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
                        Voeg video suggesties toe waar relevant.
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
    </div>
  );
}
