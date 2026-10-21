"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export interface BlogTopic {
  id: string;
  title: string;
  status: string;
  generated_title: string | null;
  wp_post_url: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pending: { label: "Wachtend", variant: "secondary" },
  generating: { label: "Genereren…", variant: "default" },
  draft: { label: "Concept", variant: "secondary" },
  published: { label: "Gepubliceerd", variant: "outline" },
  failed: { label: "Mislukt", variant: "destructive" },
};

export function BlogsClient({
  siteId,
  initialTopics,
}: {
  siteId: string;
  initialTopics: BlogTopic[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [keywords, setKeywords] = useState("");
  const [generating, setGenerating] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Zolang er een blog genereert: periodiek de serverdata verversen.
  const anyGenerating = initialTopics.some(
    (t) => t.status === "generating" || t.status === "pending"
  );
  useEffect(() => {
    if (!anyGenerating) return;
    const i = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(i);
  }, [anyGenerating, router]);

  async function generate() {
    if (!title.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/blogs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          title: title.trim(),
          keywords: keywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Genereren mislukt");
        return;
      }
      setTitle("");
      setKeywords("");
      router.refresh();
    } finally {
      setGenerating(false);
    }
  }

  async function publish(topicId: string) {
    if (!window.confirm("Deze blog nu publiceren onder /kenniscentrum/blogs?")) return;
    setPublishingId(topicId);
    setError(null);
    try {
      const res = await fetch(`/api/clusters/topics/${topicId}/publish`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Publiceren mislukt");
        return;
      }
      router.refresh();
    } finally {
      setPublishingId(null);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Blogs</h1>
        <p className="text-muted-foreground mt-1">
          Genereer losse blogs en publiceer ze onder{" "}
          <code>/kenniscentrum/blogs</code>.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Nieuwe blog */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="font-semibold">Nieuwe blog</h2>
        <div className="space-y-2">
          <label className="text-sm font-medium">Onderwerp / titel</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="bijv. Onderhoudstips voor accukabels"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Zoekwoorden <span className="text-muted-foreground">(optioneel, komma-gescheiden)</span>
          </label>
          <Input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="accukabels, onderhoud"
          />
        </div>
        <Button onClick={generate} disabled={generating || !title.trim()}>
          {generating ? "Starten…" : "Genereer concept"}
        </Button>
        <p className="text-xs text-muted-foreground">
          De blog wordt als concept gegenereerd. Daarna kun je hem bewerken en
          publiceren.
        </p>
      </div>

      {/* Lijst */}
      {initialTopics.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nog geen blogs. Genereer je eerste hierboven.
        </div>
      ) : (
        <div className="space-y-2">
          {initialTopics.map((t) => {
            const status = STATUS_LABELS[t.status] ?? {
              label: t.status,
              variant: "secondary" as const,
            };
            return (
              <div
                key={t.id}
                className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {t.generated_title || t.title}
                    </span>
                    <Badge variant={status.variant} className="shrink-0 text-xs">
                      {status.label}
                    </Badge>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {(t.status === "draft" || t.status === "published") && (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/clusters/topics/${t.id}/edit`}>Bewerken</Link>
                    </Button>
                  )}
                  {t.status === "draft" && (
                    <Button
                      size="sm"
                      onClick={() => publish(t.id)}
                      disabled={publishingId === t.id}
                      className="bg-green-600 text-white hover:bg-green-700"
                    >
                      {publishingId === t.id ? "Publiceren…" : "Publiceren"}
                    </Button>
                  )}
                  {t.wp_post_url && (
                    <a
                      href={t.wp_post_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline"
                    >
                      Bekijken
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
