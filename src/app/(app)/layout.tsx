import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { isActiveSubscriptionStatus, isDevBillingBypassEnabled } from "@/lib/billing";

const TRIAL_DAYS = 7;
const TRIAL_CREDITS = 10;

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Always fetch subscription for credit display
  let { data: subscription } = await supabase
    .from("asc_subscriptions")
    .select("status, tier, credits_remaining, credits_monthly, trial_ends_at")
    .eq("user_id", user.id)
    .maybeSingle();

  // Always: new user with no subscription → auto-create trial (regardless of bypass)
  if (!subscription) {
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);

    const { data: newSub } = await supabase
      .from("asc_subscriptions")
      .insert({
        user_id: user.id,
        status: "trialing",
        tier: "starter",
        credits_remaining: TRIAL_CREDITS,
        credits_monthly: TRIAL_CREDITS,
        trial_ends_at: trialEndsAt.toISOString(),
      })
      .select("status, tier, credits_remaining, credits_monthly, trial_ends_at")
      .single();

    subscription = newSub;
  }

  // Billing gate (only enforced when bypass is off)
  if (!isDevBillingBypassEnabled()) {
    if (!isActiveSubscriptionStatus(subscription?.status)) {
      redirect("/billing");
    }

    // Trial expired → billing
    if (
      subscription?.status === "trialing" &&
      subscription?.trial_ends_at &&
      new Date(subscription.trial_ends_at) < new Date()
    ) {
      redirect("/billing");
    }
  }

  return (
    <AppShell
      user={user}
      subscription={subscription ? {
        tier: subscription.tier ?? "starter",
        status: subscription.status ?? "active",
        creditsRemaining: subscription.credits_remaining ?? 0,
        creditsMonthly: subscription.credits_monthly ?? 0,
        trialEndsAt: subscription.trial_ends_at ?? null,
      } : null}
    >
      {children}
    </AppShell>
  );
}
