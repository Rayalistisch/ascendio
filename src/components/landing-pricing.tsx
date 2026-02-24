"use client";

import Link from "next/link";
import { useState } from "react";
import { Check } from "lucide-react";
import {
  TIERS,
  getTierPriceLabel,
  getTierSecondaryPriceLabel,
  getYearlyFreeMonths,
  type BillingInterval,
} from "@/lib/billing";

interface LandingPricingProps {
  headingClassName?: string;
}

export function LandingPricing({ headingClassName = "" }: LandingPricingProps) {
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");

  return (
    <section id="pricing" className="bg-slate-950 py-16 text-white md:py-20">
      <div className="mx-auto max-w-7xl px-6 md:px-10">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">
            Pricing
          </p>
          <h2 className={`${headingClassName} mt-4 text-3xl font-semibold md:text-4xl`}>
            Kies je plan en schaal met credits
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/60 md:text-base">
            Elk plan bevat maandelijkse credits. Schaal op wanneer je groeit.
          </p>

          {/* Toggle */}
          <div className="mt-8 inline-flex items-center rounded-full border border-white/15 bg-white/5 p-1">
            <button
              type="button"
              onClick={() => setBillingInterval("monthly")}
              className={`rounded-full px-5 py-2 text-xs font-semibold uppercase tracking-[0.1em] transition ${
                billingInterval === "monthly"
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Maandelijks
            </button>
            <button
              type="button"
              onClick={() => setBillingInterval("yearly")}
              className={`rounded-full px-5 py-2 text-xs font-semibold uppercase tracking-[0.1em] transition ${
                billingInterval === "yearly"
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Jaarlijks
              <span className="ml-1.5 inline-flex rounded-full bg-emerald-400/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
                -{getYearlyFreeMonths()} mnd
              </span>
            </button>
          </div>
        </div>

        <p className="mt-4 text-sm text-white/50">
          Alle plannen starten met een <strong className="text-white/80">7 dagen gratis trial</strong> · 10 credits · Geen creditcard nodig
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {TIERS.map((tier, index) => (
            <article
              key={tier.id}
              className={`relative rounded-2xl border p-5 ${
                index === 1
                  ? "border-sky-400 bg-white text-slate-900 shadow-lg shadow-sky-400/20"
                  : "border-white/15 bg-white/5"
              }`}
            >
              {index === 1 && (
                <span className="absolute -top-2.5 left-5 rounded-full bg-sky-400 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-950">
                  Meest gekozen
                </span>
              )}
              <p
                className={`text-xs font-semibold uppercase tracking-[0.14em] ${
                  index === 1 ? "text-sky-600" : "text-white/50"
                }`}
              >
                {tier.name}
              </p>
              <p className={`${headingClassName} mt-3 text-3xl font-semibold`}>
                {getTierPriceLabel(tier, billingInterval)}
              </p>
              {billingInterval === "yearly" && (
                <p
                  className={`mt-1 text-xs ${
                    index === 1 ? "text-slate-500" : "text-white/50"
                  }`}
                >
                  {getTierSecondaryPriceLabel(tier, billingInterval)}
                </p>
              )}
              <p
                className={`mt-2 text-sm leading-relaxed ${
                  index === 1 ? "text-slate-500" : "text-white/60"
                }`}
              >
                {tier.description}
              </p>

              <ul className="mt-5 space-y-2">
                {tier.features.map((feature) => (
                  <li
                    key={feature}
                    className={`flex items-start gap-2 text-sm ${
                      index === 1 ? "text-slate-600" : "text-white/75"
                    }`}
                  >
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Link
                href="/login?mode=signup"
                className={`mt-6 inline-flex w-full items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold transition ${
                  index === 1
                    ? "bg-slate-950 text-white hover:bg-slate-800"
                    : "border border-white/20 text-white hover:bg-white/10"
                }`}
              >
                Aan de slag
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
