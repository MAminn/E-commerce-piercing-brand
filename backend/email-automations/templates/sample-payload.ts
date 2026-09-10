import type { EmailAutomationType } from "../queue/service";

/**
 * Realistic placeholder data for admin preview/test-send — never used for
 * real sends (those get real payload from the trigger logic). Doesn't
 * include discountCode: that token always resolves from the template's
 * actually-attached promo code (see templates/service.ts), so preview shows
 * the truth — the real code, or blank if none is attached yet — rather than
 * a fake value that could look fine here and be wrong on a real send.
 */
export function buildSamplePayload(
  automationType: EmailAutomationType,
  stepKey: string,
): Record<string, unknown> {
  switch (automationType) {
    case "welcome":
      return { customerName: "Alex" };
    case "review_check":
      return {
        customerName: "Alex",
        productName: "Oud Royal Eau de Parfum",
        productImageUrl: "",
        productSubtitle: "100ml · Delivered",
      };
    case "abandoned_cart":
      return {
        step: stepKey,
        items: [
          {
            name: "Oud Royal Eau de Parfum",
            imageUrl: "",
            subtitle: "100ml",
            priceLabel: "$79.00",
          },
        ],
        cartTotal: "$79.00",
      };
    case "abandoned_browse":
      return {
        productName: "Amber Nights",
        productImageUrl: "",
        productSubtitle: "50ml",
      };
    case "win_back":
      return { customerName: "Alex" };
    case "new_drops":
      return {
        productName: "Midnight Bloom",
        productImageUrl: "",
        productSubtitle: "New arrival",
      };
    case "flash_offer":
      return {};
    case "retention":
      return {};
  }
}
