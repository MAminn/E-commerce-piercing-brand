/**
 * GA4_PURCHASE_OWNER — who sends the GA4 `purchase` event.
 *
 *   browser (DEFAULT, and any unknown value) — today's behaviour, unchanged:
 *            gtag on /order-confirmation sends it; the server sends nothing
 *            to GA4 and never touches the GA4 purchase tables.
 *   shadow — the browser still sends it; the server ALSO records a purchase
 *            candidate per verified order (and prepares its payload) but
 *            sends ZERO requests to GA4. For comparing coverage first.
 *   server — the server sends it from the verified order through the
 *            durable outbox; the browser stops sending the GA4 `purchase`
 *            only. Every other GA4 browser event, the Meta pixel, the
 *            /api/track beacon and Meta CAPI are unchanged in every mode.
 *
 * Rollback: set GA4_PURCHASE_OWNER=browser (or remove it) and restart.
 *
 * The REQUESTED mode comes from the env; the EFFECTIVE mode is what the app
 * actually runs. It stays `browser` until the boot readiness check
 * (backend/pixel-tracking/ga4-purchase/readiness.ts) has confirmed the
 * outbox tables and their unique index exist, so a missing migration can
 * never leave a purchase owned by nobody or break checkout. Both the server
 * paths and the flag sent to the browser read the EFFECTIVE mode.
 *
 * Dependency-free on purpose: read by server code and by the SSR flag
 * builder (shared/config/tracking-flags.ts).
 */
export type Ga4PurchaseOwner = "browser" | "shadow" | "server";

export function readGa4PurchaseOwner(
  env: Record<string, string | undefined> = process.env,
): Ga4PurchaseOwner {
  const v = (env.GA4_PURCHASE_OWNER ?? "").trim().toLowerCase();
  return v === "shadow" || v === "server" ? v : "browser";
}

let effective: Ga4PurchaseOwner = "browser";

/** The mode the app is running — `browser` until readiness confirmed more. */
export function effectiveGa4PurchaseOwner(): Ga4PurchaseOwner {
  return effective;
}

/** Set by the boot readiness check only (and by tests). */
export function setEffectiveGa4PurchaseOwner(owner: Ga4PurchaseOwner): void {
  effective = owner;
}

/** Whether the browser should send GA4 `purchase` itself. */
export function browserSendsGa4Purchase(owner: Ga4PurchaseOwner = effective): boolean {
  return owner !== "server";
}
