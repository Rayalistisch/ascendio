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

interface TemplateSection {
  type: "h2";
  label: string;
  instruction: string;
  children: { type: "h3"; label: string; instruction: string }[];
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

function createEmptySection(): TemplateSection {
  return { type: "h2", label: "", instruction: "", children: [] };
}

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
      const filteredSections = sections
        .filter((s) => s.label.trim())
        .map((s) => ({
          ...s,
          children: s.children.filter((c) => c.label.trim()),
        }));

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
  function updateSection(index: number, field: keyof TemplateSection, value: string) {
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

  function addChild(sectionIndex: number) {
    setSections((prev) =>
      prev.map((s, i) =>
        i === sectionIndex
          ? { ...s, children: [...s.children, { type: "h3" as const, label: "", instruction: "" }] }
          : s
      )
    );
  }

  function updateChild(sectionIndex: number, childIndex: number, field: "label" | "instruction", value: string) {
    setSections((prev) =>
      prev.map((s, i) =>
        i === sectionIndex
          ? {
              ...s,
              children: s.children.map((c, ci) =>
                ci === childIndex ? { ...c, [field]: value } : c
              ),
            }
          : s
      )
    );
  }

  function removeChild(sectionIndex: number, childIndex: number) {
    setSections((prev) =>
      prev.map((s, i) =>
        i === sectionIndex
          ? { ...s, children: s.children.filter((_, ci) => ci !== childIndex) }
          : s
      )
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Artikelstructuur</h1>
          <p className="text-muted-foreground mt-1">
            Definieer H2/H3 templates voor artikelgeneratie.
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
                  <div className="space-y-3">
                    {sections.map((section, si) => (
                      <div key={si} className="rounded-lg border bg-muted/30 p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="shrink-0">H2</Badge>
                          <Input
                            value={section.label}
                            onChange={(e) => updateSection(si, "label", e.target.value)}
                            placeholder="Sectie titel (bijv. Introductie)"
                            className="flex-1"
                          />
                          <div className="flex items-center gap-1 shrink-0">
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
                          placeholder="Instructie voor AI (bijv. Schrijf een pakkende introductie die de lezer aanspreekt...)"
                          rows={2}
                          className="text-sm"
                        />

                        {/* H3 children */}
                        {section.children.map((child, ci) => (
                          <div key={ci} className="ml-6 flex items-start gap-2">
                            <Badge variant="outline" className="shrink-0 mt-2">H3</Badge>
                            <div className="flex-1 space-y-1">
                              <Input
                                value={child.label}
                                onChange={(e) => updateChild(si, ci, "label", e.target.value)}
                                placeholder="Subsectie titel"
                              />
                              <Textarea
                                value={child.instruction}
                                onChange={(e) => updateChild(si, ci, "instruction", e.target.value)}
                                placeholder="Instructie voor subsectie..."
                                rows={1}
                                className="text-sm"
                              />
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => removeChild(si, ci)} className="text-destructive mt-2">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}

                        <Button variant="ghost" size="sm" onClick={() => addChild(si)} className="ml-6 text-xs">
                          <Plus className="h-3 w-3 mr-1" /> H3 subsectie
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSections((prev) => [...prev, createEmptySection()])}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-1" /> H2 sectie toevoegen
                  </Button>
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
                    {template.structure.map((s, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{s.label || `Sectie ${i + 1}`}</Badge>
                    ))}
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
