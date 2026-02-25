"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Coins,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { tierHasFeature, getTierById, type GatedFeature } from "@/lib/billing";
import type { User } from "@supabase/supabase-js";
import { NativeSelect } from "@/components/ui/select";

const navigation: {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  siteScoped: boolean;
  gatedFeature?: GatedFeature;
}[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, siteScoped: true },
  { name: "Instellingen", href: "/settings", icon: Settings, siteScoped: true },
  { name: "Sites", href: "/sites", icon: Globe, siteScoped: false },
  { name: "Planning", href: "/schedule", icon: CalendarClock, siteScoped: true },
  { name: "Schema Audit", href: "/schema", icon: Braces, siteScoped: true },
  { name: "Runs", href: "/runs", icon: History, siteScoped: true },
  { name: "Bronnen", href: "/sources", icon: Rss, siteScoped: true },
  { name: "Clusters", href: "/clusters", icon: Network, siteScoped: true, gatedFeature: "clusters" },
  { name: "Templates", href: "/templates", icon: FileText, siteScoped: true },
  { name: "SEO Editor", href: "/seo-editor", icon: PenTool, siteScoped: true },
  { name: "Scanner", href: "/scanner", icon: ScanSearch, siteScoped: true },
  { name: "Indexering", href: "/indexing", icon: Search, siteScoped: true },
];

interface SiteSummary {
  id: string;
  name: string;
}

interface SubscriptionInfo {
  tier: string;
  status: string;
  creditsRemaining: number;
  creditsMonthly: number;
  trialEndsAt?: string | null;
}

export function AppShell({
  user,
  subscription,
  children,
}: {
  user: User;
  subscription?: SubscriptionInfo | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [sitesLoading, setSitesLoading] = useState(true);
  const [fallbackSiteId, setFallbackSiteId] = useState("");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const searchParamsString = searchParams.toString();
  const urlSiteId = searchParams.get("siteId") || "";
  const activeSiteId = urlSiteId || fallbackSiteId;

  // Live credit state — initialized from server prop, refreshed periodically
  const [credits, setCredits] = useState({
    remaining: subscription?.creditsRemaining ?? 0,
    monthly: subscription?.creditsMonthly ?? 0,
  });

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

  // Refresh credits from API
  const refreshCredits = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/status");
      const data = await res.json();
      if (data.subscription) {
        setCredits({
          remaining: data.subscription.credits_remaining ?? 0,
          monthly: data.subscription.credits_monthly ?? 0,
        });
      }
    } catch { /* ignore */ }
  }, []);

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

  // Refresh credits every 60 seconds
  useEffect(() => {
    if (!subscription) return;
    const interval = setInterval(refreshCredits, 60_000);
    return () => clearInterval(interval);
  }, [subscription, refreshCredits]);

  // Also refresh credits on page navigation
  useEffect(() => {
    if (subscription) refreshCredits();
  }, [pathname, subscription, refreshCredits]);

  // Instantly refresh credits when any action deducts them
  useEffect(() => {
    if (!subscription) return;
    const handler = () => refreshCredits();
    window.addEventListener("credits-updated", handler);
    return () => window.removeEventListener("credits-updated", handler);
  }, [subscription, refreshCredits]);

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
    setMobileMenuOpen(false);
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

  const creditPercentage = credits.monthly > 0
    ? Math.min(100, (credits.remaining / credits.monthly) * 100)
    : 0;
  const creditBarColor = creditPercentage < 20 ? "bg-red-500" : "bg-green-500";
  const tierLabel = subscription?.tier
    ? getTierById(subscription.tier)?.name ?? subscription.tier
    : null;

  const trialDaysLeft = subscription?.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(subscription.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;
  const showTrialBanner = subscription?.status === "trialing" && trialDaysLeft !== null;

  // Shared sidebar content rendered in both desktop and mobile
  const sidebarContent = (
    <>
      <div className="flex h-14 shrink-0 items-center border-b border-border px-6">
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

      <div className="shrink-0 space-y-1 border-b border-border px-3 py-3">
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

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navigation
          .filter((item) => !item.gatedFeature || tierHasFeature(subscription?.tier, item.gatedFeature))
          .map((item) => {
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

      {/* Credit bar */}
      {subscription && (
        <div className="shrink-0 border-t border-border px-4 py-3">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Coins className="h-3 w-3" />
              Credits
            </span>
            <span className="font-medium text-foreground">
              {credits.remaining} / {credits.monthly}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted">
            <div
              className={cn("h-1.5 rounded-full transition-all", creditBarColor)}
              style={{ width: `${creditPercentage}%` }}
            />
          </div>
        </div>
      )}

      <div className="shrink-0 border-t border-border p-4">
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
              {subscription && (
                <div className="mb-2 rounded-md bg-muted/10 px-2 py-2">
                  <p className="text-[12px] font-medium text-muted-foreground">
                    {tierLabel} plan
                  </p>
                  <p className="text-xs font-semibold text-foreground">
                    {credits.remaining} / {credits.monthly} credits
                  </p>
                </div>
              )}
              <Link
                href={buildNavHref("/settings", true)}
                className="flex items-center gap-2 rounded-md px-2 py-2 text-xs font-medium text-foreground hover:bg-accent"
              >
                <UserCog className="h-4 w-4" />
                Instellingen
              </Link>
              {tierHasFeature(subscription?.tier, "team") && (
                <Link
                  href={buildNavHref("/settings/team", true)}
                  className="mt-1 flex items-center gap-2 rounded-md px-2 py-2 text-xs font-medium text-foreground hover:bg-accent"
                >
                  <Users className="h-4 w-4" />
                  Team & Rechten
                </Link>
              )}
              <Link
                href="/settings/billing"
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
    </>
  );

  return (
    <div className="flex min-h-screen">
      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-sidebar-background px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileMenuOpen((o) => !o)}
          className="rounded-md p-1.5 text-foreground hover:bg-accent"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <Link href={buildNavHref("/dashboard", true)} className="inline-flex items-center">
          <Image src="/logo.svg" alt="Ascendio" width={32} height={32} className="h-8 w-8" priority />
        </Link>
        {activeSiteName && (
          <span className="truncate text-sm font-medium text-muted-foreground">{activeSiteName}</span>
        )}
        {/* Mobile credit indicator */}
        {subscription && (
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <Coins className="h-3 w-3" />
            {credits.remaining}
          </span>
        )}
      </header>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-border bg-sidebar-background transition-transform duration-200 lg:z-30 lg:translate-x-0",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Main content */}
      <main className="flex-1 pt-14 lg:ml-60 lg:pt-0">
        {showTrialBanner && (
          <div className="flex items-center justify-between gap-4 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 border-b border-amber-200">
            <span>
              <strong>Gratis trial</strong> — nog{" "}
              {trialDaysLeft === 0 ? "minder dan 1 dag" : `${trialDaysLeft} ${trialDaysLeft === 1 ? "dag" : "dagen"}`}{" "}
              en {credits.remaining} credits over.
            </span>
            <Link
              href="/settings/billing"
              className="shrink-0 rounded-full bg-amber-800 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700"
            >
              Upgrade nu
            </Link>
          </div>
        )}
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
      </main>
    </div>
  );
}
