import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { isActiveSubscriptionStatus, isDevBillingBypassEnabled } from "@/lib/billing";

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
  const { data: subscription } = await supabase
    .from("asc_subscriptions")
    .select("status, tier, credits_remaining, credits_monthly")
    .eq("user_id", user.id)
    .maybeSingle();

  // Only enforce billing gate when bypass is off
  if (!isDevBillingBypassEnabled() && !isActiveSubscriptionStatus(subscription?.status)) {
    redirect("/billing");
  }

  return (
    <AppShell
      user={user}
      subscription={subscription ? {
        tier: subscription.tier ?? "starter",
        status: subscription.status ?? "active",
        creditsRemaining: subscription.credits_remaining ?? 0,
        creditsMonthly: subscription.credits_monthly ?? 0,
      } : null}
    >
      {children}
    </AppShell>
  );
}
