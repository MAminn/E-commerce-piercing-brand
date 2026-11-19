import { EGYPT_GOVERNORATES } from "./egypt-governorates";
import {
  resolveFreeShippingMinimum,
  resolveZoneRate,
  type ShippingRulesConfig,
} from "./rules";

/**
 * What /shipping-policy may state, derived ONLY from live configuration:
 *
 *  - fees and unavailable governorates — `store_settings.shipping_rules` /
 *    `shipping_fee`, through the same `resolveZoneRate` the checkout quote and
 *    create-order use, so the page cannot promise a destination checkout
 *    refuses;
 *  - the free-shipping minimum — `resolveFreeShippingMinimum`, the same value
 *    `computeCartTotals` compares against (`>=`, after discounts);
 *  - delivery times — the admin's own "Shipping text" from Dashboard >
 *    Settings > Product Page Content, shown verbatim, exactly as on every
 *    product page. The page never writes a delivery estimate of its own;
 *  - cash on delivery — whether checkout offers it.
 *
 * Nothing here is hard-coded: change a setting and the page follows.
 */
export type ShippingPolicyFee =
  /** Every deliverable destination pays nothing. */
  | { kind: "free" }
  /** One fee for every deliverable destination. */
  | { kind: "single"; amount: number }
  /** Fees differ between governorates — shown at checkout. */
  | { kind: "by_governorate" };

export interface ShippingPolicyGovernorate {
  code: string;
  nameEn: string;
  nameAr: string;
}

export interface ShippingPolicyFacts {
  fee: ShippingPolicyFee;
  /** EGP, compared after discounts; null when off or when delivery is free anyway. */
  freeShippingMinimum: number | null;
  /** Governorates checkout will not deliver to, in the canonical list order. */
  unavailableGovernorates: ShippingPolicyGovernorate[];
  /** The admin's delivery-time text; Arabic falls back to English. Null when blank. */
  deliveryText: { en: string; ar: string } | null;
  cashOnDelivery: boolean;
}

export interface ShippingPolicyInput {
  rules: ShippingRulesConfig;
  /** `store_settings.shipping_fee` — used in flat mode only. */
  flatFee: number;
  shippingText?: string;
  shippingTextAr?: string;
  cashOnDelivery: boolean;
}

export function buildShippingPolicyFacts(input: ShippingPolicyInput): ShippingPolicyFacts {
  const { rules } = input;
  const unavailableGovernorates: ShippingPolicyGovernorate[] = [];
  const fees = new Set<number>();

  if (rules.mode === "zones") {
    for (const g of EGYPT_GOVERNORATES) {
      const rate = resolveZoneRate(rules, g.code);
      if (rate.kind === "unavailable") {
        unavailableGovernorates.push({ code: g.code, nameEn: g.nameEn, nameAr: g.nameAr });
      } else {
        fees.add(rate.fee);
      }
    }
  } else {
    // Flat mode prices every destination the same and refuses none.
    fees.add(input.flatFee);
  }

  let fee: ShippingPolicyFee;
  const [only] = [...fees];
  if (fees.size === 1 && only !== undefined) {
    fee = only === 0 ? { kind: "free" } : { kind: "single", amount: only };
  } else {
    fee = { kind: "by_governorate" };
  }

  const en = input.shippingText?.trim() ?? "";
  const ar = input.shippingTextAr?.trim() ?? "";

  return {
    fee,
    freeShippingMinimum: fee.kind === "free" ? null : resolveFreeShippingMinimum(rules),
    unavailableGovernorates,
    deliveryText: en || ar ? { en: en || ar, ar: ar || en } : null,
    cashOnDelivery: input.cashOnDelivery,
  };
}
