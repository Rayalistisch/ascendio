"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Overzicht", href: "/settings", exact: true },
  { label: "Search Console", href: "/settings/search-console", exact: false },
  { label: "Team & Rechten", href: "/settings/team", exact: false },
];

const ACCOUNT_ITEMS = [
  { label: "Abonnement", href: "/settings/billing", exact: false },
];

export function SettingsNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const siteId = searchParams.get("siteId");

  function withSite(href: string) {
    return siteId ? `${href}?siteId=${encodeURIComponent(siteId)}` : href;
  }

  return (
    <nav className="flex flex-col gap-0.5">
      <p className="px-3 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
        Instellingen
      </p>

      {NAV_ITEMS.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={withSite(item.href)}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        );
      })}

      <div className="my-2 border-t" />

      <p className="px-3 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
        Account
      </p>

      {ACCOUNT_ITEMS.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={withSite(item.href)}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
