/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ZELI STOREFRONT SHELL — which chrome and which homepage the store falls back
 * to when the CMS has not chosen one.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The storefront has two independent selectors that decide what a customer
 * sees:
 *
 *   1. `layoutSettings.header.navbarStyle`  → the global shell
 *      (navbar + footer + mobile nav), resolved in layouts/LayoutDefault.tsx
 *   2. `templateSelection.landing`          → the homepage template,
 *      resolved in pages/index/+Page.tsx
 *
 * They can disagree, and their fallbacks used to: the shell defaulted to
 * `"default"` while the homepage defaulted to `"landing-modern"`, and
 * backend/emails/branding.ts separately defaulted to `"landing-minimal"` —
 * so an unconfigured store rendered one personality on the page and pulled
 * its email logo from a different template's settings row.
 *
 * Both fallbacks now come from here, so there is exactly one answer to
 * "what does ZELI look like before an admin touches anything".
 *
 * WHY MINIMAL: it is the only shell in the repo with Arabic/RTL support
 * (non-negotiable for an Egyptian storefront), live search, a mobile bottom
 * nav, and a matching footer — and several features are already hard-wired to
 * it (the coming-soon gate, the /return-policy page, the `product-minimal`
 * product template, the minimal email templates). The alternatives
 * (`default`, `editorial`, `noir`) remain fully available to admins; only the
 * fallback changed.
 *
 * These are FALLBACKS ONLY. A value stored in the database always wins.
 */

import type { NavbarStyle } from "#root/shared/types/layout-settings";

/** Global shell used when `layoutSettings.header.navbarStyle` is unset. */
export const DEFAULT_NAVBAR_STYLE: NavbarStyle = "minimal";

/** Homepage template used when `templateSelection.landing` is unset. */
export const DEFAULT_LANDING_TEMPLATE_ID = "landing-minimal";

/** Product page template used when `templateSelection.productPage` is unset. */
export const DEFAULT_PRODUCT_TEMPLATE_ID = "product-minimal";

/**
 * Resolves the active landing template id from a template-selection map.
 * Use this instead of repeating `selection?.landing ?? "landing-…"`, which is
 * how the three different fallbacks drifted apart in the first place.
 */
export function resolveLandingTemplateId(
  selection: Record<string, string> | undefined | null,
): string {
  return selection?.landing || DEFAULT_LANDING_TEMPLATE_ID;
}

/**
 * True when a navigation href points somewhere real.
 *
 * The template defaults used to seed `"#"` for pages that were never built
 * (About, Careers, Sustainability, Privacy Policy, Terms, Cookies). Those
 * rendered as ordinary footer links that silently did nothing when clicked —
 * worse for a customer than the link simply not being there, and on a store
 * with no published policies, actively misleading.
 *
 * Anything that is blank, `"#"`, or a bare fragment is treated as
 * unconfigured and hidden. Real in-app routes (`/shop`), absolute URLs and
 * `mailto:` / `tel:` links all pass.
 */
export function isUsableHref(href: string | undefined | null): href is string {
  if (typeof href !== "string") return false;
  const trimmed = href.trim();
  if (trimmed === "" || trimmed.startsWith("#")) return false;
  return true;
}

/* ════════════════════════════════════════════════════════════════════════
   ZELI PRODUCTION TEMPLATE PRESET
   ────────────────────────────────────────────────────────────────────────
   One coherent set of template ids for the whole customer journey, so that
   an unconfigured store renders ONE store rather than five different ones.

   Before this existed the code-level fallbacks were scattered: `?? "sorting-
   minimal"` in five page files, `|| "cart-modern"` in the cart page,
   `|| "checkout-modern"` in checkout, `|| "search-results-grid"` in search,
   `?? "category-grid-with-filters"` in the legacy featured routes, and — the
   one nobody could see — `templateConfig[category][0].id` inside
   TemplateContext, which is what a store with an empty `template_selection`
   row actually got. Those five answers disagreed with each other and with
   DEFAULT_LANDING_TEMPLATE_ID.

   THESE ARE FALLBACKS ONLY. A value stored in `store_settings.
   template_selection` always wins — the admin template picker keeps working
   exactly as before. Changing what ZELI looks like out of the box is a change
   to this object and nothing else.

   WHY EACH ID (verified against the implementations, not assumed):

   landing → landing-minimal
     The only landing template whose shell has Arabic/RTL, live search, a
     mobile bottom nav and a matching footer. Already the Phase 1 default.

   home → featured-products-modern
     Inert. No customer route reads `templateSelection.home`; the landing
     templates compose HomeFeaturedProducts directly. Kept at the registry's
     first entry so the admin preview screen still resolves something.

   sorting → sorting-minimal
     `sorting-editorial` wraps itself in EditorialChrome, which renders a
     SECOND footer and only hides the global one from a client-side effect —
     so SSR emits both and one disappears on hydration. Also a different
     visual family from the ZELI shell. sorting-minimal took the Phase 2 token
     pass (its hero band is a ZELI surface, not the old clothing stock photo).

   productPage → product-minimal
     Phase 2 selection. Image-first, guards every fabricated claim behind
     admin-authored content, and is the only product template with the
     ZELI-token gallery and mobile sticky bar.

   categoryPage → category-minimal
     The only category template with no fabricated defaults.
     `category-grid-classic` and `category-hero-split` default their filter
     lists to invented categories and brands (Electronics / Fashion / Apple /
     Samsung, with invented product counts), and `category-grid-with-filters`
     additionally defaults `products` to twenty fabricated products. Those
     defaults are now empty arrays, but category-minimal is still the one that
     never had them.

   cartPage → cart-minimal
     The only cart template that implements the full working prop surface:
     OfferProgressBanner, AppliedOffersSavings, per-line free quantities, the
     promo-code apply/remove/notice cycle and a mobile sticky checkout CTA.
     `cart-editorial` types `onApplyCoupon` as fire-and-forget, drops the
     coupon feedback props entirely, renders no offer UI, and brings the
     double-footer EditorialChrome problem with it. `cart-modern` is complete
     but is a boxed marketplace layout.

   checkoutPage → checkout-modern
     The only checkout wired to the real backend contract: server-driven
     payment methods, Egyptian governorate combobox backed by Bosta's city
     list, building/apartment fields the order schema actually accepts, and
     offer + promo-code totals. `checkout-editorial` is the EditorialChrome
     family again. There is no "checkout-minimal"; this template took the
     ZELI pass instead of a new one being written.

   searchResults → search-results-minimal
     `search-results-grid` ships a sidebar whose three filter groups read
     "Filter options will appear here" / "Price filters will appear here" /
     "Stock filters will appear here" — placeholder scaffolding pointed at
     customers. `search-results-editorial` is the EditorialChrome family.

   NOTE ON /shop AND /categories/[slug]: under the ZELI shell
   (navbarStyle === "minimal") those two routes do not go through the
   `sorting` / `categoryPage` selectors at all — they render
   MinimalCategoryPage, which is the only catalogue UI with the shell's
   Arabic/RTL, pagination and product-card foundation. The preset values above
   are what those routes fall back to if an admin switches the shell away from
   minimal. See docs/CURRENT_PROJECT.md.
   ════════════════════════════════════════════════════════════════════════ */

/** Every selector the template system exposes. */
export type StorefrontTemplateCategory =
  | "landing"
  | "home"
  | "sorting"
  | "productPage"
  | "categoryPage"
  | "cartPage"
  | "checkoutPage"
  | "searchResults";

export const ZELI_TEMPLATE_PRESET: Record<
  StorefrontTemplateCategory,
  string
> = {
  landing: DEFAULT_LANDING_TEMPLATE_ID,
  home: "featured-products-modern",
  sorting: "sorting-minimal",
  productPage: DEFAULT_PRODUCT_TEMPLATE_ID,
  categoryPage: "category-minimal",
  cartPage: "cart-minimal",
  checkoutPage: "checkout-modern",
  searchResults: "search-results-minimal",
};

/**
 * The template id a route should render for `category`.
 *
 * Pass whatever the selector returned (a DB value, `null` while it loads, or
 * `undefined` on a store that has never saved one) and get back the id to
 * render. Use this instead of writing `?? "some-id"` at the call site — that
 * is how the five fallbacks drifted apart in the first place.
 */
export function resolveTemplateId(
  category: StorefrontTemplateCategory,
  selected: string | null | undefined,
): string {
  return selected && selected.trim() !== ""
    ? selected
    : ZELI_TEMPLATE_PRESET[category];
}
