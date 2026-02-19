import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BillingPlans } from "@/components/billing-plans";
import {
  type BillingInterval,
  TIERS,
  isActiveSubscriptionStatus,
  isDevBillingBypassEnabled,
  isStripeCheckoutEnabledForInterval,
} from "@/lib/billing";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface BillingPageProps {
  searchParams: Promise<{ interval?: string | string[] }>;
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const resolvedSearchParams = await searchParams;
  const intervalParam = Array.isArray(resolvedSearchParams.interval)
    ? resolvedSearchParams.interval[0]
    : resolvedSearchParams.interval;
  const initialBillingInterval: BillingInterval =
    intervalParam === "yearly" ? "yearly" : "monthly";
  const allowMonthlyCheckout = isStripeCheckoutEnabledForInterval("monthly");
  const allowYearlyCheckout = isStripeCheckoutEnabledForInterval("yearly");

  const billingBypass = isDevBillingBypassEnabled();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: subscription } = await supabase
    .from("asc_subscriptions")
    .select("tier, status, credits_remaining, current_period_end")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!billingBypass && isActiveSubscriptionStatus(subscription?.status)) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff_0%,_#eef2ff_40%,_#e2e8f0_100%)] px-6 py-12">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm">
          <Link href="/" className="font-medium text-slate-600 hover:text-slate-900">
            Naar landingspagina
          </Link>
          <Link
            href="/api/auth/signout"
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100"
          >
            Uitloggen
          </Link>
        </div>

        {billingBypass && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Dev bypass is actief. Je kunt zonder actieve subscription verder naar het dashboard.
            <Link href="/dashboard" className="ml-2 font-semibold underline">
              Ga naar dashboard
            </Link>
          </div>
        )}
        <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-8 shadow-xl shadow-slate-200/60 md:p-10">
          <p className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-800">
            Subscription Required
          </p>
          <h1 className="mt-5 text-4xl font-black tracking-tight text-slate-900 md:text-5xl">
            Activeer je plan om verder te gaan
          </h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            Je account is aangemaakt. Kies nu een tier op basis van output,
            credits en teamgrootte om toegang te krijgen tot de volledige app.
          </p>
        </div>

        <BillingPlans
          tiers={TIERS}
          activeTierId={subscription?.tier || null}
          subscriptionStatus={subscription?.status || null}
          initialBillingInterval={initialBillingInterval}
          allowMonthlyCheckout={allowMonthlyCheckout}
          allowYearlyCheckout={allowYearlyCheckout}
        />
      </div>
    </main>
  );
}
