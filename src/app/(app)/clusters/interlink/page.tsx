"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link2, Play, Check, X, ExternalLink, ArrowRight } from "lucide-react";

interface AddedLink {
  url: string;
  anchor: string;
  title?: string;
}
interface Proposal {
  id: string;
  wp_post_id: number;
  url: string | null;
  title: string | null;
  added_links: AddedLink[];
  status: string;
  error_message: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  generating: "Bezig…",
  pending: "Klaar om te bekijken",
  applied: "Gepubliceerd",
  dismissed: "Verworpen",
  failed: "Mislukt",
};

export default function InterlinkPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const clusterId = searchParams.get("clusterId") || "";

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clusterId) return;
    try {
      const res = await fetch(`/api/interlink?clusterId=${clusterId}`);
      const data = await res.json();
      if (res.ok) setProposals(data.proposals ?? []);
    } finally {
      setLoading(false);
    }
  }, [clusterId]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll terwijl er voorstellen gegenereerd worden.
  useEffect(() => {
    if (!proposals.some((p) => p.status === "generating")) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposals]);

  async function generate() {
    setGenerating(true);
    setMessage(null);
    try {
      const res = await fetch("/api/interlink/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clusterId }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.message || data.error || "Genereren mislukt");
        return;
      }
      setMessage(`${data.started} pagina's worden geanalyseerd…`);
      await load();
    } finally {
      setGenerating(false);
    }
  }

  async function apply(id: string) {
    setApplyingId(id);
    try {
      const res = await fetch(`/api/interlink/${id}/apply`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(data.error || "Publiceren mislukt");
        return;
      }
      await load();
    } finally {
      setApplyingId(null);
    }
  }

  async function dismiss(id: string) {
    await fetch(`/api/interlink/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dismissed" }),
    });
    setProposals((prev) => prev.filter((p) => p.id !== id));
  }

  const reviewable = proposals.filter((p) => p.status === "pending" && p.added_links.length > 0);

  async function applyAll() {
    for (const p of reviewable) {
      // sequentieel om WP niet te overbelasten
      // eslint-disable-next-line no-await-in-loop
      await apply(p.id);
    }
  }

  if (!clusterId) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed p-12">
        <p className="text-muted-foreground text-sm">Geen cluster geselecteerd.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={() => router.push("/clusters")}>&larr; Clusters</Button>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Interne links toevoegen</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            De AI stelt voor waar in de bestaande pagina&apos;s natuurlijke links naar de pillar en
            zusterpagina&apos;s passen. Niets gaat live tot jij een voorstel publiceert.
          </p>
        </div>
        <Button onClick={generate} disabled={generating}>
          <Link2 className="h-4 w-4 mr-1.5" />
          {generating ? "Starten…" : "Genereer voorstellen"}
        </Button>
      </div>

      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : proposals.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed p-12">
          <p className="text-muted-foreground text-sm">
            Nog geen voorstellen. Klik op &quot;Genereer voorstellen&quot; om te beginnen.
          </p>
        </div>
      ) : (
        <>
          {reviewable.length > 1 && (
            <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3">
              <span className="text-sm">{reviewable.length} pagina&apos;s klaar om te publiceren</span>
              <Button size="sm" onClick={applyAll}>
                <Play className="h-4 w-4 mr-1.5" /> Alles publiceren
              </Button>
            </div>
          )}

          <div className="space-y-2">
            {proposals.map((p) => (
              <div key={p.id} className="rounded-lg border bg-card px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium truncate">{p.title || `Post #${p.wp_post_id}`}</span>
                      <Badge
                        variant={p.status === "applied" ? "outline" : p.status === "failed" ? "destructive" : "secondary"}
                        className="text-xs"
                      >
                        {STATUS_LABEL[p.status] ?? p.status}
                      </Badge>
                    </div>

                    {p.status === "pending" && p.added_links.length === 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">Geen natuurlijke linkkans gevonden op deze pagina.</p>
                    )}
                    {p.error_message && p.status === "failed" && (
                      <p className="mt-1 text-xs text-destructive">{p.error_message}</p>
                    )}
                    {p.added_links.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {p.added_links.map((l, i) => (
                          <li key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">{l.anchor || "link"}</span>
                            <ArrowRight className="h-3 w-3" />
                            <span className="truncate">{l.title || l.url}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent" title="Bekijk pagina">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                    {p.status === "pending" && p.added_links.length > 0 && (
                      <>
                        <Button size="sm" onClick={() => apply(p.id)} disabled={applyingId === p.id}>
                          <Check className="h-4 w-4 mr-1" /> {applyingId === p.id ? "Bezig…" : "Publiceer"}
                        </Button>
                        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => dismiss(p.id)} title="Verwerp">
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
