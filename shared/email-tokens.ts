/**
 * Single source of truth for marketing-email placeholder tokens. Both the
 * admin editor (token picker chips) and the actual send-time substitution
 * (render.ts) read from this list, so a token can't drift between "what the
 * admin sees offered" and "what actually gets replaced."
 *
 * Templates reference a token by its bracketed label — `[Discount Code]` or
 * `[كود الخصم]` — not a `{{camelCase}}` identifier. Non-technical admins
 * read and insert these directly; there's no syntax to learn.
 */
export interface EmailTokenDef {
  /** Stable identifier — used to look up the resolved value, not shown to the admin. */
  key: "storeName" | "discountCode" | "productName" | "customerName" | "cartTotal";
  labelEn: string;
  labelAr: string;
  descriptionEn: string;
  descriptionAr: string;
}

export const EMAIL_TOKENS: EmailTokenDef[] = [
  {
    key: "storeName",
    labelEn: "Store Name",
    labelAr: "اسم المتجر",
    descriptionEn: "Your store's name",
    descriptionAr: "اسم متجرك",
  },
  {
    key: "discountCode",
    labelEn: "Discount Code",
    labelAr: "كود الخصم",
    descriptionEn: "The promo code attached to this email below",
    descriptionAr: "كود الخصم المرفق بهذا الإيميل أدناه",
  },
  {
    key: "productName",
    labelEn: "Product Name",
    labelAr: "اسم المنتج",
    descriptionEn: "The relevant product for this email",
    descriptionAr: "المنتج المرتبط بهذا الإيميل",
  },
  {
    key: "customerName",
    labelEn: "Customer Name",
    labelAr: "اسم العميل",
    descriptionEn: "The customer receiving this email",
    descriptionAr: "اسم العميل المستلم لهذا الإيميل",
  },
  {
    key: "cartTotal",
    labelEn: "Cart Total",
    labelAr: "إجمالي السلة",
    descriptionEn: "The customer's cart total",
    descriptionAr: "إجمالي سلة العميل",
  },
];

/**
 * Which tokens are actually meaningful for a given automation type — a
 * "Product Name" chip on the welcome email would just render blank, so it's
 * left out rather than offered and silently failing. `discountCode` is only
 * included when the caller says the discount badge is on, matching the
 * template's own "Show discount code badge" toggle.
 */
export function relevantTokenKeysFor(
  automationType: string,
  showDiscountCode: boolean,
): EmailTokenDef["key"][] {
  const base: EmailTokenDef["key"][] = ["storeName"];
  const withDiscount = (keys: EmailTokenDef["key"][]) =>
    showDiscountCode ? [...keys, "discountCode" as const] : keys;

  switch (automationType) {
    case "welcome":
      return withDiscount([...base, "customerName"]);
    case "review_check":
      return [...base, "customerName", "productName"];
    case "abandoned_cart":
      return withDiscount([...base, "cartTotal"]);
    case "abandoned_browse":
      return [...base, "productName"];
    case "win_back":
      return withDiscount([...base, "customerName"]);
    case "new_drops":
      return [...base, "productName"];
    case "flash_offer":
      return withDiscount(base);
    case "retention":
      return base;
    default:
      return withDiscount(base);
  }
}

export function tokenDefsFor(keys: EmailTokenDef["key"][]): EmailTokenDef[] {
  return EMAIL_TOKENS.filter((t) => keys.includes(t.key));
}
