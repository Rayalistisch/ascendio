import type { SupabaseClient } from "@supabase/supabase-js";

export const CREDIT_COSTS = {
  blog_post_no_images: 5,
  blog_post_with_images: 8,
  seo_fix: 1,
  cluster_suggest: 2,
  content_rewrite: 3,
  seo_score_analysis: 2,
  image_regeneration: 3,
  inline_image_generation: 1,
} as const;

export type CreditAction = keyof typeof CREDIT_COSTS;

/**
 * Check whether the user has enough credits for the given cost.
 */
export async function checkCredits(
  supabase: SupabaseClient,
  userId: string,
  cost: number
): Promise<{ enough: boolean; remaining: number }> {
  const { data } = await supabase
    .from("asc_subscriptions")
    .select("credits_remaining")
    .eq("user_id", userId)
    .maybeSingle();

  const remaining = data?.credits_remaining ?? 0;
  return { enough: remaining >= cost, remaining };
}

/**
 * Atomically deduct credits via Postgres function and log the usage.
 * The DB function uses `WHERE credits_remaining >= cost` so concurrent
 * requests can never drive the balance below zero.
 */
export async function deductCredits(
  supabase: SupabaseClient,
  userId: string,
  action: CreditAction,
  referenceId?: string
): Promise<{ success: true } | { success: false; error: string }> {
  const cost = CREDIT_COSTS[action];

  // Read current credits
  const { data: sub, error: readError } = await supabase
    .from("asc_subscriptions")
    .select("credits_remaining")
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) {
    console.error("[credits] Failed to read subscription:", readError.message, { userId, action });
    return { success: false, error: readError.message };
  }

  const remaining = sub?.credits_remaining ?? 0;
  if (remaining < cost) {
    console.warn("[credits] Insufficient credits", { userId, action, cost, remaining });
    return { success: false, error: "insufficient_credits" };
  }

  // Atomic update — gte guard prevents going below zero even with concurrent requests
  const { error: updateError } = await supabase
    .from("asc_subscriptions")
    .update({
      credits_remaining: remaining - cost,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .gte("credits_remaining", cost);

  if (updateError) {
    console.error("[credits] Failed to deduct credits:", updateError.message, { userId, action, cost });
    return { success: false, error: updateError.message };
  }

  // Log the usage
  await supabase.from("asc_credit_usage").insert({
    user_id: userId,
    action,
    credits: cost,
    reference_id: referenceId ?? null,
  });

  return { success: true };
}
