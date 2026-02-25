import { createHmac } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTierById, getTierByPriceId, TierId, type TierDefinition } from "@/lib/billing";
import { Resend } from "resend";

async function sendOwnerNotification({
  userId,
  tier,
  tierDef,
  billingInterval,
  supabase,
}: {
  userId: string;
  tier: string;
  tierDef: TierDefinition | undefined;
  billingInterval: string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const notifyEmail = process.env.OWNER_NOTIFY_EMAIL;

  if (!apiKey || !notifyEmail) return;

  const { data: { user } } = await supabase.auth.admin.getUserById(userId);
  const userEmail = user?.email ?? "onbekend";

  const tierName = tierDef?.name ?? tier;
  const interval = billingInterval === "yearly" ? "jaarlijks" : "maandelijks";
  const price = billingInterval === "yearly"
    ? `€${tierDef?.priceYearly ?? "?"}/jaar`
    : `€${tierDef?.priceMonthly ?? "?"}/maand`;

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: "Ascendio <onboarding@resend.dev>",
      to: notifyEmail,
      subject: `🎉 Nieuwe klant: ${userEmail} (${tierName})`,
      html: `
        <h2>Nieuwe betaalde klant op Ascendio</h2>
        <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
          <tr><td style="padding:6px 12px;color:#666;">E-mail</td><td style="padding:6px 12px;font-weight:bold;">${userEmail}</td></tr>
          <tr><td style="padding:6px 12px;color:#666;">Plan</td><td style="padding:6px 12px;font-weight:bold;">${tierName}</td></tr>
          <tr><td style="padding:6px 12px;color:#666;">Facturering</td><td style="padding:6px 12px;">${interval} · ${price}</td></tr>
          <tr><td style="padding:6px 12px;color:#666;">Credits</td><td style="padding:6px 12px;">${tierDef?.includedCredits ?? "?"} per maand</td></tr>
        </table>
      `,
    });
  } catch (err) {
    console.error("[webhook] Failed to send owner notification:", err);
  }
}

function verifyStripeSignature(payload: string, signatureHeader: string | null): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;

  const elements = signatureHeader.split(",").reduce<Record<string, string>>((acc, part) => {
    const [k, v] = part.split("=");
    if (k && v) acc[k] = v;
    return acc;
  }, {});

  if (!elements.t || !elements.v1) return false;

  const signedPayload = `${elements.t}.${payload}`;
  const expected = createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  return expected === elements.v1;
}

export async function POST(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!verifyStripeSignature(payload, signature)) {
    return NextResponse.json({ error: "Invalid Stripe signature" }, { status: 401 });
  }

  const event = JSON.parse(payload) as {
    type: string;
    data: { object: Record<string, unknown> };
  };

  const supabase = createAdminClient();
  const object = event.data.object;

  if (event.type === "checkout.session.completed") {
    const userId = object.metadata && typeof object.metadata === "object"
      ? (object.metadata as Record<string, string>).user_id
      : undefined;
    const tierFromMetadata = object.metadata && typeof object.metadata === "object"
      ? (object.metadata as Record<string, string>).tier_id
      : undefined;
    const billingInterval = object.metadata && typeof object.metadata === "object"
      ? (object.metadata as Record<string, string>).billing_interval
      : undefined;

    if (userId) {
      const tier = (tierFromMetadata && getTierById(tierFromMetadata))
        ? tierFromMetadata as TierId
        : "starter";
      const tierDef = getTierById(tier);

      await supabase.from("asc_subscriptions").upsert(
        {
          user_id: userId,
          tier,
          status: "active",
          stripe_customer_id: String(object.customer || ""),
          stripe_subscription_id: String(object.subscription || ""),
          credits_monthly: tierDef?.includedCredits || 0,
          credits_remaining: tierDef?.includedCredits || 0,
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      // Send notification email to owner
      await sendOwnerNotification({ userId, tier, tierDef, billingInterval, supabase });
    }
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = object;

    const priceId =
      Array.isArray((sub.items as { data?: Array<{ price?: { id?: string } }> })?.data)
        ? (sub.items as { data: Array<{ price?: { id?: string } }> }).data[0]?.price?.id
        : undefined;

    const tierFromPrice = priceId ? getTierByPriceId(priceId)?.id : undefined;
    const tierFromMetadata =
      sub.metadata && typeof sub.metadata === "object"
        ? (sub.metadata as Record<string, string>).tier_id
        : undefined;
    const tier = (tierFromMetadata || tierFromPrice || "starter") as TierId;
    const tierDef = getTierById(tier);

    const row = {
      status: String(sub.status || "inactive"),
      tier,
      stripe_customer_id: String(sub.customer || ""),
      stripe_subscription_id: String(sub.id || ""),
      cancel_at_period_end: Boolean(sub.cancel_at_period_end),
      current_period_start: sub.current_period_start
        ? new Date(Number(sub.current_period_start) * 1000).toISOString()
        : null,
      current_period_end: sub.current_period_end
        ? new Date(Number(sub.current_period_end) * 1000).toISOString()
        : null,
      credits_monthly: tierDef?.includedCredits || 0,
      updated_at: new Date().toISOString(),
    };

    const userIdFromMetadata =
      sub.metadata && typeof sub.metadata === "object"
        ? (sub.metadata as Record<string, string>).user_id
        : undefined;

    if (userIdFromMetadata) {
      await supabase.from("asc_subscriptions").upsert(
        {
          ...row,
          user_id: userIdFromMetadata,
        },
        { onConflict: "user_id" }
      );
    } else {
      await supabase
        .from("asc_subscriptions")
        .update(row)
        .eq("stripe_subscription_id", String(sub.id || ""));
    }
  }

  // Reset credits on billing cycle renewal
  if (event.type === "invoice.paid") {
    const invoice = object;
    const subscriptionId = String(invoice.subscription || "");
    const billingReason = String(invoice.billing_reason || "");

    if (subscriptionId && billingReason === "subscription_cycle") {
      const { data: existingSub } = await supabase
        .from("asc_subscriptions")
        .select("tier")
        .eq("stripe_subscription_id", subscriptionId)
        .maybeSingle();

      if (existingSub) {
        const tierDef = getTierById(existingSub.tier);
        await supabase
          .from("asc_subscriptions")
          .update({
            credits_remaining: tierDef?.includedCredits || 0,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", subscriptionId);
      }
    }
  }

  return NextResponse.json({ received: true });
}
