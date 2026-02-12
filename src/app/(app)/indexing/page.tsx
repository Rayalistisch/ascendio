"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface Site {
  id: string;
  name: string;
}

interface IndexingRequest {
  id: string;
  url: string;
  status: string;
  submitted_at: string | null;
  created_at: string;
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Wachtend", variant: "secondary" },
  submitted: { label: "Ingediend", variant: "outline" },
  failed: { label: "Mislukt", variant: "destructive" },
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("nl-NL");
}

export default function IndexingPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [requests, setRequests] = useState<IndexingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUrl, setNewUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/sites")
      .then((r) => r.json())
      .then((d) => {
        const list = d.sites ?? [];
        setSites(list);
        if (list.length > 0) setSiteId(list[0].id);
      });
  }, []);

  const fetchRequests = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/indexing?siteId=${siteId}`);
      const data = await res.json();
      setRequests(data.requests ?? []);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  async function submitUrl() {
    if (!newUrl.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/indexing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, url: newUrl.trim() }),
      });
      if (res.ok) {
        setNewUrl("");
        fetchRequests();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Google Indexering</h1>
          <p className="text-muted-foreground mt-1">
            Dien URLs in bij Google voor snellere indexering.
          </p>
        </div>
        {sites.length > 1 && (
          <NativeSelect value={siteId} onChange={(e) => setSiteId(e.target.value)} className="w-48">
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </NativeSelect>
        )}
      </div>

      {/* Submit URL */}
      <div className="flex gap-3">
        <Input
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitUrl(); } }}
          placeholder="https://jouwsite.nl/nieuw-artikel"
          className="flex-1"
        />
        <Button onClick={submitUrl} disabled={submitting || !newUrl.trim()}>
          {submitting ? "Bezig..." : "Indienen"}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : requests.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed p-12">
          <p className="text-muted-foreground text-sm">
            Nog geen indexeringsverzoeken voor deze site.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">URL</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Ingediend</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Aangemaakt</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {requests.map((req) => {
                const status = STATUS_MAP[req.status] ?? { label: req.status, variant: "secondary" as const };
                return (
                  <tr key={req.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 max-w-[300px]">
                      <a href={req.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline underline-offset-4 truncate block">
                        {req.url}
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {formatDate(req.submitted_at)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {formatDate(req.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
