"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TiptapEditor } from "@/components/tiptap-editor";

export function TopicEditorClient({
  topicId,
  initialTitle,
  initialContent,
  status,
}: {
  topicId: string;
  initialTitle: string;
  initialContent: string;
  status: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Visuele editor (TipTap) kent geen <details>/<summary>/<style> en stript die.
  // In HTML-modus zie en bewerk je de ruwe HTML, inclusief de FAQ-accordion.
  const [mode, setMode] = useState<"visual" | "html" | "preview">("html");

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/clusters/topics", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: topicId,
          generatedContent: content,
          generatedTitle: title,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Opslaan mislukt");
        return;
      }
      setSavedAt(new Date().toLocaleTimeString("nl-NL"));
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!window.confirm("Dit concept nu publiceren naar de site?")) return;
    setPublishing(true);
    setError(null);
    try {
      // Stuur de actuele (bewerkte) content mee; het endpoint slaat hem ook op.
      const res = await fetch(`/api/clusters/topics/${topicId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, title }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Publiceren mislukt");
        return;
      }
      router.push("/clusters");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Concept bewerken</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Pas de content aan en publiceer wanneer hij goed is.
            {status === "published" && " (Dit onderwerp is al gepubliceerd.)"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/clusters">Terug</Link>
          </Button>
          <Button variant="outline" onClick={save} disabled={saving}>
            {saving ? "Opslaan…" : "Opslaan"}
          </Button>
          <Button
            onClick={publish}
            disabled={publishing}
            className="bg-green-600 text-white hover:bg-green-700"
          >
            {publishing ? "Publiceren…" : "Publiceren"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {savedAt && !error && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
          Concept opgeslagen om {savedAt}.
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium">Titel</label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <label className="text-sm font-medium">Inhoud</label>
          <div className="inline-flex rounded-md border p-0.5">
            <button
              type="button"
              onClick={() => setMode("visual")}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                mode === "visual"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Visueel
            </button>
            <button
              type="button"
              onClick={() => setMode("html")}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                mode === "html"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              HTML
            </button>
            <button
              type="button"
              onClick={() => setMode("preview")}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                mode === "preview"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Voorbeeld
            </button>
          </div>
        </div>

        {mode === "preview" ? (
          <>
            <div
              className="min-h-[520px] w-full rounded-md border p-5"
              // Gerenderd voorbeeld: toont de accordion (details/summary + style)
              // zoals hij op de site zou werken. Content is onze eigen gegenereerde
              // HTML, geen externe invoer.
              dangerouslySetInnerHTML={{ __html: content }}
            />
            <p className="text-xs text-muted-foreground">
              Zo wordt de content weergegeven — klik op een FAQ-vraag om het
              uitklappen te testen.
            </p>
          </>
        ) : mode === "html" ? (
          <>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
              className="min-h-[520px] w-full rounded-md border bg-muted/20 p-3 font-mono text-xs leading-relaxed outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Ruwe HTML — hier staat ook de FAQ-uitklap-module (
              <code>&lt;details&gt;</code>). Bewerk de accordion in deze modus; de
              visuele editor verwijdert geavanceerde HTML.
            </p>
          </>
        ) : (
          <>
            <TiptapEditor content={content} onChange={setContent} />
            <p className="text-xs text-amber-600">
              Let op: de visuele editor ondersteunt geen{" "}
              <code>&lt;details&gt;</code>/<code>&lt;style&gt;</code> — schakel naar
              HTML om de accordion te behouden.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
