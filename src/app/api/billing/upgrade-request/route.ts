import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { getTierById, normalizeTierId, type TierId } from "@/lib/billing";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const tierId = body?.tierId as TierId | undefined;
  const tierDef = tierId ? getTierById(tierId) : undefined;

  if (!tierId || !tierDef) {
    return NextResponse.json({ error: "Ongeldig tierId" }, { status: 400 });
  }

  const { data: sub } = await supabase
    .from("asc_subscriptions")
    .select("tier, status")
    .eq("user_id", user.id)
    .maybeSingle();

  const currentTierName =
    getTierById(normalizeTierId(sub?.tier) ?? "")?.name ?? sub?.tier ?? "onbekend";

  const apiKey = process.env.RESEND_API_KEY;
  const notifyEmail = process.env.OWNER_NOTIFY_EMAIL;

  if (!apiKey || !notifyEmail) {
    console.log(
      `[upgrade-request] ${user.email} wil upgraden van ${currentTierName} naar ${tierDef.name}`
    );
    return NextResponse.json({ ok: true });
  }

  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from: "Ascendio <onboarding@resend.dev>",
    to: notifyEmail,
    subject: `⬆️ Upgrade-aanvraag: ${user.email} → ${tierDef.name}`,
    html: `
      <h2>Upgrade-aanvraag via Ascendio</h2>
      <p>Een gebruiker wil upgraden. Activeer het plan handmatig of stuur een betaallink.</p>
      <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;margin-top:12px;">
        <tr><td style="padding:6px 12px;color:#666;">E-mail</td><td style="padding:6px 12px;font-weight:bold;">${user.email}</td></tr>
        <tr><td style="padding:6px 12px;color:#666;">Huidig plan</td><td style="padding:6px 12px;">${currentTierName}</td></tr>
        <tr><td style="padding:6px 12px;color:#666;">Gewenst plan</td><td style="padding:6px 12px;font-weight:bold;">${tierDef.name} — €${tierDef.priceMonthly}/maand</td></tr>
        <tr><td style="padding:6px 12px;color:#666;">Credits</td><td style="padding:6px 12px;">${tierDef.includedCredits} per maand</td></tr>
      </table>
    `,
  });

  if (error) {
    console.error("[upgrade-request] Mail versturen mislukt:", error);
    return NextResponse.json(
      { error: `Mail versturen mislukt: ${(error as { message?: string }).message ?? JSON.stringify(error)}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
