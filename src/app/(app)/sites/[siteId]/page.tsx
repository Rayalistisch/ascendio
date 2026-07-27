"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Plus } from "lucide-react";

interface ToneOfVoice {
  tone?: string;
  targetAudience?: string;
  avoidWords?: string[];
  exampleSentences?: string[];
  brandGuidelines?: string;
}

interface SiteInfo {
  id: string;
  name: string;
  wp_base_url: string;
  wp_username: string;
  status: string;
  default_language: string;
  tone_of_voice: ToneOfVoice | null;
  acf_content_fields: string | null;
  sitemap_url: string | null;
  is_elementor_site: boolean;
  publish_as_draft: boolean;
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

  // ACF
  const [acfContentFields, setAcfContentFields] = useState("");
  const [savingAcf, setSavingAcf] = useState(false);
  const [acfSaved, setAcfSaved] = useState(false);

  // Sitemap
  const [sitemapUrl, setSitemapUrl] = useState("");
  const [savingSitemap, setSavingSitemap] = useState(false);
  const [sitemapSaved, setSitemapSaved] = useState(false);

  // Elementor
  const [isElementorSite, setIsElementorSite] = useState(false);
  const [savingElementor, setSavingElementor] = useState(false);
  const [elementorSaved, setElementorSaved] = useState(false);

  // WordPress-verbinding
  const [wpBaseUrl, setWpBaseUrl] = useState("");
  const [wpUsername, setWpUsername] = useState("");
  const [wpAppPassword, setWpAppPassword] = useState("");
  const [savingWp, setSavingWp] = useState(false);
  const [wpSaved, setWpSaved] = useState(false);
  const [testingWp, setTestingWp] = useState(false);
  const [wpTestResult, setWpTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Cache & synchronisatie
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Concept-modus (publiceren als draft)
  const [publishAsDraft, setPublishAsDraft] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);

  // Tone of voice
  const [tone, setTone] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [avoidWords, setAvoidWords] = useState("");
  const [exampleSentences, setExampleSentences] = useState("");
  const [brandGuidelines, setBrandGuidelines] = useState("");
  const [savingTone, setSavingTone] = useState(false);
  const [toneSaved, setToneSaved] = useState(false);
  const [analyzingStyle, setAnalyzingStyle] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSite() {
      try {
        const res = await fetch("/api/sites");
        const data = await res.json();
        const found = (data.sites ?? []).find((s: SiteInfo) => s.id === siteId);
        setSite(found || null);
        if (found?.acf_content_fields) setAcfContentFields(found.acf_content_fields);
        if (found?.sitemap_url) setSitemapUrl(found.sitemap_url);
        setIsElementorSite(found?.is_elementor_site ?? false);
        setWpBaseUrl(found?.wp_base_url ?? "");
        setWpUsername(found?.wp_username ?? "");
        setPublishAsDraft(found?.publish_as_draft ?? false);
        if (found?.tone_of_voice) {
          const tov = found.tone_of_voice;
          setTone(tov.tone || "");
          setTargetAudience(tov.targetAudience || "");
          setAvoidWords((tov.avoidWords || []).join(", "));
          setExampleSentences((tov.exampleSentences || []).join("\n"));
          setBrandGuidelines(tov.brandGuidelines || "");
        }
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

  async function analyzeStyle() {
    setAnalyzingStyle(true);
    setAnalyzeError(null);
    try {
      const res = await fetch("/api/sites/analyze-style", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAnalyzeError(data.error || "Analyse mislukt");
        return;
      }
      if (data.tone) setTone(data.tone);
      if (data.targetAudience) setTargetAudience(data.targetAudience);
      if (data.avoidWords?.length) setAvoidWords(data.avoidWords.join(", "));
      if (data.exampleSentences?.length) setExampleSentences(data.exampleSentences.join("\n"));
      if (data.brandGuidelines) setBrandGuidelines(data.brandGuidelines);
    } catch {
      setAnalyzeError("Er ging iets mis bij de analyse");
    } finally {
      setAnalyzingStyle(false);
    }
  }

  async function saveAcfFields() {
    setSavingAcf(true);
    setAcfSaved(false);
    try {
      const res = await fetch("/api/sites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: siteId, acfContentFields: acfContentFields.trim() || null }),
      });
      if (res.ok) {
        setAcfSaved(true);
        setTimeout(() => setAcfSaved(false), 3000);
      }
    } finally {
      setSavingAcf(false);
    }
  }

  async function saveSitemapUrl() {
    setSavingSitemap(true);
    setSitemapSaved(false);
    try {
      const res = await fetch("/api/sites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: siteId, sitemapUrl: sitemapUrl.trim() || null }),
      });
      if (res.ok) {
        setSitemapSaved(true);
        setTimeout(() => setSitemapSaved(false), 3000);
      }
    } finally {
      setSavingSitemap(false);
    }

  }

  async function saveElementorSetting(value: boolean) {
    setSavingElementor(true);
    setElementorSaved(false);
    try {
      const res = await fetch("/api/sites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: siteId, isElementorSite: value }),
      });
      if (res.ok) {
        setIsElementorSite(value);
        setElementorSaved(true);
        setTimeout(() => setElementorSaved(false), 3000);
      }
    } finally {
      setSavingElementor(false);
    }
  }

  async function testWpConnection() {
    setTestingWp(true);
    setWpTestResult(null);
    try {
      const res = await fetch("/api/sites/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "wordpress", wpBaseUrl, wpUsername, wpAppPassword }),
      });
      const data = await res.json();
      setWpTestResult(
        data.success
          ? { ok: true, message: "Verbinding gelukt ✓" }
          : { ok: false, message: data.error || "Verbinding mislukt" }
      );
    } catch {
      setWpTestResult({ ok: false, message: "Kon de verbinding niet testen" });
    } finally {
      setTestingWp(false);
    }
  }

  async function saveWpConnection() {
    setSavingWp(true);
    setWpSaved(false);
    try {
      const res = await fetch("/api/sites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: siteId,
          wpBaseUrl,
          wpUsername,
          // Alleen meesturen als ingevuld — leeg = huidige wachtwoord behouden.
          ...(wpAppPassword.trim() ? { wpAppPassword } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.site) setSite(data.site);
        setWpAppPassword("");
        setWpSaved(true);
        setTimeout(() => setWpSaved(false), 3000);
      } else {
        window.alert(data.error || "Opslaan mislukt");
      }
    } finally {
      setSavingWp(false);
    }
  }

  async function savePublishAsDraft(value: boolean) {
    setSavingDraft(true);
    setDraftSaved(false);
    try {
      const res = await fetch("/api/sites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: siteId, publishAsDraft: value }),
      });
      if (res.ok) {
        setPublishAsDraft(value);
        setDraftSaved(true);
        setTimeout(() => setDraftSaved(false), 3000);
      }
    } finally {
      setSavingDraft(false);
    }
  }

  async function resync(clearCache: boolean) {
    if (
      clearCache &&
      !window.confirm(
        "Cache legen en opnieuw synchroniseren? Alle gecachte posts, embeddings (link-graaf) en sitemap-URL's voor deze site worden verwijderd en opnieuw opgehaald uit WordPress."
      )
    ) {
      return;
    }
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/wp-posts/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, clearCache }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error || "Synchroniseren mislukt");
        return;
      }
      setSyncMessage(
        `${data.synced} van ${data.total} posts gesynchroniseerd${data.cleared ? " (cache geleegd)" : ""}.`
      );
    } finally {
      setSyncing(false);
    }
  }

  async function saveToneOfVoice() {
    setSavingTone(true);
    setToneSaved(false);
    try {
      const hasContent = tone || targetAudience || avoidWords || exampleSentences || brandGuidelines;
      const toneOfVoice = hasContent
        ? {
            tone,
            targetAudience,
            avoidWords: avoidWords.split(",").map((w) => w.trim()).filter(Boolean),
            exampleSentences: exampleSentences.split("\n").map((s) => s.trim()).filter(Boolean),
            brandGuidelines,
          }
        : null;
      const res = await fetch("/api/sites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: siteId, toneOfVoice }),
      });
      if (res.ok) {
        setToneSaved(true);
        setTimeout(() => setToneSaved(false), 3000);
      }
    } finally {
      setSavingTone(false);
    }
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

      {/* WordPress-verbinding */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <h2 className="font-semibold">WordPress-verbinding</h2>
        <p className="text-sm text-muted-foreground">
          Werk de URL, gebruikersnaam of het app-wachtwoord bij als de site is verhuisd of het
          wachtwoord is vernieuwd. Historie en instellingen blijven behouden.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">WordPress URL</Label>
            <Input
              value={wpBaseUrl}
              onChange={(e) => setWpBaseUrl(e.target.value)}
              placeholder="https://coddin.nl"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Gebruikersnaam</Label>
            <Input value={wpUsername} onChange={(e) => setWpUsername(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Applicatie-wachtwoord</Label>
          <Input
            type="password"
            value={wpAppPassword}
            onChange={(e) => setWpAppPassword(e.target.value)}
            placeholder="Laat leeg om het huidige wachtwoord te behouden"
            autoComplete="new-password"
          />
          <p className="text-xs text-muted-foreground">
            Aan te maken in WordPress onder Gebruikers → Profiel → Applicatiewachtwoorden.
          </p>
        </div>
        {wpTestResult && (
          <p className={`text-xs ${wpTestResult.ok ? "text-green-600" : "text-destructive"}`}>
            {wpTestResult.message}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button onClick={saveWpConnection} disabled={savingWp} size="sm">
            {savingWp ? "Opslaan..." : wpSaved ? "Opgeslagen ✓" : "Verbinding opslaan"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={testWpConnection}
            disabled={testingWp || !wpAppPassword.trim()}
            title={!wpAppPassword.trim() ? "Vul een app-wachtwoord in om te testen" : undefined}
          >
            {testingWp ? "Testen..." : "Test verbinding"}
          </Button>
        </div>
      </div>

      {/* Cache & synchronisatie */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <h2 className="font-semibold">Cache &amp; synchronisatie</h2>
        <p className="text-sm text-muted-foreground">
          Ascendio houdt een lokale kopie bij van je WordPress-posts (voor interne links, de
          SEO-editor en de link-graaf). Is de site verhuisd of vervangen? Leeg de cache en haal
          alles opnieuw op.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => resync(false)} disabled={syncing}>
            {syncing ? "Bezig..." : "Opnieuw synchroniseren"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive"
            onClick={() => resync(true)}
            disabled={syncing}
          >
            Cache legen &amp; opnieuw synchroniseren
          </Button>
        </div>
        {syncMessage && <p className="text-xs text-muted-foreground">{syncMessage}</p>}
        <p className="text-xs text-muted-foreground">
          Na het legen: bouw de link-graaf opnieuw op via Optimaliseren → Link-graaf.
        </p>
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

      {/* ACF content velden */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div>
          <h2 className="font-semibold">ACF content velden</h2>
          <p className="text-sm text-muted-foreground">
            Gebruikt deze site Advanced Custom Fields (ACF) voor de hoofdtekst? Vul hier de veldnamen in (kommagescheiden). Ascendio leest en schrijft dan via die velden i.p.v. de standaard WordPress content.
          </p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">ACF veldnamen (kommagescheiden)</Label>
          <Input
            value={acfContentFields}
            onChange={(e) => setAcfContentFields(e.target.value)}
            placeholder="bijv. solution_inner_info, solution_inner_info1"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={saveAcfFields} disabled={savingAcf} size="sm">
            {savingAcf ? "Opslaan..." : "ACF velden opslaan"}
          </Button>
          {acfSaved && <span className="text-sm text-green-600">Opgeslagen!</span>}
        </div>
      </div>

      {/* Sitemap URL */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div>
          <h2 className="font-semibold">Sitemap URL</h2>
          <p className="text-sm text-muted-foreground">
            Laat leeg om de sitemap automatisch te detecteren. Vul een specifieke URL in als je site een afwijkende sitemap-structuur heeft, bijv. <code className="text-xs bg-muted px-1 rounded">https://jouwsite.nl/post-sitemap.xml</code>.
          </p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Sitemap URL (optioneel)</Label>
          <Input
            value={sitemapUrl}
            onChange={(e) => setSitemapUrl(e.target.value)}
            placeholder="https://jouwsite.nl/post-sitemap.xml"
            type="url"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={saveSitemapUrl} disabled={savingSitemap} size="sm">
            {savingSitemap ? "Opslaan..." : "Sitemap URL opslaan"}
          </Button>
          {sitemapSaved && <span className="text-sm text-green-600">Opgeslagen!</span>}
        </div>
      </div>

      {/* Elementor */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div>
          <h2 className="font-semibold">Elementor</h2>
          <p className="text-sm text-muted-foreground">
            Zet dit aan als deze site Elementor gebruikt. Ascendio schrijft dan content terug naar de Elementor text-widget in plaats van post_content — zodat de opmaak intact blijft.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={isElementorSite}
            disabled={savingElementor}
            onClick={() => saveElementorSetting(!isElementorSite)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${isElementorSite ? "bg-primary" : "bg-input"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isElementorSite ? "translate-x-6" : "translate-x-1"}`} />
          </button>
          <span className="text-sm">{isElementorSite ? "Elementor ingeschakeld" : "Elementor uitgeschakeld"}</span>
          {elementorSaved && <span className="text-sm text-green-600">Opgeslagen!</span>}
        </div>
      </div>

      {/* Concept-modus */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div>
          <h2 className="font-semibold">Concept-modus</h2>
          <p className="text-sm text-muted-foreground">
            Zet dit aan om content eerst als <strong>concept</strong> in WordPress te plaatsen (nog
            niet live). Je bekijkt de pagina bij Runs en publiceert hem daar met één klik zodra hij
            goed is.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={publishAsDraft}
            disabled={savingDraft}
            onClick={() => savePublishAsDraft(!publishAsDraft)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${publishAsDraft ? "bg-primary" : "bg-input"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${publishAsDraft ? "translate-x-6" : "translate-x-1"}`} />
          </button>
          <span className="text-sm">
            {publishAsDraft ? "Eerst als concept plaatsen" : "Direct publiceren"}
          </span>
          {draftSaved && <span className="text-sm text-green-600">Opgeslagen!</span>}
        </div>
      </div>

      {/* Tone of Voice / Knowledge Base */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Schrijfstijl & Tone of Voice</h2>
            <p className="text-sm text-muted-foreground">
              Configureer de schrijfstijl die de AI gebruikt bij het genereren en herschrijven van content voor deze site.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={analyzeStyle}
            disabled={analyzingStyle}
            className="shrink-0"
          >
            {analyzingStyle ? "Analyseren…" : "Analyseer bestaande content"}
          </Button>
        </div>

        {analyzeError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {analyzeError}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">Tone of Voice</Label>
            <Input
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              placeholder="bijv. Professioneel maar toegankelijk, met een vleugje humor"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Doelgroep</Label>
            <Input
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              placeholder="bijv. MKB-ondernemers, 30-55 jaar, technisch onderlegd"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Vermijd deze woorden (kommagescheiden)</Label>
            <Input
              value={avoidWords}
              onChange={(e) => setAvoidWords(e.target.value)}
              placeholder="bijv. klik hier, uniek, snel, gratis"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Voorbeeldzinnen (een per regel)</Label>
            <Textarea
              value={exampleSentences}
              onChange={(e) => setExampleSentences(e.target.value)}
              placeholder="Schrijf 1-5 voorbeeldzinnen in de gewenste stijl..."
              rows={4}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Merkrichtlijnen</Label>
            <Textarea
              value={brandGuidelines}
              onChange={(e) => setBrandGuidelines(e.target.value)}
              placeholder="bijv. Gebruik altijd 'u' in plaats van 'je'. Verwijs naar ons bedrijf als 'Team X'. Vermijd passieve zinnen."
              rows={3}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={saveToneOfVoice} disabled={savingTone} size="sm">
              {savingTone ? "Opslaan..." : "Schrijfstijl opslaan"}
            </Button>
            {toneSaved && (
              <span className="text-sm text-green-600">Opgeslagen!</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
