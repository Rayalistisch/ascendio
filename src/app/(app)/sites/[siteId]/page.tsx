"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Trash2, Plus } from "lucide-react";

interface SiteInfo {
  id: string;
  name: string;
  wp_base_url: string;
  status: string;
  default_language: string;
}

interface PreferredDomain {
  id: string;
  domain: string;
  label: string | null;
  priority: number;
}

interface ArticleTemplate {
  id: string;
  name: string;
  is_default: boolean;
}

export default function SiteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const siteId = params.siteId as string;

  const [site, setSite] = useState<SiteInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Preferred domains
  const [domains, setDomains] = useState<PreferredDomain[]>([]);
  const [domainsLoading, setDomainsLoading] = useState(true);
  const [newDomain, setNewDomain] = useState("");
  const [newDomainLabel, setNewDomainLabel] = useState("");
  const [addingDomain, setAddingDomain] = useState(false);

  // Templates
  const [templates, setTemplates] = useState<ArticleTemplate[]>([]);

  useEffect(() => {
    async function loadSite() {
      try {
        const res = await fetch("/api/sites");
        const data = await res.json();
        const found = (data.sites ?? []).find((s: SiteInfo) => s.id === siteId);
        setSite(found || null);
      } finally {
        setLoading(false);
      }
    }
    loadSite();
  }, [siteId]);

  const fetchDomains = useCallback(async () => {
    setDomainsLoading(true);
    try {
      const res = await fetch(`/api/preferred-domains?siteId=${siteId}`);
      const data = await res.json();
      setDomains(data.domains ?? []);
    } finally {
      setDomainsLoading(false);
    }
  }, [siteId]);

  const fetchTemplates = useCallback(async () => {
    const res = await fetch(`/api/article-templates?siteId=${siteId}`);
    const data = await res.json();
    setTemplates(data.templates ?? []);
  }, [siteId]);

  useEffect(() => {
    fetchDomains();
    fetchTemplates();
  }, [fetchDomains, fetchTemplates]);

  async function addDomain() {
    if (!newDomain.trim()) return;
    setAddingDomain(true);
    try {
      const res = await fetch("/api/preferred-domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, domain: newDomain, label: newDomainLabel || undefined }),
      });
      if (res.ok) {
        setNewDomain("");
        setNewDomainLabel("");
        fetchDomains();
      }
    } finally {
      setAddingDomain(false);
    }
  }

  async function deleteDomain(id: string) {
    await fetch("/api/preferred-domains", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchDomains();
  }

  async function setDefaultTemplate(templateId: string) {
    if (!templateId) return;
    await fetch("/api/article-templates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: templateId, isDefault: true }),
    });
    fetchTemplates();
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!site) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Site niet gevonden.</p>
        <Button variant="outline" onClick={() => router.push("/sites")}>Terug</Button>
      </div>
    );
  }

  const defaultTemplate = templates.find((t) => t.is_default);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.push("/sites")}>
          &larr; Terug
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{site.name}</h1>
        <Badge variant={site.status === "active" ? "outline" : "secondary"}
          className={site.status === "active" ? "border-green-500 text-green-600" : ""}>
          {site.status === "active" ? "Actief" : "Inactief"}
        </Badge>
      </div>

      {/* Site info */}
      <div className="rounded-xl border bg-card p-4 space-y-2">
        <h2 className="font-semibold">Site informatie</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">WordPress URL:</span>
            <p className="font-mono">{site.wp_base_url}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Taal:</span>
            <p>{site.default_language}</p>
          </div>
        </div>
      </div>

      {/* Default template selector */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <h2 className="font-semibold">Standaard artikeltemplate</h2>
        <p className="text-sm text-muted-foreground">
          Dit template wordt gebruikt als er geen specifiek template is geselecteerd bij generatie.
        </p>
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nog geen templates aangemaakt. <a href="/templates" className="underline">Maak er een aan</a>.
          </p>
        ) : (
          <NativeSelect
            value={defaultTemplate?.id ?? ""}
            onChange={(e) => setDefaultTemplate(e.target.value)}
            className="w-64"
          >
            <option value="">Geen standaard</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </NativeSelect>
        )}
      </div>

      {/* Preferred external domains */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div>
          <h2 className="font-semibold">Voorkeur externe linkdomeinen</h2>
          <p className="text-sm text-muted-foreground">
            Voeg autoritieve bronnen toe die de AI bij voorkeur linkt in gegenereerde artikelen.
          </p>
        </div>

        {domainsLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : domains.length > 0 ? (
          <div className="space-y-2">
            {domains.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">{d.domain}</span>
                  {d.label && <Badge variant="secondary" className="text-xs">{d.label}</Badge>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => deleteDomain(d.id)} className="text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nog geen domeinen toegevoegd.</p>
        )}

        <div className="flex items-end gap-2">
          <div className="space-y-1 flex-1">
            <Label className="text-xs">Domein</Label>
            <Input
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="bijv. moz.com"
              onKeyDown={(e) => e.key === "Enter" && addDomain()}
            />
          </div>
          <div className="space-y-1 w-40">
            <Label className="text-xs">Label (optioneel)</Label>
            <Input
              value={newDomainLabel}
              onChange={(e) => setNewDomainLabel(e.target.value)}
              placeholder="bijv. Moz Blog"
              onKeyDown={(e) => e.key === "Enter" && addDomain()}
            />
          </div>
          <Button onClick={addDomain} disabled={addingDomain || !newDomain.trim()} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Toevoegen
          </Button>
        </div>
      </div>
    </div>
  );
}
