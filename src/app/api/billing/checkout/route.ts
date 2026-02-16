import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPriceIdForTier, getTierById, TierId } from "@/lib/billing";

function getBaseUrl(request: Request): string {
  const url = new URL(request.url);
  const protocol = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
  return `${protocol}://${host}`;
}

async function createStripeCustomer(email: string, userId: string): Promise<string> {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) throw new Error("STRIPE_SECRET_KEY ontbreekt");

  const response = await fetch("https://api.stripe.com/v1/customers", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      email,
      metadata: JSON.stringify({ user_id: userId }),
    }),
  });

  const result = await response.json();
  if (!response.ok || !result?.id) {
    throw new Error(result?.error?.message || "Stripe customer aanmaken mislukt");
  }

  return result.id as string;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const tierId = body?.tierId as TierId | undefined;
  if (!tierId || !getTierById(tierId)) {
    return NextResponse.json({ error: "Ongeldig tierId" }, { status: 400 });
  }

  const priceId = getPriceIdForTier(tierId);
  if (!priceId) {
    return NextResponse.json(
      { error: `Stripe prijs ontbreekt voor tier ${tierId}` },
      { status: 500 }
    );
  }

  const admin = createAdminClient();

  const { data: existingSub } = await admin
    .from("asc_subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const stripeCustomerId =
    existingSub?.stripe_customer_id || (await createStripeCustomer(user.email || "", user.id));

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ error: "STRIPE_SECRET_KEY ontbreekt" }, { status: 500 });
  }

  const baseUrl = getBaseUrl(request);
  const params = new URLSearchParams({
    mode: "subscription",
    customer: stripeCustomerId,
    success_url: `${baseUrl}/billing?success=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/billing?canceled=1`,
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    "metadata[user_id]": user.id,
    "metadata[tier_id]": tierId,
    "subscription_data[metadata][user_id]": user.id,
    "subscription_data[metadata][tier_id]": tierId,
  });

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const result = await response.json();
  if (!response.ok || !result?.url) {
    return NextResponse.json(
      { error: result?.error?.message || "Checkout session aanmaken mislukt" },
      { status: 500 }
    );
  }

  return NextResponse.json({ url: result.url });
}
