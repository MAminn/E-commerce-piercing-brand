import type { PopupConfig, PopupDiscountConfig } from "#root/shared/database/drizzle/schema";

export const DEFAULT_POPUP_CONFIG: PopupConfig = {
  enabled: false,
  imageUrl: "",
  titleEn: "Become a Member",
  titleAr: "انضم إلينا",
  descriptionEn:
    "Join our member club and be updated on our new products and special offers.",
  descriptionAr: "انضم لعضويتنا وكن أول من يعرف عن منتجاتنا الجديدة وعروضنا الخاصة.",
  submitLabelEn: "Subscribe",
  submitLabelAr: "اشترك",
  successMessageEn: "You're in! Use code {{code}} for 5% off your first order.",
  successMessageAr: "تم! استخدم الكود {{code}} للحصول على خصم 5% على أول طلب لك.",
  dismissLabelEn: "No thanks",
  dismissLabelAr: "لا شكراً",
  dismissHref: "",
  collectPhone: true,
  phoneRequired: false,
  triggerDelaySeconds: 5,
  triggerScrollPercent: 0,
  triggerExitIntent: false,
  reshowAfterDays: 14,
};

export const DEFAULT_POPUP_DISCOUNT_CONFIG: PopupDiscountConfig = {
  promoCodeId: null,
  codeMode: "existing",
};
