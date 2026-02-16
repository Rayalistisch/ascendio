export type TierId = "starter" | "growth" | "scale";

export interface TierDefinition {
  id: TierId;
  name: string;
  priceLabel: string;
  description: string;
  includedCredits: number;
  maxSites: number;
  maxPostsPerMonth: number;
  features: string[];
  stripePriceEnv: string;
}

export const TIERS: TierDefinition[] = [
  {
    id: "starter",
    name: "Starter",
    priceLabel: "EUR 79 / maand",
    description: "Voor kleine sites die consistent willen publiceren.",
    includedCredits: 40,
    maxSites: 1,
    maxPostsPerMonth: 20,
    features: [
      "1 WordPress site",
      "40 AI credits per maand",
      "Tot 20 posts per maand",
      "SEO scanner basis",
    ],
    stripePriceEnv: "STRIPE_PRICE_STARTER",
  },
  {
    id: "growth",
    name: "Growth",
    priceLabel: "EUR 199 / maand",
    description: "Voor teams die meerdere contentlijnen tegelijk draaien.",
    includedCredits: 140,
    maxSites: 3,
    maxPostsPerMonth: 90,
    features: [
      "3 WordPress sites",
      "140 AI credits per maand",
      "Tot 90 posts per maand",
      "Clusters + social automation",
    ],
    stripePriceEnv: "STRIPE_PRICE_GROWTH",
  },
  {
    id: "scale",
    name: "Scale",
    priceLabel: "EUR 499 / maand",
    description: "Voor bureaus en high-volume publishers.",
    includedCredits: 500,
    maxSites: 10,
    maxPostsPerMonth: 350,
    features: [
      "10 WordPress sites",
      "500 AI credits per maand",
      "Tot 350 posts per maand",
      "Priority support + indexing opschaling",
    ],
    stripePriceEnv: "STRIPE_PRICE_SCALE",
  },
];

export interface SubscriptionRecord {
  tier: TierId;
  status: string;
  credits_remaining: number | null;
  current_period_end: string | null;
}

export function getTierById(tierId: string): TierDefinition | undefined {
  return TIERS.find((tier) => tier.id === tierId);
}

export function getPriceIdForTier(tierId: TierId): string | null {
  const tier = getTierById(tierId);
  if (!tier) return null;
  return process.env[tier.stripePriceEnv] || null;
}

export function getTierByPriceId(priceId: string): TierDefinition | undefined {
  return TIERS.find((tier) => process.env[tier.stripePriceEnv] === priceId);
}

export function isActiveSubscriptionStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return ["active", "trialing"].includes(status);
}

export function isDevBillingBypassEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const flag =
    process.env.DEV_BILLING_BYPASS || process.env.NEXT_PUBLIC_DEV_BILLING_BYPASS;
  return flag === "true";
}
