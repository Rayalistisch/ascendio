"use client";

import { useMemo, useState } from "react";
import type { TierDefinition } from "@/lib/billing";

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
  const [selectedTier, setSelectedTier] = useState<string>(activeTierId || "growth");
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
        body: JSON.stringify({ tierId: selected.id }),
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
          <span className="rounded-md bg-slate-900 px-3 py-2 text-white">Maandelijks</span>
          <span className="px-3 py-2 text-slate-600">Jaarlijks (soon)</span>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {tiers.map((tier) => {
          const isSelected = tier.id === selectedTier;
          const isCurrent = activeTierId === tier.id && hasActive;
          const isFeatured = tier.id === "growth";

          return (
            <button
              type="button"
              key={tier.id}
              onClick={() => setSelectedTier(tier.id)}
              className={`rounded-3xl border p-6 text-left transition ${
                isSelected
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-900 hover:border-slate-400 hover:shadow-md"
              }`}
            >
              {isFeatured && (
                <p className="mb-3 inline-flex rounded-full bg-indigo-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.15em] text-indigo-800">
                  Most popular
                </p>
              )}
              <p className="text-xs uppercase tracking-[0.18em] opacity-70">{tier.name}</p>
              <p className="mt-2 text-3xl font-black">{tier.priceLabel}</p>
              <p className="mt-2 text-sm opacity-80">{tier.description}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.14em] opacity-70">
                {tier.includedCredits} credits per maand
              </p>
              {isCurrent && (
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.15em] text-emerald-300">
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

        <ul className="mt-5 space-y-2 text-sm text-slate-700">
          {selected.features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={startCheckout}
          disabled={loading}
          className="mt-7 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? "Bezig met checkout..." : `Activeer ${selected.name}`}
        </button>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white">
        <div className="grid min-w-[760px] grid-cols-4 border-b border-slate-200 bg-slate-50 text-sm font-semibold">
          <div className="p-4">Planvergelijking</div>
          <div className="p-4">Starter</div>
          <div className="p-4">Growth</div>
          <div className="p-4">Scale</div>
        </div>

        {[
          ["WordPress sites", "1", "3", "10"],
          ["AI credits / maand", "40", "140", "500"],
          ["Posts / maand", "20", "90", "350"],
          ["SEO scanner", "Basis", "Uitgebreid", "Uitgebreid + prioriteit"],
          ["Social automation", "Nee", "Ja", "Ja"],
        ].map((row) => (
          <div
            key={row[0]}
            className="grid min-w-[760px] grid-cols-4 border-b border-slate-100 text-sm"
          >
            <div className="p-4 font-medium text-slate-700">{row[0]}</div>
            <div className="p-4 text-slate-600">{row[1]}</div>
            <div className="p-4 text-slate-600">{row[2]}</div>
            <div className="p-4 text-slate-600">{row[3]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
