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
  if (isDevBillingBypassEnabled()) return <AppShell user={user}>{children}</AppShell>;

  const { data: subscription } = await supabase
    .from("asc_subscriptions")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!isActiveSubscriptionStatus(subscription?.status)) {
    redirect("/billing");
  }

  return <AppShell user={user}>{children}</AppShell>;
}
