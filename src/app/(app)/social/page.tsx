"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface Site {
  id: string;
  name: string;
}

interface SocialPost {
  id: string;
  site_id: string;
  platform: string;
  copy: string;
  webhook_url: string | null;
  status: string;
  sent_at: string | null;
  created_at: string;
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Wachtend", variant: "secondary" },
  sent: { label: "Verzonden", variant: "outline" },
  failed: { label: "Mislukt", variant: "destructive" },
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("nl-NL");
}

export default function SocialPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newCopy, setNewCopy] = useState("");
  const [newPlatform, setNewPlatform] = useState("twitter");
  const [newWebhook, setNewWebhook] = useState("");
  const [creating, setCreating] = useState(false);

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
      const res = await fetch(`/api/social?siteId=${siteId}`);
      const data = await res.json();
      setPosts(data.posts ?? []);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  async function createPost() {
    setCreating(true);
    try {
      const res = await fetch("/api/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          platform: newPlatform,
          copy: newCopy,
          webhookUrl: newWebhook || undefined,
        }),
      });
      if (res.ok) {
        setDialogOpen(false);
        setNewCopy("");
        setNewWebhook("");
        fetchPosts();
      }
    } finally {
      setCreating(false);
    }
  }

  async function sendPost(postId: string) {
    await fetch(`/api/social/${postId}/send`, { method: "POST" });
    fetchPosts();
  }

  async function deletePost(postId: string) {
    await fetch(`/api/social/${postId}`, { method: "DELETE" });
    fetchPosts();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Social Media</h1>
          <p className="text-muted-foreground mt-1">
            Beheer en verstuur social media posts via webhooks.
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
              Post aanmaken
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nieuwe social post</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Platform</Label>
                  <NativeSelect value={newPlatform} onChange={(e) => setNewPlatform(e.target.value)}>
                    <option value="twitter">Twitter / X</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="facebook">Facebook</option>
                    <option value="instagram">Instagram</option>
                  </NativeSelect>
                </div>
                <div className="space-y-2">
                  <Label>Tekst</Label>
                  <Textarea value={newCopy} onChange={(e) => setNewCopy(e.target.value)} placeholder="Je social media tekst..." rows={4} />
                </div>
                <div className="space-y-2">
                  <Label>Webhook URL (optioneel)</Label>
                  <Input value={newWebhook} onChange={(e) => setNewWebhook(e.target.value)} placeholder="https://..." />
                </div>
                <Button onClick={createPost} disabled={creating || !newCopy} className="w-full">
                  {creating ? "Bezig..." : "Aanmaken"}
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
      ) : posts.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed p-12">
          <p className="text-muted-foreground text-sm">
            Nog geen social posts voor deze site.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const status = STATUS_MAP[post.status] ?? { label: post.status, variant: "secondary" as const };
            return (
              <div key={post.id} className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary">{post.platform}</Badge>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{post.copy}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Aangemaakt: {formatDate(post.created_at)}
                      {post.sent_at && <> &middot; Verzonden: {formatDate(post.sent_at)}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {post.status === "pending" && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => sendPost(post.id)}>
                          Verzenden
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => deletePost(post.id)} className="text-destructive">
                          Verwijderen
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
