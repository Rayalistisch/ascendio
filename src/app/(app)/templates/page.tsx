"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ChevronUp, ChevronDown, Plus, Trash2 } from "lucide-react";

interface Site {
  id: string;
  name: string;
}

// All available section types for SEO/GEO optimized content
const SECTION_TYPES = {
  h2: { label: "H2 Heading", badge: "H2", color: "secondary" as const },
  h3: { label: "H3 Subheading", badge: "H3", color: "outline" as const },
  paragraph: { label: "Paragraaf", badge: "P", color: "outline" as const },
  bullets: { label: "Bullet lijst", badge: "UL", color: "outline" as const },
  numbered: { label: "Genummerde lijst", badge: "OL", color: "outline" as const },
  faq: { label: "FAQ Sectie", badge: "FAQ", color: "secondary" as const },
  table: { label: "Vergelijkingstabel", badge: "TABLE", color: "outline" as const },
  top5: { label: "Top 5 Lijst", badge: "TOP 5", color: "secondary" as const },
  top10: { label: "Top 10 Lijst", badge: "TOP 10", color: "secondary" as const },
  blockquote: { label: "Key Takeaway", badge: "QUOTE", color: "outline" as const },
  stats: { label: "Statistieken / Data", badge: "STATS", color: "outline" as const },
  pros_cons: { label: "Voordelen / Nadelen", badge: "PRO/CON", color: "secondary" as const },
  cta: { label: "Call-to-Action", badge: "CTA", color: "outline" as const },
  tldr: { label: "TL;DR Samenvatting", badge: "TL;DR", color: "secondary" as const },
  image: { label: "Afbeelding placeholder", badge: "IMG", color: "outline" as const },
  video: { label: "Video embed", badge: "VIDEO", color: "outline" as const },
} as const;

type SectionType = keyof typeof SECTION_TYPES;

interface TemplateSection {
  type: SectionType;
  label: string;
  instruction: string;
}

interface ArticleTemplate {
  id: string;
  site_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  structure: TemplateSection[];
  created_at: string;
}

function createEmptySection(type: SectionType = "h2"): TemplateSection {
  const defaults: Partial<Record<SectionType, string>> = {
    h2: "",
    h3: "",
    paragraph: "Schrijf een uitgebreide paragraaf over dit onderwerp.",
    bullets: "Geef een opsomming met de belangrijkste punten.",
    numbered: "Geef een genummerde stapsgewijze uitleg.",
    faq: "Schrijf 3-5 veelgestelde vragen met beknopte antwoorden.",
    table: "Maak een vergelijkingstabel met de belangrijkste kenmerken.",
    top5: "Schrijf een top 5 lijst met uitleg per item.",
    top10: "Schrijf een top 10 lijst met uitleg per item.",
    blockquote: "Geef een key takeaway of expert quote.",
    stats: "Voeg relevante statistieken en data toe met bronvermelding.",
    pros_cons: "Geef een overzicht van voordelen en nadelen.",
    cta: "Schrijf een overtuigende call-to-action.",
    tldr: "Geef een beknopte samenvatting (TL;DR) van het artikel.",
    image: "Voeg hier een relevante afbeelding toe.",
    video: "Embed hier een relevante YouTube video.",
  };
  return { type, label: "", instruction: defaults[type] ?? "" };
}

// Preset templates for quick start
const PRESETS: { name: string; sections: TemplateSection[] }[] = [
  {
    name: "SEO Blog (2026 Best Practice)",
    sections: [
      { type: "tldr", label: "TL;DR", instruction: "Korte samenvatting van het artikel in 2-3 zinnen. Google gebruikt dit voor featured snippets." },
      { type: "h2", label: "Introductie", instruction: "Pakkende opening die het probleem schetst. Gebruik het hoofdzoekwoord in de eerste zin." },
      { type: "h2", label: "Wat is [onderwerp]?", instruction: "Duidelijke definitie en context. Geschikt voor featured snippet / AI overview." },
      { type: "h2", label: "Hoe werkt het?", instruction: "Gedetailleerde uitleg met stappen." },
      { type: "numbered", label: "Stappen", instruction: "Stapsgewijze handleiding." },
      { type: "h2", label: "Voordelen & Nadelen", instruction: "Objectieve analyse." },
      { type: "pros_cons", label: "Pro/Con overzicht", instruction: "Maak een duidelijke voordelen/nadelen lijst." },
      { type: "h2", label: "Tips & Best Practices", instruction: "Praktische tips voor de lezer." },
      { type: "bullets", label: "Tips lijst", instruction: "5-7 concrete tips." },
      { type: "table", label: "Vergelijking", instruction: "Vergelijkingstabel met alternatieven of opties." },
      { type: "faq", label: "Veelgestelde Vragen", instruction: "5 FAQ items met FAQ schema markup." },
      { type: "h2", label: "Conclusie", instruction: "Samenvatting en aanbeveling." },
      { type: "cta", label: "Call-to-Action", instruction: "Duidelijke volgende stap voor de lezer." },
    ],
  },
  {
    name: "Top 10 Listicle",
    sections: [
      { type: "h2", label: "Introductie", instruction: "Korte intro die uitlegt waarom deze top 10 relevant is." },
      { type: "top10", label: "De Top 10", instruction: "Uitgebreide top 10 lijst met per item een H3, beschrijving, voordelen en score." },
      { type: "table", label: "Overzichtstabel", instruction: "Samenvattende tabel met alle 10 items en hun scores." },
      { type: "faq", label: "Veelgestelde Vragen", instruction: "3-5 FAQ items over het onderwerp." },
      { type: "h2", label: "Conclusie", instruction: "Welke is de beste keuze en voor wie?" },
    ],
  },
  {
    name: "GEO-Optimized (AI Overview proof)",
    sections: [
      { type: "tldr", label: "Kernantwoord", instruction: "Direct antwoord op de zoekvraag in 1-2 zinnen. Dit wordt gebruikt voor AI Overviews." },
      { type: "h2", label: "Snel Overzicht", instruction: "Beknopt overzicht met de belangrijkste feiten." },
      { type: "stats", label: "Cijfers & Data", instruction: "Relevante statistieken met bronvermelding. AI systemen citeren data." },
      { type: "h2", label: "Diepgaande Analyse", instruction: "Uitgebreide expert analyse met unieke inzichten." },
      { type: "h2", label: "Praktische Toepassing", instruction: "Concrete stappen die de lezer kan ondernemen." },
      { type: "numbered", label: "Stappenplan", instruction: "Stapsgewijze instructies." },
      { type: "blockquote", label: "Expert Inzicht", instruction: "Expert quote of uniek inzicht dat autoriteit toont." },
      { type: "pros_cons", label: "Afweging", instruction: "Objectieve voordelen/nadelen analyse." },
      { type: "faq", label: "Gerelateerde Vragen", instruction: "People Also Ask vragen met uitgebreide antwoorden." },
      { type: "h2", label: "Conclusie", instruction: "Samenvattend antwoord met duidelijke aanbeveling." },
    ],
  },
];

export default function TemplatesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [templates, setTemplates] = useState<ArticleTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [sections, setSections] = useState<TemplateSection[]>([createEmptySection()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/sites")
      .then((r) => r.json())
      .then((d) => {
        const list = d.sites ?? [];
        setSites(list);
        if (list.length > 0) setSiteId(list[0].id);
      });
  }, []);

  const fetchTemplates = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/article-templates?siteId=${siteId}`);
      const data = await res.json();
      setTemplates(data.templates ?? []);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  function openCreateDialog() {
    setEditingId(null);
    setName("");
    setDescription("");
    setIsDefault(false);
    setSections([createEmptySection()]);
    setDialogOpen(true);
  }

  function loadPreset(preset: typeof PRESETS[number]) {
    setName(preset.name);
    setSections([...preset.sections]);
  }

  function openEditDialog(template: ArticleTemplate) {
    setEditingId(template.id);
    setName(template.name);
    setDescription(template.description ?? "");
    setIsDefault(template.is_default);
    setSections(template.structure.length > 0 ? template.structure : [createEmptySection()]);
    setDialogOpen(true);
  }

  async function saveTemplate() {
    setSaving(true);
    try {
      const filteredSections = sections.filter((s) => s.label.trim() || s.instruction.trim());

      const method = editingId ? "PATCH" : "POST";
      const body = editingId
        ? { id: editingId, name, description, structure: filteredSections, isDefault }
        : { siteId, name, description, structure: filteredSections, isDefault };

      const res = await fetch("/api/article-templates", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setDialogOpen(false);
        fetchTemplates();
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(id: string) {
    await fetch("/api/article-templates", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchTemplates();
  }

  // Section management
  function updateSection(index: number, field: "label" | "instruction" | "type", value: string) {
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }

  function moveSection(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= sections.length) return;
    setSections((prev) => {
      const arr = [...prev];
      [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
      return arr;
    });
  }

  function removeSection(index: number) {
    setSections((prev) => prev.filter((_, i) => i !== index));
  }

  function addSection(type: SectionType) {
    setSections((prev) => [...prev, createEmptySection(type)]);
  }

  const sectionTypeMeta = SECTION_TYPES;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Artikelstructuur</h1>
          <p className="text-muted-foreground mt-1">
            Definieer content templates met SEO/GEO best practices.
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
            <DialogTrigger
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90"
              onClick={openCreateDialog}
            >
              Template aanmaken
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? "Template bewerken" : "Nieuw template"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                {/* Presets */}
                {!editingId && (
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground">Snel starten met preset</Label>
                    <div className="flex flex-wrap gap-2">
                      {PRESETS.map((preset) => (
                        <Button key={preset.name} variant="outline" size="sm" onClick={() => loadPreset(preset)}>
                          {preset.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Naam</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bijv. SEO Blog Standaard" />
                  </div>
                  <div className="space-y-2">
                    <Label>Beschrijving</Label>
                    <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optionele beschrijving..." />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Switch checked={isDefault} onCheckedChange={setIsDefault} />
                  <Label className="text-sm">Standaard template voor deze site</Label>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Secties</Label>
                  <div className="space-y-2">
                    {sections.map((section, si) => {
                      const meta = sectionTypeMeta[section.type] || sectionTypeMeta.paragraph;
                      return (
                        <div key={si} className="rounded-lg border bg-muted/30 p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <NativeSelect
                              value={section.type}
                              onChange={(e) => updateSection(si, "type", e.target.value)}
                              className="w-40 text-xs"
                            >
                              {Object.entries(SECTION_TYPES).map(([key, val]) => (
                                <option key={key} value={key}>{val.label}</option>
                              ))}
                            </NativeSelect>
                            <Badge variant={meta.color} className="shrink-0 text-xs">{meta.badge}</Badge>
                            <Input
                              value={section.label}
                              onChange={(e) => updateSection(si, "label", e.target.value)}
                              placeholder="Sectie label (optioneel)"
                              className="flex-1"
                            />
                            <div className="flex items-center gap-0.5 shrink-0">
                              <Button variant="ghost" size="sm" onClick={() => moveSection(si, -1)} disabled={si === 0}>
                                <ChevronUp className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => moveSection(si, 1)} disabled={si === sections.length - 1}>
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => removeSection(si)} className="text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <Textarea
                            value={section.instruction}
                            onChange={(e) => updateSection(si, "instruction", e.target.value)}
                            placeholder="Instructie voor AI..."
                            rows={2}
                            className="text-sm"
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Add section buttons */}
                  <div className="flex flex-wrap gap-1.5">
                    {(["h2", "h3", "paragraph", "bullets", "faq", "table", "top5", "top10", "pros_cons", "stats", "blockquote", "tldr", "cta", "image", "video", "numbered"] as SectionType[]).map((type) => (
                      <Button
                        key={type}
                        variant="outline"
                        size="sm"
                        onClick={() => addSection(type)}
                        className="text-xs"
                      >
                        <Plus className="h-3 w-3 mr-1" /> {SECTION_TYPES[type].badge}
                      </Button>
                    ))}
                  </div>
                </div>

                <Button onClick={saveTemplate} disabled={saving || !name.trim()} className="w-full">
                  {saving ? "Opslaan..." : editingId ? "Bijwerken" : "Aanmaken"}
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
      ) : templates.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed p-12">
          <p className="text-muted-foreground text-sm">
            Nog geen templates aangemaakt voor deze site.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((template) => (
            <div key={template.id} className="rounded-xl border bg-card shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{template.name}</span>
                    {template.is_default && <Badge variant="secondary">Standaard</Badge>}
                  </div>
                  {template.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{template.description}</p>
                  )}
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    {template.structure.map((s, i) => {
                      const meta = SECTION_TYPES[s.type as SectionType] || SECTION_TYPES.paragraph;
                      return (
                        <Badge key={i} variant={meta.color} className="text-xs">
                          {meta.badge}{s.label ? `: ${s.label}` : ""}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEditDialog(template)}>
                    Bewerken
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteTemplate(template.id)} className="text-destructive">
                    Verwijderen
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
