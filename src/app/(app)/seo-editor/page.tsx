"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SeoScoreBadge } from "@/components/seo-score-badge";

interface Site {
  id: string;
  name: string;
}

interface WpPost {
  id: string;
  wp_post_id: number;
  title: string;
  slug: string;
  status: string;
  seo_score: number | null;
  wp_modified_at: string | null;
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("nl-NL");
}

export default function SeoEditorPage() {
  const router = useRouter();
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [posts, setPosts] = useState<WpPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetch("/api/sites")
      .then((r) => r.json())
      .then((d) => {
        const list = d.sites ?? [];
        setSites(list);
        if (list.length > 0) setSiteId(list[0].id);
      });
  }, []);

  const fetchPosts = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ siteId });
      if (search) params.set("search", search);
      const res = await fetch(`/api/wp-posts?${params}`);
      const data = await res.json();
      setPosts(data.posts ?? []);
    } finally {
      setLoading(false);
    }
  }, [siteId, search]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  async function syncPosts() {
    setSyncing(true);
    try {
      await fetch("/api/wp-posts/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      fetchPosts();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">SEO Editor</h1>
          <p className="text-muted-foreground mt-1">
            Bewerk, herschrijf en optimaliseer je WordPress-content met AI.
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
          <Button variant="outline" onClick={syncPosts} disabled={syncing}>
            {syncing ? "Synchroniseren..." : "Sync vanuit WP"}
          </Button>
        </div>
      </div>

      {/* Search */}
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Zoek op titel..."
        className="max-w-sm"
      />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 gap-3">
          <p className="text-muted-foreground text-sm">
            Geen posts gevonden. Synchroniseer eerst je WordPress-posts.
          </p>
          <Button variant="outline" onClick={syncPosts} disabled={syncing}>
            Posts synchroniseren
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Titel</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">SEO Score</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Laatst bewerkt</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {posts.map((post) => (
                <tr key={post.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium max-w-[300px] truncate">{post.title}</td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">{post.status}</td>
                  <td className="px-4 py-3">
                    <SeoScoreBadge score={post.seo_score} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {formatDate(post.wp_modified_at)}
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="outline" size="sm" onClick={() => router.push(`/seo-editor/${post.id}`)}>
                      Bewerken
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
