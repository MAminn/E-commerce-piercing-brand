/**
 * Where the storefront social-proof toast is allowed to appear.
 *
 * Kept out of the component so the rules are plain data that can be read and
 * tested on their own — a mistake here shows someone else's order on the
 * checkout page, which is the one place it must never be.
 */

/**
 * Surfaces the toast must never appear on.
 *
 * Two kinds of route: places where the visitor is transacting or dealing with
 * their own account (checkout, cart, confirmation, auth, account) — pushing
 * someone else's order across those screens is a distraction at best — and
 * chrome-less surfaces (`/dashboard`, `/links`) that are not the storefront.
 */
export const SOCIAL_PROOF_EXCLUDED_PREFIXES = [
  "/dashboard",
  "/checkout",
  "/cart",
  "/order-confirmation",
  "/login",
  "/register",
  "/forgot-password",
  "/account",
  "/links",
  // Percé-only account/auth surfaces (no Mach equivalent): the customer's
  // own order history and the token-link pages reached from emails.
  "/orders",
  "/reset-password",
  "/verify-email",
  "/unsubscribe",
  "/template-preview",
] as const;

/**
 * Prefix match on whole path segments, so `/cart` and `/cart/anything` are
 * both excluded while a product legitimately slugged `/shop/cart-stack` is
 * not caught by the `/cart` entry.
 */
export function isSocialProofExcludedRoute(pathname: string): boolean {
  return SOCIAL_PROOF_EXCLUDED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * The product detail route is `/shop/@productId` — exactly one segment below
 * /shop. Below `md` (768px) Percé's Premium PDP mounts its sticky Add to bag bar, so the toast
 * has to be lifted clear of it.
 */
export function isProductDetailRoute(pathname: string): boolean {
  return /^\/shop\/[^/]+\/?$/.test(pathname);
}
