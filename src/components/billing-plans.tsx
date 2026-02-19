"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import {
  formatEuro,
  getTierPriceLabel,
  getTierSecondaryPriceLabel,
  getYearlyFreeMonths,
  type BillingInterval,
  type TierDefinition,
} from "@/lib/billing";

interface BillingPlansProps {
  tiers: TierDefinition[];
  activeTierId: string | null;
  subscriptionStatus: string | null;
  initialBillingInterval?: BillingInterval;
  allowMonthlyCheckout?: boolean;
  allowYearlyCheckout?: boolean;
}

export function BillingPlans({
  tiers,
  activeTierId,
  subscriptionStatus,
  initialBillingInterval = "monthly",
  allowMonthlyCheckout = true,
  allowYearlyCheckout = true,
}: BillingPlansProps) {
  const effectiveInitialInterval: BillingInterval =
    initialBillingInterval === "yearly"
      ? allowYearlyCheckout
        ? "yearly"
        : allowMonthlyCheckout
        ? "monthly"
        : "yearly"
      : allowMonthlyCheckout
      ? "monthly"
      : allowYearlyCheckout
      ? "yearly"
      : "monthly";
  const [selectedTier, setSelectedTier] = useState<string>(activeTierId || "pro");
  const [billingInterval, setBillingInterval] = useState<BillingInterval>(
    effectiveInitialInterval
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => tiers.find((tier) => tier.id === selectedTier) || tiers[0],
    [tiers, selectedTier]
  );

  const hasActive = subscriptionStatus === "active" || subscriptionStatus === "trialing";
  const checkoutAvailableForSelectedInterval =
    billingInterval === "yearly" ? allowYearlyCheckout : allowMonthlyCheckout;
  const checkoutAvailableAny = allowMonthlyCheckout || allowYearlyCheckout;

  async function startCheckout() {
    if (!selected) return;
    if (!checkoutAvailableForSelectedInterval) {
      setError(
        "Stripe checkout staat uit voor dit interval. Beheer credits en rechten handmatig via admin."
      );
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tierId: selected.id, billingInterval }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Checkout starten mislukt");
      }

      if (!data.url) {
        throw new Error("Geen checkout URL ontvangen");
      }

      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="mb-2 flex items-center justify-between rounded-2xl border border-slate-200 bg-white/80 p-4">
        <p className="text-sm font-semibold text-slate-700">Facturatie</p>
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 text-xs font-semibold uppercase tracking-[0.12em]">
          <button
            type="button"
            onClick={() => allowMonthlyCheckout && setBillingInterval("monthly")}
            disabled={!allowMonthlyCheckout}
            className={`rounded-md px-3 py-2 transition ${
              billingInterval === "monthly"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
            }`}
          >
            Maandelijks
          </button>
          <button
            type="button"
            onClick={() => allowYearlyCheckout && setBillingInterval("yearly")}
            disabled={!allowYearlyCheckout}
            className={`rounded-md px-3 py-2 transition ${
              billingInterval === "yearly"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
            }`}
          >
            Jaarlijks
          </button>
        </div>
      </div>
      {!checkoutAvailableAny && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Stripe staat uit. Credits en rechten beheer je nu handmatig via de backend/admin route.
        </p>
      )}
      {billingInterval === "yearly" && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          Jaarlijks betalen: {getYearlyFreeMonths()} maanden gratis.
        </p>
      )}

      <div className="grid gap-5 md:grid-cols-3">
        {tiers.map((tier) => {
          const isSelected = tier.id === selectedTier;
          const isCurrent = activeTierId === tier.id && hasActive;
          const isFeatured = tier.id === "pro";

          return (
            <button
              type="button"
              key={tier.id}
              onClick={() => setSelectedTier(tier.id)}
              className={`relative rounded-3xl border p-6 text-left transition ${
                isSelected
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-900 hover:border-slate-400 hover:shadow-md"
              }`}
            >
              {isFeatured && (
                <p className="mb-3 inline-flex rounded-full bg-indigo-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.15em] text-indigo-800">
                  Meest gekozen
                </p>
              )}
              <p className="text-xs uppercase tracking-[0.18em] opacity-70">{tier.name}</p>
              <p className="mt-2 text-3xl font-black">{getTierPriceLabel(tier, billingInterval)}</p>
              {billingInterval === "yearly" && (
                <p className="mt-1 text-xs opacity-70">
                  {getTierSecondaryPriceLabel(tier, billingInterval)}
                </p>
              )}
              <p className="mt-2 text-sm opacity-80">{tier.description}</p>

              <ul className="mt-4 space-y-1.5">
                {tier.features.slice(0, 3).map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-xs opacity-80">
                    <Check className="h-3.5 w-3.5 shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              {isCurrent && (
                <p className={`mt-3 text-xs font-semibold uppercase tracking-[0.15em] ${isSelected ? "text-emerald-300" : "text-emerald-600"}`}>
                  Huidig plan
                </p>
              )}
            </button>
          );
        })}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-7">
        <h2 className="text-2xl font-black">{selected.name}</h2>
        <p className="mt-2 text-slate-600">{selected.description}</p>
        <p className="mt-3 text-base font-semibold text-slate-900">
          {getTierPriceLabel(selected, billingInterval)}
        </p>
        {billingInterval === "yearly" && (
          <p className="text-sm text-slate-600">
            {getTierSecondaryPriceLabel(selected, billingInterval)}
          </p>
        )}

        <ul className="mt-5 space-y-2 text-sm text-slate-700">
          {selected.features.map((feature) => (
            <li key={feature} className="flex items-center gap-2.5">
              <Check className="h-4 w-4 shrink-0 text-emerald-500" />
              {feature}
            </li>
          ))}
        </ul>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={startCheckout}
          disabled={loading || !checkoutAvailableForSelectedInterval}
          className="mt-7 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {!checkoutAvailableForSelectedInterval
            ? "Checkout niet beschikbaar"
            : loading
            ? "Bezig met checkout..."
            : `Activeer ${selected.name} (${billingInterval === "yearly" ? "jaar" : "maand"})`}
        </button>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white">
        <div className="grid min-w-[760px] grid-cols-4 border-b border-slate-200 bg-slate-50 text-sm font-semibold">
          <div className="p-4">Planvergelijking</div>
          <div className="p-4">Starter</div>
          <div className="p-4">Pro</div>
          <div className="p-4">Business</div>
        </div>

        {[
          ["WordPress sites", "Onbeperkt", "Onbeperkt", "Onbeperkt"],
          ["AI credits / maand", "50", "150", "400"],
          [
            "Prijs / maand",
            formatEuro(tiers.find((tier) => tier.id === "starter")?.priceMonthly || 0),
            formatEuro(tiers.find((tier) => tier.id === "pro")?.priceMonthly || 0),
            formatEuro(tiers.find((tier) => tier.id === "business")?.priceMonthly || 0),
          ],
          [
            "Prijs / jaar",
            formatEuro(tiers.find((tier) => tier.id === "starter")?.priceYearly || 0),
            formatEuro(tiers.find((tier) => tier.id === "pro")?.priceYearly || 0),
            formatEuro(tiers.find((tier) => tier.id === "business")?.priceYearly || 0),
          ],
          ["SEO scanner & fix", "Ja", "Ja", "Ja"],
          ["Clusters & planning", "Nee", "Ja", "Ja"],
          ["Social automation", "Nee", "Ja", "Ja"],
          ["Tone of voice", "Nee", "Ja", "Ja"],
          ["Teambeheer", "Nee", "Nee", "Ja"],
          ["Priority indexing", "Nee", "Nee", "Ja"],
          ["Extra credits bijkopen", "Nee", "Nee", "Ja"],
        ].map((row) => (
          <div
            key={row[0]}
            className="grid min-w-[760px] grid-cols-4 border-b border-slate-100 text-sm"
          >
            <div className="p-4 font-medium text-slate-700">{row[0]}</div>
            {row.slice(1).map((cell, i) => (
              <div key={i} className="p-4 text-slate-600">
                {cell === "Ja" ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : cell === "Nee" ? (
                  <span className="text-slate-300">—</span>
                ) : (
                  cell
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
