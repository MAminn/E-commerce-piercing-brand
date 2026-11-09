import type { SocialProofConfig } from "#root/shared/database/drizzle/schema";

/**
 * Shipped defaults for the storefront social-proof toast.
 *
 * `enabled: false` is deliberate. The feed is built from real customer
 * orders, so turning it on is a decision about publishing (sanitised)
 * customer activity — that has to be an explicit act in the admin, never
 * something a deploy switches on by itself.
 *
 * `eligibleStatuses` excludes `pending` and `cancelled`: a pending order is
 * an unconfirmed intent (this store has a staging COD order sitting in that
 * state), and a cancelled one is a purchase that did not happen. Neither is
 * social proof.
 */
export const DEFAULT_SOCIAL_PROOF_CONFIG: SocialProofConfig = {
  enabled: false,
  firstDelaySeconds: 5,
  displayDurationSeconds: 6,
  intervalSeconds: 12,
  maxPerSession: 5,
  lookbackDays: 30,
  showLocation: true,
  locationSource: "city",
  showRelativeTime: true,
  allowedProductIds: [],
  eligibleStatuses: ["processing", "shipped", "delivered"],
};

/**
 * Hard ceiling on how many events the public endpoint will ever return,
 * independent of `maxPerSession`. The client only ever needs enough events
 * to fill one session; this stops a mis-set config (or a crafted request)
 * from turning the feed into a bulk export of recent order activity.
 */
export const MAX_PUBLIC_EVENTS = 20;
