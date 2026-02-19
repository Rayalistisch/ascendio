import { Badge } from "@/components/ui/badge";

const ISSUE_LABELS: Record<string, string> = {
  missing_alt: "Ontbrekende alt-tekst",
  heading_hierarchy: "Heading structuur",
  thin_content: "Dunne content",
  missing_meta_description: "Geen meta-beschrijving",
  missing_meta_title: "Geen meta-titel",
  missing_schema: "Geen schema markup",
  low_internal_links: "Weinig interne links",
  plagiarism_risk: "Plagiaat-risico",
  duplicate_content: "Dubbele content",
  broken_links: "Kapotte links",
};

export function IssueTypeBadge({ type, severity }: { type: string; severity: string }) {
  const label = ISSUE_LABELS[type] || type;

  if (severity === "critical") return <Badge variant="destructive">{label}</Badge>;
  if (severity === "warning") return <Badge className="bg-yellow-500 text-white">{label}</Badge>;
  return <Badge variant="secondary">{label}</Badge>;
}
