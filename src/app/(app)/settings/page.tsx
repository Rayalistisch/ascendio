import Link from "next/link";

const sections = [
  {
    title: "Sites",
    description: "Beheer WordPress-sites, credentials en basisconfiguratie.",
    href: "/sites",
    siteScoped: false,
  },
  {
    title: "Templates",
    description: "Stel standaard artikelstructuren in per site of cluster.",
    href: "/templates",
    siteScoped: true,
  },
  {
    title: "Bronnen",
    description: "Beheer RSS, nieuws en keyword-bronnen voor content input.",
    href: "/sources",
    siteScoped: true,
  },
  {
    title: "Planning",
    description: "Configureer automatische publicatiefrequenties en schema's.",
    href: "/schedule",
    siteScoped: true,
  },
  {
    title: "Indexering",
    description: "Bekijk en beheer requests voor Google Indexing.",
    href: "/indexing",
    siteScoped: true,
  },
];

interface SettingsPageProps {
  searchParams: Promise<{ siteId?: string | string[] }>;
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const resolvedSearchParams = await searchParams;
  const rawSiteId = resolvedSearchParams.siteId;
  const siteId = Array.isArray(rawSiteId) ? rawSiteId[0] : rawSiteId;

  const withSiteHref = (href: string, siteScoped: boolean): string => {
    if (!siteScoped || !siteId) return href;
    return `${href}?siteId=${encodeURIComponent(siteId)}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Overzicht</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Snelle toegang tot alle module-instellingen.
        </p>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {sections.map((section, index) => (
          <Link
            key={section.href}
            href={withSiteHref(section.href, section.siteScoped)}
            className={`flex items-center justify-between px-5 py-4 hover:bg-muted/40 transition-colors ${
              index !== 0 ? "border-t" : ""
            }`}
          >
            <div>
              <p className="text-sm font-medium">{section.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>
            </div>
            <svg
              className="h-4 w-4 text-muted-foreground/50 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        ))}
      </div>
    </div>
  );
}
