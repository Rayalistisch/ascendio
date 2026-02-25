"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  TIERS,
  normalizeTierId,
  formatEuro,
  type TierId,
} from "@/lib/billing";

interface Subscription {
  tier: string;
  status: string;
  credits_remaining: number | null;
  credits_monthly: number | null;
  current_period_end: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  active: "Actief",
  trialing: "Proefperiode",
  canceled: "Opgezegd",
  past_due: "Betaling achterstallig",
  incomplete: "Onvolledig",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function BillingSettingsPage() {
  const searchParams = useSearchParams();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [requestedTier, setRequestedTier] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("success") === "1") {
      setSuccessMsg("Abonnement succesvol geactiveerd. Welkom!");
    }

    fetch("/api/billing/status")
      .then((r) => r.json())
      .then((data) => setSub(data.subscription ?? null))
      .catch(() => setError("Abonnement ophalen mislukt"))
      .finally(() => setLoading(false));
  }, [searchParams]);

  async function handleUpgrade(tierId: TierId) {
    setError(null);
    setUpgrading(tierId);
    try {
      // Try Stripe checkout first
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tierId, billingInterval: "monthly" }),
      });
      const data = await res.json();

      // Stripe not yet configured → fall back to upgrade-request email
      if (res.status === 503) {
        const reqRes = await fetch("/api/billing/upgrade-request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tierId }),
        });
        if (reqRes.ok) {
          setRequestedTier(tierId);
        } else {
          const reqData = await reqRes.json().catch(() => ({}));
          setError(reqData.error || "Aanvraag versturen mislukt");
        }
        return;
      }

      if (!res.ok) {
        setError(data.error || "Checkout aanmaken mislukt");
        return;
      }
      if (data.url) window.location.href = data.url;
    } finally {
      setUpgrading(null);
    }
  }

  const normalizedTier = sub ? normalizeTierId(sub.tier) : null;
  const currentTier = normalizedTier ? TIERS.find((t) => t.id === normalizedTier) : null;
  const creditsUsed =
    sub?.credits_monthly != null && sub?.credits_remaining != null
      ? sub.credits_monthly - sub.credits_remaining
      : null;
  const creditsTotal = sub?.credits_monthly ?? currentTier?.includedCredits ?? null;
  const creditsPct =
    creditsUsed != null && creditsTotal
      ? Math.min(100, Math.round((creditsUsed / creditsTotal) * 100))
      : null;

  const upgradableTiers = TIERS.filter((t) => t.id !== normalizedTier);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Abonnement</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bekijk je huidige plan, creditgebruik en upgradeopties.
        </p>
      </div>

      {successMsg && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
          {successMsg}
        </div>
      )}

      {requestedTier && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
          <strong>Aanvraag verstuurd.</strong> We hebben je upgradeaanvraag ontvangen en nemen zo snel mogelijk contact met je op.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Current plan */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
          Huidig plan
        </p>

        {loading ? (
          <div className="mt-3 space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-3 w-full mt-4" />
          </div>
        ) : sub ? (
          <div className="mt-2 space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold">
                {currentTier?.name ?? sub.tier ?? "Onbekend"}
              </span>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                {STATUS_LABEL[sub.status] ?? sub.status}
              </span>
            </div>

            {sub.current_period_end && (
              <p className="text-sm text-muted-foreground">
                {sub.status === "trialing"
                  ? `Proefperiode loopt af op ${formatDate(sub.current_period_end)}`
                  : `Verlengt op ${formatDate(sub.current_period_end)}`}
              </p>
            )}

            {creditsTotal != null && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Credits deze periode</span>
                  <span className="tabular-nums font-medium">
                    {creditsUsed ?? 0} / {creditsTotal} gebruikt
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${creditsPct ?? 0}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {sub.credits_remaining ?? creditsTotal} credits resterend
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Geen actief abonnement gevonden.
          </p>
        )}
      </div>

      {/* Upgrade options */}
      {!loading && (
        <div>
          <p className="mb-3 text-sm font-medium">
            {normalizedTier ? "Upgraden naar" : "Kies een plan"}
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            {TIERS.map((tier) => {
              const isCurrent = tier.id === normalizedTier;
              return (
                <div
                  key={tier.id}
                  className={`rounded-xl border p-4 shadow-sm flex flex-col gap-3 ${
                    isCurrent ? "bg-accent/30 border-primary/40" : "bg-card"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{tier.name}</span>
                      {isCurrent && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                          Huidig
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-lg font-bold tabular-nums">
                      {formatEuro(tier.priceMonthly)}
                      <span className="text-sm font-normal text-muted-foreground"> / maand</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{tier.description}</p>
                  </div>

                  <ul className="space-y-1 text-xs text-muted-foreground flex-1">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-1.5">
                        <svg
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Button
                    size="sm"
                    variant={isCurrent || requestedTier === tier.id ? "outline" : "default"}
                    disabled={isCurrent || upgrading === tier.id || requestedTier === tier.id}
                    onClick={() => handleUpgrade(tier.id as TierId)}
                    className="w-full"
                  >
                    {upgrading === tier.id
                      ? "Laden..."
                      : requestedTier === tier.id
                      ? "Aanvraag verstuurd"
                      : isCurrent
                      ? "Huidig plan"
                      : "Upgraden"}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
