"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { NativeSelect } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Palette, RefreshCw, Trash2, ExternalLink, Link2, Type } from "lucide-react";

interface ToneOfVoice {
  tone?: string;
  targetAudience?: string;
  brandGuidelines?: string;
  avoidWords?: string[];
  exampleSentences?: string[];
}
interface BrandIdentity {
  id: string;
  name: string;
  website_url: string | null;
  language: string | null;
  business_name: string | null;
  tagline: string | null;
  description: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  logo_url: string | null;
  heading_font: string | null;
  body_font: string | null;
  tone_of_voice: ToneOfVoice | null;
  scan_status: string;
  scanned_pages: string[];
  updated_at: string;
}
interface Site {
  id: string;
  name: string;
}

function Swatch({ color, label }: { color: string | null; label: string }) {
  return (
    <div className="space-y-1">
      <div
        className="h-12 w-full rounded-md border flex items-center justify-center text-xs"
        style={color ? { backgroundColor: color } : undefined}
      >
        {!color && <span className="text-muted-foreground">geen</span>}
      </div>
      <p className="text-xs text-muted-foreground">
        {label} {color && <span className="font-mono">{color}</span>}
      </p>
    </div>
  );
}

export default function BrandIdentitiesPage() {
  const [items, setItems] = useState<BrandIdentity[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [scanUrl, setScanUrl] = useState("");
  const [creating, setCreating] = useState(false);

  const [scanningId, setScanningId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [applySiteId, setApplySiteId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [biRes, siteRes] = await Promise.all([
        fetch("/api/brand-identities"),
        fetch("/api/sites"),
      ]);
      const bi = await biRes.json();
      const st = await siteRes.json();
      setItems(bi.brandIdentities ?? []);
      setSites(st.sites ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    if (!scanUrl.trim() && !newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/brand-identities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName || undefined, scanUrl: scanUrl || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error === "insufficient_credits" ? "Niet genoeg credits" : data.error || "Aanmaken mislukt");
        return;
      }
      window.dispatchEvent(new Event("credits-updated"));
      setDialogOpen(false);
      setNewName("");
      setScanUrl("");
      await load();
      setExpandedId(data.brandIdentity?.id ?? null);
    } finally {
      setCreating(false);
    }
  }

  async function rescan(id: string) {
    setScanningId(id);
    try {
      const res = await fetch(`/api/brand-identities/${id}/scan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error === "insufficient_credits" ? "Niet genoeg credits" : data.error || "Scan mislukt");
        return;
      }
      window.dispatchEvent(new Event("credits-updated"));
      await load();
    } finally {
      setScanningId(null);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Merkidentiteit verwijderen?")) return;
    await fetch(`/api/brand-identities/${id}`, { method: "DELETE" });
    if (expandedId === id) setExpandedId(null);
    await load();
  }

  async function apply(id: string) {
    if (!applySiteId) return;
    setApplyingId(id);
    try {
      const res = await fetch(`/api/brand-identities/${id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: applySiteId }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error || "Koppelen mislukt");
        return;
      }
      window.alert(
        data.appliedVoice
          ? "Gekoppeld — de merkstem is toegepast op de tone of voice van de site."
          : "Gekoppeld aan de site."
      );
      setApplySiteId("");
    } finally {
      setApplyingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Merkidentiteiten</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Herbruikbare merkstemmen en visuele identiteit. Bouw er één met de hand of scan een
            website om naam, tagline, kleuren, logo, fonts en merkstem automatisch op te halen.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90">
            Nieuwe merkidentiteit
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Merkidentiteit aanmaken</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Website scannen <span className="text-muted-foreground font-normal">(aanbevolen)</span></Label>
                <Input
                  value={scanUrl}
                  onChange={(e) => setScanUrl(e.target.value)}
                  placeholder="https://voorbeeld.nl"
                />
                <p className="text-xs text-muted-foreground">
                  Haalt kleuren, logo, fonts en merkstem automatisch op (2 credits).
                </p>
              </div>
              <div className="space-y-2">
                <Label>Naam <span className="text-muted-foreground font-normal">(optioneel)</span></Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Wordt anders overgenomen uit de scan"
                />
              </div>
              <Button onClick={create} disabled={creating || (!scanUrl.trim() && !newName.trim())} className="w-full">
                {creating ? "Bezig…" : scanUrl.trim() ? "Scannen & aanmaken" : "Leeg aanmaken"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed p-12">
          <p className="text-muted-foreground text-sm">
            Nog geen merkidentiteiten. Scan een website om te beginnen.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((b) => (
            <div key={b.id} className="rounded-xl border bg-card shadow-sm">
              <button
                type="button"
                onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}
                className="w-full p-4 text-left"
              >
                <div className="flex items-center gap-2">
                  <Palette className="h-4 w-4 shrink-0" />
                  <span className="font-semibold truncate">{b.name}</span>
                  {b.language && <Badge variant="outline" className="text-xs">{b.language}</Badge>}
                </div>
                {b.tagline && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{b.tagline}</p>}
                <div className="flex items-center gap-1.5 mt-2">
                  {[b.primary_color, b.secondary_color, b.accent_color].filter(Boolean).map((c, i) => (
                    <span key={i} className="h-5 w-5 rounded-full border" style={{ backgroundColor: c as string }} />
                  ))}
                </div>
                {b.tone_of_voice?.tone && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                    <span className="font-medium">Merkstem: </span>{b.tone_of_voice.tone}
                  </p>
                )}
                {b.website_url && (
                  <p className="text-xs text-muted-foreground mt-2 truncate">{b.website_url}</p>
                )}
              </button>

              {expandedId === b.id && (
                <div className="border-t px-4 py-4 space-y-4">
                  {/* Visual */}
                  <div className="grid grid-cols-3 gap-2">
                    <Swatch color={b.primary_color} label="Primair" />
                    <Swatch color={b.secondary_color} label="Secundair" />
                    <Swatch color={b.accent_color} label="Accent" />
                  </div>

                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Type className="h-3 w-3" /> Heading: {b.heading_font ?? "—"}</span>
                    <span className="flex items-center gap-1"><Type className="h-3 w-3" /> Body: {b.body_font ?? "—"}</span>
                  </div>

                  {b.logo_url && (
                    <div className="text-xs">
                      <span className="text-muted-foreground">Logo: </span>
                      <a href={b.logo_url} target="_blank" rel="noopener noreferrer" className="text-primary underline break-all">{b.logo_url}</a>
                    </div>
                  )}

                  {/* Voice */}
                  {b.tone_of_voice && (
                    <div className="rounded-lg border bg-muted/20 p-3 space-y-1 text-xs">
                      {b.tone_of_voice.tone && <p><span className="font-medium">Toon: </span>{b.tone_of_voice.tone}</p>}
                      {b.tone_of_voice.targetAudience && <p><span className="font-medium">Doelgroep: </span>{b.tone_of_voice.targetAudience}</p>}
                      {b.tone_of_voice.brandGuidelines && <p><span className="font-medium">Richtlijnen: </span>{b.tone_of_voice.brandGuidelines}</p>}
                    </div>
                  )}

                  {/* Link to site */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Koppel aan site (past merkstem toe)</Label>
                    <div className="flex items-center gap-2">
                      <NativeSelect value={applySiteId} onChange={(e) => setApplySiteId(e.target.value)} className="flex-1" disabled={sites.length === 0}>
                        <option value="">Kies een site…</option>
                        {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </NativeSelect>
                      <Button size="sm" onClick={() => apply(b.id)} disabled={!applySiteId || applyingId === b.id}>
                        <Link2 className="h-4 w-4 mr-1" /> {applyingId === b.id ? "Koppelen…" : "Koppel"}
                      </Button>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 border-t pt-3">
                    {b.website_url && (
                      <Button size="sm" variant="outline" onClick={() => rescan(b.id)} disabled={scanningId === b.id}>
                        <RefreshCw className={`h-4 w-4 mr-1 ${scanningId === b.id ? "animate-spin" : ""}`} />
                        {scanningId === b.id ? "Scannen…" : "Opnieuw scannen"}
                      </Button>
                    )}
                    {b.website_url && (
                      <a href={b.website_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center rounded-md border px-3 text-sm hover:bg-accent">
                        <ExternalLink className="h-4 w-4 mr-1" /> Website
                      </a>
                    )}
                    <Button size="sm" variant="ghost" className="text-destructive ml-auto" onClick={() => remove(b.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
