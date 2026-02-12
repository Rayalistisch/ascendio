"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { SeoScoreBadge } from "@/components/seo-score-badge";
import { HtmlPreview } from "@/components/html-preview";
import { KeywordInput } from "@/components/keyword-input";

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
  const [showPreview, setShowPreview] = useState(false);

  const fetchPost = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/wp-posts/${postId}`);
      const data = await res.json();
      const p = data.post;
      if (p) {
        setPost(p);
        setTitle(p.title ?? "");
        setContent(p.content ?? "");
        setMetaTitle(p.meta_title ?? "");
        setMetaDescription(p.meta_description ?? "");
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
        setPost(data.post);
      }
    } finally {
      setSaving(false);
    }
  }

  async function rewriteContent() {
    if (!rewritePrompt.trim()) return;
    setRewriting(true);
    try {
      const prompt = keywords.length > 0
        ? `${rewritePrompt}\n\nFocus op deze zoekwoorden: ${keywords.join(", ")}`
        : rewritePrompt;
      const res = await fetch(`/api/wp-posts/${postId}/rewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (res.ok) {
        const data = await res.json();
        setPost(data.post);
        setContent(data.post.content ?? "");
        setRewritePrompt("");
      }
    } finally {
      setRewriting(false);
    }
  }

  async function analyzeSeo() {
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/wp-posts/${postId}/seo-score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: keywords.length > 0 ? keywords : undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        setPost((prev) => prev ? { ...prev, seo_score: data.score } : prev);
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
      }
    } finally {
      setRegenerating(false);
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
          <SeoScoreBadge score={post.seo_score} />
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
              <Label>Content (HTML)</Label>
              <Button variant="ghost" size="sm" onClick={() => setShowPreview(!showPreview)}>
                {showPreview ? "Editor" : "Preview"}
              </Button>
            </div>
            {showPreview ? (
              <HtmlPreview html={content} />
            ) : (
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={20}
                className="font-mono text-xs"
              />
            )}
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
            <Button variant="outline" size="sm" onClick={regenerateImage} disabled={regenerating} className="w-full">
              {regenerating ? "Genereren..." : "Afbeelding regenereren"}
            </Button>
          </div>

          {/* AI Rewrite */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <h3 className="font-semibold text-sm">AI Herschrijven</h3>
            <div className="space-y-2">
              <Label className="text-xs">Zoekwoorden</Label>
              <KeywordInput keywords={keywords} onChange={setKeywords} />
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
    </div>
  );
}
