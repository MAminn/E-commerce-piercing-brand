import type { EmailAutomationType } from "../queue/service";
import { formatMoney } from "#root/shared/pricing/format-money";

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
        productName: "Threadless labret",
        productImageUrl: "",
        productSubtitle: "Gold · Delivered",
      };
    case "abandoned_cart":
      return {
        step: stepKey,
        items: [
          {
            name: "Threadless labret",
            imageUrl: "",
            subtitle: "Gold",
            priceLabel: formatMoney(270),
          },
        ],
        cartTotal: formatMoney(270),
      };
    case "abandoned_browse":
      return {
        productName: "Flat back stud",
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
