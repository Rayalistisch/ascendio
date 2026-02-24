import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const TRIAL_DAYS = 7;
const TRIAL_CREDITS = 10;

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const type = searchParams.get("type");
  const next =
    type === "recovery"
      ? "/login?mode=reset"
      : searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // For new signups: create a trial subscription if none exists
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: existingSub } = await supabase
          .from("asc_subscriptions")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!existingSub) {
          const trialEndsAt = new Date();
          trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);

          await supabase.from("asc_subscriptions").insert({
            user_id: user.id,
            status: "trialing",
            tier: "starter",
            credits_remaining: TRIAL_CREDITS,
            credits_monthly: TRIAL_CREDITS,
            trial_ends_at: trialEndsAt.toISOString(),
          });

          // New trial user → go straight to dashboard
          return NextResponse.redirect(`${origin}/dashboard`);
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
