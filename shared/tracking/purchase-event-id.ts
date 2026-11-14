/**
 * The event id of an order's Purchase (`checkout_completed` → Meta
 * `Purchase`): `purchase-<orderId>`.
 *
 * The browser pixel (frontend/tracking/purchase-event.ts) and the server's
 * CAPI relay (backend/pixel-tracking/delivery-pipeline.ts) must agree on it
 * exactly, which is what lets Meta deduplicate the two copies. It lives in
 * shared/ because that is code the production server can load: the server's
 * `#root/*` imports resolve to the unbuild output in ./build, which only holds
 * server/, shared/ and backend/, so a server import of frontend/ fails at
 * startup (ERR_MODULE_NOT_FOUND).
 */
export const purchaseEventId = (orderId: string) => `purchase-${orderId}`;
