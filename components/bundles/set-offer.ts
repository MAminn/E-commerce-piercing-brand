import type { BundleCardCampaign } from "./BundleCampaignCard";
import { fillTemplate, formatBundlePercent, formatMoney } from "./bundle-ui";

/**
 * What a Pick Your Set offer card says, derived ONLY from the live campaign:
 * its tiers, pricing type and free-shipping flag. Nothing is hardcoded — a
 * "20% off" on the homepage is the campaign's own tier, so the card can never
 * advertise a discount the builder will not give.
 *
 * Used by the homepage Pick Your Set block and the /offers page so both say
 * exactly the same thing.
 */
export interface SetOfferSummary {
  /** "20% off" · "Up to 20% off" · "3 for EGP 450" · "From EGP 450". */
  headline: string;
  /** The campaign's own free-shipping benefit (deliverable destinations). */
  freeShipping: boolean;
  /** The exact piece count when the campaign has one size, else null. */
  pieces: number | null;
  /** "Choose 3 individual pieces." · "Choose 3–6 individual pieces." */
  rule: string;
  /** "Shop 3 pieces" · "Build your set". */
  cta: string;
  soldOut: boolean;
}

type Translate = (key: string) => string;

export function describeSetOffer(
  campaign: Pick<BundleCardCampaign, "tiers" | "pricingType" | "freeShipping" | "requiredQuantity" | "fixedBundlePrice" | "availability">,
  t: Translate,
  currency: string,
): SetOfferSummary {
  const tiers = [...(campaign.tiers ?? [])].sort((a, b) => a.quantity - b.quantity);
  const smallest = tiers[0];
  const largest = tiers[tiers.length - 1];
  const single = tiers.length <= 1;
  const pieces = single ? (smallest?.quantity ?? campaign.requiredQuantity) : null;
  const isPercentage = campaign.pricingType === "percentage_discount";

  let headline: string;
  if (isPercentage) {
    const percents = tiers.map((tier) => tier.discountPercent ?? 0);
    const best = Math.max(0, ...percents);
    headline = fillTemplate(t(single ? "sets.pct_off" : "bundles.up_to_pct"), { percent: formatBundlePercent(best) });
  } else if (single) {
    headline = fillTemplate(t("sets.count_for_price"), {
      count: pieces ?? 0,
      price: formatMoney(smallest?.price ?? campaign.fixedBundlePrice ?? 0, currency),
    });
  } else {
    const prices = tiers.flatMap((tier) => (tier.price === null ? [] : [tier.price]));
    headline = fillTemplate(t("bundles.from_price"), { price: formatMoney(Math.min(...prices), currency) });
  }

  const rule = single
    ? fillTemplate(t("sets.rule_exact"), { count: pieces ?? 0 })
    : fillTemplate(t("sets.rule_range"), { min: smallest?.quantity ?? 0, max: largest?.quantity ?? 0 });

  return {
    headline,
    freeShipping: campaign.freeShipping,
    pieces,
    rule,
    cta: pieces !== null ? fillTemplate(t("sets.cta_shop_pieces"), { count: pieces }) : t("sets.cta_build"),
    soldOut: campaign.availability !== "available",
  };
}

/**
 * The live Pick Your Set campaign a promo code points shoppers to: a code with
 * an exact quantity rule (min = max, e.g. PICK3 = 3) maps to the set built
 * from that many pieces. Among several candidates, one whose own discount and
 * free-shipping benefit match the code wins. No exact rule, or no set of that
 * size → null (the code card then links to the shop instead).
 */
export function builderForCode<
  C extends Pick<BundleCardCampaign, "slug" | "tiers" | "pricingType" | "freeShipping" | "requiredQuantity">,
>(
  code: {
    discountType: "percentage" | "fixed_amount";
    discountValue: number;
    freeShipping?: boolean;
    eligibleMinQuantity?: number | null;
    eligibleMaxQuantity?: number | null;
  },
  campaigns: readonly C[],
): C | null {
  const min = code.eligibleMinQuantity ?? null;
  const max = code.eligibleMaxQuantity ?? null;
  if (min === null || min !== max) return null;
  const sameSize = campaigns.filter((c) =>
    (c.tiers?.length ? c.tiers.map((tier) => tier.quantity) : [c.requiredQuantity]).includes(min),
  );
  if (sameSize.length === 0) return null;
  const sameTerms = sameSize.find(
    (c) =>
      c.pricingType === "percentage_discount" &&
      code.discountType === "percentage" &&
      c.tiers.some((tier) => tier.quantity === min && tier.discountPercent === code.discountValue) &&
      c.freeShipping === Boolean(code.freeShipping),
  );
  return sameTerms ?? sameSize[0] ?? null;
}
