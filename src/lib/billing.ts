export type TierId = "starter" | "pro" | "business";
export type BillingInterval = "monthly" | "yearly";

const YEARLY_MONTHS_TOTAL = 12;
const YEARLY_MONTHS_CHARGED = 10;
const YEARLY_FREE_MONTHS = YEARLY_MONTHS_TOTAL - YEARLY_MONTHS_CHARGED;

export interface TierDefinition {
  id: TierId;
  name: string;
  priceLabel: string;
  priceMonthly: number;
  priceYearly: number;
  description: string;
  includedCredits: number;
  features: string[];
  stripePriceEnv: string; // Monthly Stripe price env
  stripePriceEnvYearly: string; // Yearly Stripe price env
}

export const TIERS: TierDefinition[] = [
  {
    id: "starter",
    name: "Starter",
    priceLabel: "€49 / maand",
    priceMonthly: 49,
    priceYearly: 490,
    description: "Voor ondernemers en bloggers die consistent willen publiceren.",
    includedCredits: 50,
    features: [
      "Onbeperkt WordPress sites",
      "50 AI credits per maand",
      "SEO scanner & auto-fix",
      "Search Console koppeling",
      "Content rewriter",
    ],
    stripePriceEnv: "STRIPE_PRICE_STARTER",
    stripePriceEnvYearly: "STRIPE_PRICE_STARTER_YEARLY",
  },
  {
    id: "pro",
    name: "Pro",
    priceLabel: "€129 / maand",
    priceMonthly: 129,
    priceYearly: 1290,
    description: "Voor serieuze content marketeers met meerdere projecten.",
    includedCredits: 150,
    features: [
      "Onbeperkt WordPress sites",
      "150 AI credits per maand",
      "Alles van Starter",
      "Clusters & topic planning",
      "Tone of voice per site",
    ],
    stripePriceEnv: "STRIPE_PRICE_PRO",
    stripePriceEnvYearly: "STRIPE_PRICE_PRO_YEARLY",
  },
  {
    id: "business",
    name: "Business",
    priceLabel: "€299 / maand",
    priceMonthly: 299,
    priceYearly: 2990,
    description: "Voor bureaus en high-volume publishers.",
    includedCredits: 400,
    features: [
      "Onbeperkt WordPress sites",
      "400 AI credits per maand",
      "Alles van Pro",
      "Priority indexing",
      "Teambeheer & rollen",
      "Extra credits bijkoopbaar",
    ],
    stripePriceEnv: "STRIPE_PRICE_BUSINESS",
    stripePriceEnvYearly: "STRIPE_PRICE_BUSINESS_YEARLY",
  },
];

// Feature gating per tier
export type GatedFeature = "clusters" | "social" | "tone_of_voice" | "team";

const TIER_FEATURES: Record<TierId, GatedFeature[]> = {
  starter: [],
  pro: ["clusters", "social", "tone_of_voice"],
  business: ["clusters", "social", "tone_of_voice", "team"],
};

export function tierHasFeature(tier: TierId | string | null | undefined, feature: GatedFeature): boolean {
  if (!tier) return false;
  const features = TIER_FEATURES[tier as TierId];
  if (!features) return false;
  return features.includes(feature);
}

export interface SubscriptionRecord {
  tier: TierId;
  status: string;
  credits_remaining: number | null;
  current_period_end: string | null;
}

export function getTierById(tierId: string): TierDefinition | undefined {
  return TIERS.find((tier) => tier.id === tierId);
}

export function getPriceIdForTier(
  tierId: TierId,
  billingInterval: BillingInterval = "monthly"
): string | null {
  const tier = getTierById(tierId);
  if (!tier) return null;
  const envKey =
    billingInterval === "yearly" ? tier.stripePriceEnvYearly : tier.stripePriceEnv;
  return process.env[envKey] || null;
}

export function getTierByPriceId(priceId: string): TierDefinition | undefined {
  return TIERS.find(
    (tier) =>
      process.env[tier.stripePriceEnv] === priceId ||
      process.env[tier.stripePriceEnvYearly] === priceId
  );
}

function hasStripePriceForTier(
  tier: TierDefinition,
  billingInterval: BillingInterval
): boolean {
  const envKey =
    billingInterval === "yearly" ? tier.stripePriceEnvYearly : tier.stripePriceEnv;
  return Boolean(process.env[envKey]);
}

export function isStripeCheckoutEnabledForInterval(
  billingInterval: BillingInterval
): boolean {
  if (!process.env.STRIPE_SECRET_KEY) return false;
  return TIERS.every((tier) => hasStripePriceForTier(tier, billingInterval));
}

export function formatEuro(amount: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getYearlyFreeMonths(): number {
  return YEARLY_FREE_MONTHS;
}

export function getTierPriceLabel(
  tier: TierDefinition,
  billingInterval: BillingInterval
): string {
  return billingInterval === "yearly"
    ? `${formatEuro(tier.priceYearly)} / jaar`
    : `${formatEuro(tier.priceMonthly)} / maand`;
}

export function getTierSecondaryPriceLabel(
  tier: TierDefinition,
  billingInterval: BillingInterval
): string | null {
  if (billingInterval === "monthly") return null;
  const perMonthEquivalent = tier.priceYearly / YEARLY_MONTHS_TOTAL;
  return `${formatEuro(perMonthEquivalent)} / maand, jaarlijks gefactureerd`;
}

export function isActiveSubscriptionStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return ["active", "trialing"].includes(status);
}

/**
 * Check if a user has access to a gated feature based on their subscription tier.
 * Returns the tier if access is granted, or null if not.
 */
export async function checkFeatureAccess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  feature: GatedFeature
): Promise<{ allowed: boolean; tier: string | null }> {
  if (isDevBillingBypassEnabled()) return { allowed: true, tier: "business" };

  const { data: sub } = await supabase
    .from("asc_subscriptions")
    .select("tier")
    .eq("user_id", userId)
    .maybeSingle();

  const tier = sub?.tier ?? null;
  return { allowed: tierHasFeature(tier, feature), tier };
}

export function isDevBillingBypassEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const flag =
    process.env.DEV_BILLING_BYPASS || process.env.NEXT_PUBLIC_DEV_BILLING_BYPASS;
  return flag === "true";
}
