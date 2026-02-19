import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTierById, type TierId } from "@/lib/billing";

/**
 * Admin endpoint to manage user credits & subscriptions.
 * Secured via ADMIN_SECRET header.
 *
 * GET /api/admin/credits?email=user@example.com
 *   → Returns current credit info for the user
 *
 * POST /api/admin/credits
 *   Body: { email, credits, action?, tier? }
 *   - action: "set" (default) | "add" | "subtract" | "activate"
 *   - "activate": creates or resets subscription (requires tier)
 *   - "set" / "add" / "subtract": adjust credits on existing subscription
 */

function verifyAdmin(request: Request): boolean {
  const secret = request.headers.get("x-admin-secret");
  const expected = process.env.ADMIN_SECRET;
  if (!expected || !secret) return false;
  return secret === expected;
}

export async function GET(request: Request) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");

  const supabase = createAdminClient();

  if (email) {
    const { data: users } = await supabase.auth.admin.listUsers();
    const user = users?.users?.find((u) => u.email === email);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { data: sub } = await supabase
      .from("asc_subscriptions")
      .select("tier, status, credits_remaining, credits_monthly, current_period_end")
      .eq("user_id", user.id)
      .maybeSingle();

    return NextResponse.json({
      user: { id: user.id, email: user.email },
      subscription: sub,
    });
  }

  const { data: subs } = await supabase
    .from("asc_subscriptions")
    .select("user_id, tier, status, credits_remaining, credits_monthly")
    .order("updated_at", { ascending: false });

  return NextResponse.json({ subscriptions: subs });
}

export async function POST(request: Request) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { email, credits, action = "set", tier } = body;

  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Find user by email
  const { data: users } = await supabase.auth.admin.listUsers();
  const user = users?.users?.find((u) => u.email === email);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Activate: create or reset a subscription for this user
  if (action === "activate") {
    const tierId = (tier || "pro") as TierId;
    const tierDef = getTierById(tierId);
    if (!tierDef) {
      return NextResponse.json({ error: "Invalid tier. Use: starter, pro, or business" }, { status: 400 });
    }

    const { error } = await supabase.from("asc_subscriptions").upsert(
      {
        user_id: user.id,
        tier: tierId,
        status: "active",
        credits_monthly: tierDef.includedCredits,
        credits_remaining: credits ?? tierDef.includedCredits,
        cancel_at_period_end: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email },
      subscription: {
        tier: tierId,
        status: "active",
        credits_remaining: credits ?? tierDef.includedCredits,
        credits_monthly: tierDef.includedCredits,
      },
    });
  }

  // For set/add/subtract: require credits param and existing subscription
  if (credits === undefined || typeof credits !== "number") {
    return NextResponse.json({ error: "Missing credits" }, { status: 400 });
  }

  const { data: sub } = await supabase
    .from("asc_subscriptions")
    .select("credits_remaining, credits_monthly, tier, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!sub) {
    return NextResponse.json({
      error: "No subscription found. Use action: \"activate\" first to create one.",
    }, { status: 404 });
  }

  let newCredits: number;
  switch (action) {
    case "add":
      newCredits = (sub.credits_remaining ?? 0) + credits;
      break;
    case "subtract":
      newCredits = Math.max(0, (sub.credits_remaining ?? 0) - credits);
      break;
    default:
      newCredits = credits;
  }

  const { error } = await supabase
    .from("asc_subscriptions")
    .update({
      credits_remaining: newCredits,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    user: { id: user.id, email: user.email },
    credits: { previous: sub.credits_remaining, new: newCredits },
  });
}
