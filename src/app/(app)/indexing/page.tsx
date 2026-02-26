"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [requests, setRequests] = useState<IndexingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUrl, setNewUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Credentials state
  const [hasCredentials, setHasCredentials] = useState<boolean | null>(null);
  const [showCredentialForm, setShowCredentialForm] = useState(false);
  const [credentialJson, setCredentialJson] = useState("");
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [credentialError, setCredentialError] = useState("");

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

  const fetchCredentialStatus = useCallback(async () => {
    if (!siteId) return;
    const res = await fetch(`/api/sites/indexing-credentials?siteId=${siteId}`);
    if (res.ok) {
      const data = await res.json();
      setHasCredentials(data.hasCredentials);
      if (!data.hasCredentials) setShowCredentialForm(true);
    }
  }, [siteId]);

  useEffect(() => {
    fetchRequests();
    fetchCredentialStatus();
  }, [fetchRequests, fetchCredentialStatus]);

  async function saveCredentials() {
    setCredentialError("");
    setSavingCredentials(true);
    try {
      const res = await fetch("/api/sites/indexing-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, serviceAccountJson: credentialJson }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCredentialError(data.error || "Opslaan mislukt");
        return;
      }
      setHasCredentials(true);
      setShowCredentialForm(false);
      setCredentialJson("");
    } finally {
      setSavingCredentials(false);
    }
  }

  async function removeCredentials() {
    setSavingCredentials(true);
    try {
      await fetch("/api/sites/indexing-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, serviceAccountJson: null }),
      });
      setHasCredentials(false);
      setShowCredentialForm(true);
    } finally {
      setSavingCredentials(false);
    }
  }

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

  function handleSiteChange(nextSiteId: string) {
    setSiteId(nextSiteId);
    updateSiteInUrl(nextSiteId);
    setHasCredentials(null);
    setShowCredentialForm(false);
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
          <NativeSelect value={siteId} onChange={(e) => handleSiteChange(e.target.value)} className="w-48">
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </NativeSelect>
        )}
      </div>

      {/* Google service account setup */}
      {siteId && hasCredentials !== null && (
        <div className={`rounded-lg border p-4 space-y-3 ${hasCredentials ? "border-green-200 bg-green-50 dark:bg-green-950/20" : "border-amber-200 bg-amber-50 dark:bg-amber-950/20"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {hasCredentials ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
              )}
              <span className="text-sm font-medium">
                {hasCredentials ? "Google service account gekoppeld" : "Geen Google service account ingesteld"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {hasCredentials && (
                <Button variant="ghost" size="sm" onClick={removeCredentials} disabled={savingCredentials} className="text-destructive text-xs h-7">
                  Verwijderen
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowCredentialForm((v) => !v)}
              >
                {showCredentialForm ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {hasCredentials ? "Wijzigen" : "Instellen"}
              </Button>
            </div>
          </div>

          {!hasCredentials && !showCredentialForm && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Stel een Google service account in om URLs te kunnen indienen bij Google.
            </p>
          )}

          {showCredentialForm && (
            <div className="space-y-3 pt-1">
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium">Hoe stel je dit in:</p>
                <ol className="list-decimal list-inside space-y-0.5 pl-1">
                  <li>Ga naar <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="underline">Google Cloud Console</a> → maak een project aan</li>
                  <li>Activeer de <strong>Indexing API</strong> in de bibliotheek</li>
                  <li>Maak een service account aan → download de JSON-sleutel</li>
                  <li>Voeg het service account e-mailadres toe als <strong>eigenaar</strong> in <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" className="underline">Search Console</a></li>
                  <li>Plak de inhoud van de JSON-sleutel hieronder</li>
                </ol>
              </div>
              <Textarea
                value={credentialJson}
                onChange={(e) => setCredentialJson(e.target.value)}
                placeholder={'{\n  "type": "service_account",\n  "client_email": "...",\n  "private_key": "..."\n}'}
                rows={6}
                className="font-mono text-xs"
              />
              {credentialError && (
                <p className="text-xs text-destructive">{credentialError}</p>
              )}
              <Button size="sm" onClick={saveCredentials} disabled={savingCredentials || !credentialJson.trim()}>
                {savingCredentials ? "Opslaan..." : "Opslaan"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Submit URL */}
      <div className="flex gap-3">
        <Input
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitUrl(); } }}
          placeholder="https://jouwsite.nl/nieuw-artikel"
          className="flex-1"
        />
        <Button onClick={submitUrl} disabled={submitting || !newUrl.trim() || !hasCredentials}>
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
