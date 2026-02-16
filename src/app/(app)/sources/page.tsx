"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

interface Site {
  id: string;
  name: string;
}

interface ContentSource {
  id: string;
  site_id: string;
  source_type: string;
  config: Record<string, unknown>;
  is_enabled: boolean;
  last_fetched_at: string | null;
  created_at: string;
  item_count: number;
}

interface SourceItem {
  id: string;
  title: string;
  url: string | null;
  is_used: boolean;
  fetched_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  rss: "RSS Feed",
  keywords: "Zoekwoorden",
  youtube: "YouTube",
  news: "Nieuws",
};

function getSourceDisplayName(source: ContentSource): string {
  const config = source.config;
  if (config.name) return config.name as string;
  if (config.feedUrl) return config.feedUrl as string;
  if (config.topic) return config.topic as string;
  if (config.channel_id) return config.channel_id as string;
  if (Array.isArray(config.keywords)) return (config.keywords as string[]).slice(0, 3).join(", ");
  return TYPE_LABELS[source.source_type] ?? source.source_type;
}

function formatDate(d: string | null) {
  if (!d) return "Nooit";
  return new Date(d).toLocaleString("nl-NL");
}

export default function SourcesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [sources, setSources] = useState<ContentSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [items, setItems] = useState<SourceItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  // New source form
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newType, setNewType] = useState("rss");
  const [newName, setNewName] = useState("");
  const [newConfig, setNewConfig] = useState("");
  const [creating, setCreating] = useState(false);

  function updateSiteInUrl(nextSiteId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("siteId", nextSiteId);
    router.replace(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    fetch("/api/sites")
      .then((r) => r.json())
      .then((d) => {
        const list: Site[] = d.sites ?? [];
        setSites(list);
        if (list.length === 0) return;
        const siteFromUrl = searchParams.get("siteId");
        if (siteFromUrl && list.some((site) => site.id === siteFromUrl)) {
          setSiteId(siteFromUrl);
          return;
        }
        setSiteId(list[0].id);
        updateSiteInUrl(list[0].id);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchSources = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/content-sources?siteId=${siteId}`);
      const data = await res.json();
      setSources(data.sources ?? []);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  async function loadItems(sourceId: string) {
    if (expandedId === sourceId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(sourceId);
    setItemsLoading(true);
    try {
      const res = await fetch(`/api/content-sources/items?sourceId=${sourceId}`);
      const data = await res.json();
      setItems(data.items ?? []);
    } finally {
      setItemsLoading(false);
    }
  }

  async function createSource() {
    setCreating(true);
    try {
      let config: Record<string, unknown> = { name: newName };
      if (newType === "rss") config.feedUrl = newConfig;
      else if (newType === "keywords") config.keywords = newConfig.split(",").map((k) => k.trim()).filter(Boolean);
      else if (newType === "youtube") config.channel_id = newConfig;
      else if (newType === "news") config.topic = newConfig;

      const res = await fetch("/api/content-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, sourceType: newType, config }),
      });
      if (res.ok) {
        setDialogOpen(false);
        setNewName("");
        setNewConfig("");
        fetchSources();
      }
    } finally {
      setCreating(false);
    }
  }

  async function deleteSource(id: string) {
    await fetch("/api/content-sources", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId: id }),
    });
    fetchSources();
  }

  async function triggerFetch(sourceId: string) {
    await fetch("/api/content-sources/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId }),
    });
    fetchSources();
  }

  function handleSiteChange(nextSiteId: string) {
    setSiteId(nextSiteId);
    updateSiteInUrl(nextSiteId);
  }

  const configPlaceholder: Record<string, string> = {
    rss: "https://voorbeeld.nl/feed.xml",
    keywords: "keyword1, keyword2, keyword3",
    youtube: "UC... (channel ID)",
    news: "Onderwerp",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bronnen</h1>
          <p className="text-muted-foreground mt-1">
            Beheer content-bronnen voor artikelgeneratie.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {sites.length > 1 && (
            <NativeSelect value={siteId} onChange={(e) => handleSiteChange(e.target.value)} className="w-48">
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </NativeSelect>
          )}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90">
              Bron toevoegen
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nieuwe bron</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <NativeSelect value={newType} onChange={(e) => setNewType(e.target.value)}>
                    <option value="rss">RSS Feed</option>
                    <option value="keywords">Zoekwoorden</option>
                    <option value="youtube">YouTube</option>
                    <option value="news">Nieuws</option>
                  </NativeSelect>
                </div>
                <div className="space-y-2">
                  <Label>Naam</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Mijn RSS feed" />
                </div>
                <div className="space-y-2">
                  <Label>Configuratie</Label>
                  <Input value={newConfig} onChange={(e) => setNewConfig(e.target.value)} placeholder={configPlaceholder[newType]} />
                </div>
                <Button onClick={createSource} disabled={creating || !newName || !newConfig} className="w-full">
                  {creating ? "Bezig..." : "Toevoegen"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : sources.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed p-12">
          <p className="text-muted-foreground text-sm">
            Nog geen bronnen geconfigureerd voor deze site.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sources.map((source) => (
            <div key={source.id} className="rounded-xl border bg-card shadow-sm">
              <div className="flex items-center justify-between p-4">
                <button type="button" onClick={() => loadItems(source.id)} className="flex items-center gap-3 text-left">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{getSourceDisplayName(source)}</span>
                      <Badge variant="secondary">{TYPE_LABELS[source.source_type] ?? source.source_type}</Badge>
                      {!source.is_enabled && <Badge variant="outline">Uitgeschakeld</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {source.item_count} items &middot; Laatst opgehaald: {formatDate(source.last_fetched_at)}
                    </p>
                  </div>
                </button>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => triggerFetch(source.id)}>
                    Ophalen
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteSource(source.id)} className="text-destructive">
                    Verwijderen
                  </Button>
                </div>
              </div>

              {expandedId === source.id && (
                <div className="border-t px-4 py-3 bg-muted/30">
                  {itemsLoading ? (
                    <Skeleton className="h-8 w-full" />
                  ) : items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Geen items gevonden.</p>
                  ) : (
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between text-sm py-1">
                          <div className="flex items-center gap-2 min-w-0">
                            {item.is_used && <Badge variant="outline" className="shrink-0 text-xs">Gebruikt</Badge>}
                            <span className="truncate">{item.title}</span>
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0 ml-2">
                            {formatDate(item.fetched_at)}
                          </span>
                        </div>
                      ))}
                    </div>
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
