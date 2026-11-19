import { getAvailablePaymentMethods } from "#root/shared/config/payment";
import {
  buildShippingPolicyFacts,
  type ShippingPolicyFacts,
} from "#root/shared/shipping/shipping-policy";
import { getProductPageContentRaw } from "#root/backend/settings/get-product-page-content";
import { getShippingRulesRaw, type SelectableDb } from "./rules-store";

/**
 * /shipping-policy facts from the live settings rows. Null when they cannot
 * be read: the page then says it is unavailable rather than falling back to
 * defaults that might not match checkout (a missing rules row reads as
 * "free flat delivery", which a database error must never claim).
 */
export async function getShippingPolicyFactsRaw(
  db: SelectableDb,
): Promise<ShippingPolicyFacts | null> {
  try {
    const [stored, pageContent] = await Promise.all([
      getShippingRulesRaw(db),
      getProductPageContentRaw(db),
    ]);
    return buildShippingPolicyFacts({
      rules: stored.rules,
      flatFee: stored.flatFee,
      shippingText: pageContent.shippingText,
      shippingTextAr: pageContent.shippingTextAr,
      cashOnDelivery: getAvailablePaymentMethods().includes("cod"),
    });
  } catch (error) {
    console.error("[shipping-policy] could not read shipping settings:", error);
    return null;
  }
}
