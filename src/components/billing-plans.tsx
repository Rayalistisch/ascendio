"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import {
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
}

export function BillingPlans({
  tiers,
  activeTierId,
  subscriptionStatus,
}: BillingPlansProps) {
  const [selectedTier, setSelectedTier] = useState<string>(activeTierId || "pro");
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => tiers.find((tier) => tier.id === selectedTier) || tiers[0],
    [tiers, selectedTier]
  );

  const hasActive = subscriptionStatus === "active" || subscriptionStatus === "trialing";

  async function startCheckout() {
    if (!selected) return;

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
      {/* Billing interval toggle */}
      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white/80 p-4">
        <p className="text-sm font-semibold text-slate-700">Facturatie</p>
        <div className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-1 text-xs font-semibold uppercase tracking-[0.1em]">
          <button
            type="button"
            onClick={() => setBillingInterval("monthly")}
            className={`rounded-full px-4 py-1.5 transition ${
              billingInterval === "monthly"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Maandelijks
          </button>
          <button
            type="button"
            onClick={() => setBillingInterval("yearly")}
            className={`rounded-full px-4 py-1.5 transition ${
              billingInterval === "yearly"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Jaarlijks
            <span className="ml-1.5 inline-flex rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
              -{getYearlyFreeMonths()} mnd
            </span>
          </button>
        </div>
      </div>

      {/* Tier cards */}
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
              className={`relative rounded-2xl border p-5 text-left transition ${
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
              <p className="mt-2 text-3xl font-black">
                {getTierPriceLabel(tier, billingInterval)}
              </p>
              {billingInterval === "yearly" && (
                <p className="mt-1 text-xs opacity-60">
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

      {/* Selected plan detail */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-2xl font-black">{selected.name}</h2>
        <p className="mt-1 text-slate-500">{selected.description}</p>
        <p className="mt-3 text-lg font-semibold text-slate-900">
          {getTierPriceLabel(selected, billingInterval)}
        </p>
        {billingInterval === "yearly" && (
          <p className="text-sm text-slate-500">
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
          disabled={loading}
          className="mt-6 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {loading
            ? "Bezig met checkout..."
            : `Activeer ${selected.name} (${billingInterval === "yearly" ? "jaarlijks" : "maandelijks"})`}
        </button>
      </div>

      {/* Comparison table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <div className="grid min-w-[760px] grid-cols-4 border-b border-slate-200 bg-slate-50 text-sm font-semibold">
          <div className="p-4">Planvergelijking</div>
          <div className="p-4">Starter</div>
          <div className="p-4">Pro</div>
          <div className="p-4">Business</div>
        </div>

        {[
          ["WordPress sites", "Onbeperkt", "Onbeperkt", "Onbeperkt"],
          ["AI credits / maand", "50", "150", "400"],
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
                  <span className="text-slate-300">&mdash;</span>
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
