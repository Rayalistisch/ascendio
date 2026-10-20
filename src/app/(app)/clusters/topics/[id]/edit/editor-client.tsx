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
        <label className="text-sm font-medium">Inhoud</label>
        <TiptapEditor content={content} onChange={setContent} />
      </div>
    </div>
  );
}
