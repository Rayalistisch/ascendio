"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutDashboard,
  Settings,
  Globe,
  CalendarClock,
  Braces,
  History,
  Rss,
  PenTool,
  ScanSearch,
  Search,
  Network,
  FileText,
  ChevronUp,
  CreditCard,
  LogOut,
  UserCog,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { User } from "@supabase/supabase-js";
import { NativeSelect } from "@/components/ui/select";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, siteScoped: true },
  { name: "Instellingen", href: "/settings", icon: Settings, siteScoped: true },
  { name: "Sites", href: "/sites", icon: Globe, siteScoped: false },
  { name: "Planning", href: "/schedule", icon: CalendarClock, siteScoped: true },
  { name: "Schema Audit", href: "/schema", icon: Braces, siteScoped: true },
  { name: "Runs", href: "/runs", icon: History, siteScoped: true },
  { name: "Bronnen", href: "/sources", icon: Rss, siteScoped: true },
  { name: "Clusters", href: "/clusters", icon: Network, siteScoped: true },
  { name: "Templates", href: "/templates", icon: FileText, siteScoped: true },
  { name: "SEO Editor", href: "/seo-editor", icon: PenTool, siteScoped: true },
  { name: "Scanner", href: "/scanner", icon: ScanSearch, siteScoped: true },
  { name: "Indexering", href: "/indexing", icon: Search, siteScoped: true },
];

interface SiteSummary {
  id: string;
  name: string;
}

export function AppShell({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [sitesLoading, setSitesLoading] = useState(true);
  const [fallbackSiteId, setFallbackSiteId] = useState("");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const searchParamsString = searchParams.toString();
  const urlSiteId = searchParams.get("siteId") || "";
  const activeSiteId = urlSiteId || fallbackSiteId;

  const userMetadata =
    user.user_metadata && typeof user.user_metadata === "object"
      ? (user.user_metadata as Record<string, unknown>)
      : {};
  const userDisplayName =
    (typeof userMetadata.full_name === "string" ? userMetadata.full_name : "") ||
    user.email?.split("@")[0] ||
    "Gebruiker";
  const userAvatarUrl =
    typeof userMetadata.avatar_url === "string" ? userMetadata.avatar_url : "";
  const userInitials = userDisplayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "U";

  function isSiteScopedPath(path: string): boolean {
    return navigation.some(
      (item) =>
        item.siteScoped &&
        (path === item.href || path.startsWith(`${item.href}/`))
    );
  }

  const activeSiteName = useMemo(() => {
    if (!activeSiteId) return null;
    return sites.find((site) => site.id === activeSiteId)?.name || null;
  }, [activeSiteId, sites]);

  function buildNavHref(href: string, siteScoped: boolean): string {
    if (!siteScoped || !activeSiteId) return href;
    return `${href}?siteId=${encodeURIComponent(activeSiteId)}`;
  }

  useEffect(() => {
    let cancelled = false;
    async function loadSites() {
      setSitesLoading(true);
      try {
        const res = await fetch("/api/sites");
        const data = await res.json();
        if (cancelled) return;
        setSites(Array.isArray(data.sites) ? data.sites : []);
      } catch {
        if (!cancelled) setSites([]);
      } finally {
        if (!cancelled) setSitesLoading(false);
      }
    }
    loadSites();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (sitesLoading) return;
    const validIds = new Set(sites.map((site) => site.id));

    if (urlSiteId && validIds.has(urlSiteId)) {
      setFallbackSiteId(urlSiteId);
      window.localStorage.setItem("asc_active_site_id", urlSiteId);
      return;
    }

    const storedSiteId = window.localStorage.getItem("asc_active_site_id");
    const candidate =
      (storedSiteId && validIds.has(storedSiteId) ? storedSiteId : "") ||
      sites[0]?.id ||
      "";

    setFallbackSiteId(candidate);

    if (!candidate) return;
    window.localStorage.setItem("asc_active_site_id", candidate);

    if (!urlSiteId && isSiteScopedPath(pathname)) {
      const params = new URLSearchParams(searchParamsString);
      params.set("siteId", candidate);
      router.replace(`${pathname}?${params.toString()}`);
    }
  }, [pathname, router, searchParamsString, sites, sitesLoading, urlSiteId]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!accountMenuRef.current) return;
      if (!accountMenuRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountMenuOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  useEffect(() => {
    setAccountMenuOpen(false);
  }, [pathname, searchParamsString]);

  function handleWorkspaceChange(nextSiteId: string) {
    if (!nextSiteId || nextSiteId === "__none__") return;
    setFallbackSiteId(nextSiteId);
    window.localStorage.setItem("asc_active_site_id", nextSiteId);

    if (isSiteScopedPath(pathname)) {
      const params = new URLSearchParams(searchParamsString);
      params.set("siteId", nextSiteId);
      router.push(`${pathname}?${params.toString()}`);
    }
  }

  async function handleSignOut() {
    window.location.href = "/api/auth/signout";
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-border bg-sidebar-background">
        <div className="flex h-14 items-center border-b border-border px-6">
          <Link
            href={buildNavHref("/dashboard", true)}
            className="inline-flex items-center"
          >
            <Image
              src="/logo.svg"
              alt="Ascendio"
              width={40}
              height={40}
              className="h-37 w-37"
              priority
            />
            <span className="sr-only">Ascendio</span>
          </Link>
        </div>

        <div className="space-y-1 border-b border-border px-3 py-3">
          <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Workspace
          </p>
          <NativeSelect
            value={activeSiteId || "__none__"}
            onChange={(e) => handleWorkspaceChange(e.target.value)}
            disabled={sitesLoading || sites.length === 0}
            className="h-8 text-xs"
          >
            {sites.length === 0 ? (
              <option value="__none__">Geen sites</option>
            ) : (
              sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))
            )}
          </NativeSelect>
          {activeSiteName && (
            <p className="truncate px-1 text-xs text-muted-foreground">
              Actief: {activeSiteName}
            </p>
          )}
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigation.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={buildNavHref(item.href, item.siteScoped)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-4">
          <div className="relative" ref={accountMenuRef}>
            <button
              type="button"
              onClick={() => setAccountMenuOpen((open) => !open)}
              className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-background px-2 py-2 text-left transition-colors hover:bg-accent/40"
            >
              {userAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={userAvatarUrl}
                  alt={userDisplayName}
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-[11px] font-semibold text-sidebar-accent-foreground">
                  {userInitials}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">
                  {userDisplayName}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {user.email}
                </p>
              </div>

              <ChevronUp
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  accountMenuOpen ? "rotate-0" : "rotate-180"
                )}
              />
            </button>

            {accountMenuOpen && (
              <div className="absolute bottom-12 left-0 right-0 z-40 rounded-xl border bg-background p-2 shadow-lg">
                <Link
                  href={buildNavHref("/settings", true)}
                  className="flex items-center gap-2 rounded-md px-2 py-2 text-xs font-medium text-foreground hover:bg-accent"
                >
                  <UserCog className="h-4 w-4" />
                  Instellingen
                </Link>
                <Link
                  href={buildNavHref("/settings/team", true)}
                  className="mt-1 flex items-center gap-2 rounded-md px-2 py-2 text-xs font-medium text-foreground hover:bg-accent"
                >
                  <Users className="h-4 w-4" />
                  Team & Rechten
                </Link>
                <Link
                  href="/billing"
                  className="mt-1 flex items-center gap-2 rounded-md px-2 py-2 text-xs font-medium text-foreground hover:bg-accent"
                >
                  <CreditCard className="h-4 w-4" />
                  Abonnement
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs font-medium text-foreground hover:bg-accent"
                >
                  <LogOut className="h-4 w-4" />
                  Uitloggen
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-60 flex-1">
        <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
