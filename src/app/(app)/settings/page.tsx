import Link from "next/link";

const sections = [
  {
    title: "Sites",
    description: "Beheer WordPress-sites, credentials en basisconfiguratie.",
    href: "/sites",
    cta: "Open Sites",
    siteScoped: false,
  },
  {
    title: "Templates",
    description: "Stel standaard artikelstructuren in per site of cluster.",
    href: "/templates",
    cta: "Open Templates",
    siteScoped: true,
  },
  {
    title: "Bronnen",
    description: "Beheer RSS, nieuws en keyword-bronnen voor content input.",
    href: "/sources",
    cta: "Open Bronnen",
    siteScoped: true,
  },
  {
    title: "Planning",
    description: "Configureer automatische publicatiefrequenties en schema's.",
    href: "/schedule",
    cta: "Open Planning",
    siteScoped: true,
  },
  {
    title: "Indexering",
    description: "Bekijk en beheer requests voor Google Indexing.",
    href: "/indexing",
    cta: "Open Indexering",
    siteScoped: true,
  },
  {
    title: "Search Console",
    description: "Koppel Google Search Console (OAuth) voor query- en performance-data.",
    href: "/settings/search-console",
    cta: "Open Search Console",
    siteScoped: true,
  },
  {
    title: "Team & Rechten",
    description: "Voeg subgebruikers toe aan deze workspace en stel rollen in.",
    href: "/settings/team",
    cta: "Open Teambeheer",
    siteScoped: true,
  },
  {
    title: "Abonnement",
    description: "Bekijk je plan, credits en facturatie-informatie.",
    href: "/billing",
    cta: "Open Billing",
    siteScoped: false,
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
        <h1 className="text-2xl font-bold tracking-tight">Instellingen</h1>
        <p className="text-muted-foreground mt-1">
          Centrale plek voor account-, content- en publicatie-instellingen.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {sections.map((section) => (
          <div
            key={section.href}
            className="rounded-xl border bg-card p-4 shadow-sm"
          >
            <h2 className="font-semibold">{section.title}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {section.description}
            </p>
            <Link
              href={withSiteHref(section.href, section.siteScoped)}
              className="inline-flex mt-3 text-sm font-medium text-primary hover:underline"
            >
              {section.cta}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
