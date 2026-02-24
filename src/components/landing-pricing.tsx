"use client";

import Link from "next/link";
import { useState } from "react";
import { Check } from "lucide-react";
import {
  TIERS,
  getYearlyFreeMonths,
  type BillingInterval,
} from "@/lib/billing";

interface LandingPricingProps {
  headingClassName?: string;
}

const cardThemes = [
  {
    bg: "bg-[#fff4f2]",
    border: "border-[#fde4df]",
    dot: "rgba(244,114,98,0.18)",
    button: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
    badge: null,
    featuresLabel: "Inclusief in Starter:",
  },
  {
    bg: "bg-[#f0f0fd]",
    border: "border-[#d9d9fb]",
    dot: "rgba(99,102,241,0.18)",
    button: "bg-indigo-600 text-white hover:bg-indigo-700",
    badge: "Meest gekozen",
    featuresLabel: "Alles van Starter, plus:",
  },
  {
    bg: "bg-[#f0f5fd]",
    border: "border-[#d4e4fb]",
    dot: "rgba(59,130,246,0.15)",
    button: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
    badge: null,
    featuresLabel: "Alles van Pro, plus:",
  },
];

export function LandingPricing({ headingClassName = "" }: LandingPricingProps) {
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");

  return (
    <section id="pricing" className="bg-white py-20">
      <div className="mx-auto max-w-7xl px-6 md:px-10">

        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500">
            Pricing
          </p>
          <h2 className={`${headingClassName} mt-3 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl`}>
            Kies je plan
          </h2>
          <p className="mt-3 text-base leading-relaxed text-slate-500">
            Elk plan bevat maandelijkse credits. Schaal op wanneer je groeit.
          </p>
        </div>

        {/* Trial badge */}
        <div className="mt-6 flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-1.5 text-xs font-semibold text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            7 dagen gratis trial · 10 credits · Geen creditcard nodig
          </span>
        </div>

        {/* Toggle */}
        <div className="mt-6 flex justify-center">
          <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setBillingInterval("monthly")}
              className={`rounded-full px-5 py-2 text-xs font-semibold transition ${
                billingInterval === "monthly"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-400 hover:text-slate-700"
              }`}
            >
              Maandelijks
            </button>
            <button
              type="button"
              onClick={() => setBillingInterval("yearly")}
              className={`rounded-full px-5 py-2 text-xs font-semibold transition ${
                billingInterval === "yearly"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-400 hover:text-slate-700"
              }`}
            >
              Jaarlijks
              <span className="ml-1.5 inline-flex rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                -{getYearlyFreeMonths()} mnd
              </span>
            </button>
          </div>
        </div>

        {/* Cards */}
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {TIERS.map((tier, index) => {
            const theme = cardThemes[index];
            const price = billingInterval === "yearly" ? tier.priceYearly : tier.priceMonthly;
            const unit = billingInterval === "yearly" ? "/ jaar" : "/ maand";
            const perMonth = billingInterval === "yearly"
              ? Math.round(tier.priceYearly / 12)
              : null;

            return (
              <article
                key={tier.id}
                className={`relative overflow-hidden rounded-3xl border p-7 ${theme.bg} ${theme.border}`}
                style={{
                  backgroundImage: `radial-gradient(${theme.dot} 1.5px, transparent 1.5px)`,
                  backgroundSize: "22px 22px",
                }}
              >
                {theme.badge && (
                  <span className="absolute right-5 top-5 rounded-full bg-indigo-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    {theme.badge}
                  </span>
                )}

                <p className="text-xl font-bold text-slate-900">{tier.name}</p>

                <p className="mt-3 text-xs font-medium text-slate-400">Vanaf</p>
                <div className="mt-1 flex items-end gap-1.5">
                  <span className="text-5xl font-extrabold leading-none tracking-tight text-slate-900">
                    €{price}
                  </span>
                  <span className="mb-1 text-sm font-medium text-slate-400">{unit}</span>
                </div>
                {perMonth && (
                  <p className="mt-1 text-xs text-slate-400">≈ €{perMonth} / maand</p>
                )}

                <p className="mt-3 text-sm leading-relaxed text-slate-500">
                  {tier.description}
                </p>

                <Link
                  href="/login?mode=signup"
                  className={`mt-5 flex w-full items-center justify-center rounded-xl py-3 text-sm font-semibold transition ${theme.button}`}
                >
                  Aan de slag
                </Link>

                <div className="my-5 border-t border-slate-200/70" />

                <p className="mb-3 text-xs font-semibold text-slate-400">
                  {theme.featuresLabel}
                </p>
                <ul className="space-y-2.5">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm text-slate-600">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
