# ERP integration — read-only export API

The ERP (repository `erp-multi-tennat`, tenant "Percé") is the financial and
inventory source of truth. This store stays the system of record for what a
customer ordered. The ERP **pulls** from this store; nothing in checkout, the
admin, or any order path calls the ERP, so the shop behaves identically whether
the ERP is up, down, or not configured.

Full architecture, accounting decisions and go-live plan:
`erp-multi-tennat/docs/perce-erp-integration.md`.

## Switching it on

| Env var | Effect |
| --- | --- |
| `ERP_SYNC_TOKEN` unset or < 32 chars | The routes below are **not registered** (404). Default. |
| `ERP_SYNC_TOKEN` set (≥ 32 chars) | Routes answer `Authorization: Bearer <token>` only. |

The same value is configured on the ERP as `STOREFRONT_SYNC_TOKEN_PERCE`. No
database migration is involved.

## Endpoints (`/api/erp/v1`, GET only, `Cache-Control: no-store`)

| Endpoint | Returns |
| --- | --- |
| `orders/digest?after=<orderNumber>&limit=<≤1000>` | `{ orders: [{ id, orderNumber, version }], nextCursor }` — `version` is a SHA-256 of the order's export, so ANY exported change (status, lines, courier, activity log) changes it. |
| `orders?ids=<uuid,…>` (≤ 100) | Full exports. Unknown ids are omitted (that is how the ERP sees a hard delete). |
| `products` | Catalogue with `internalCode` (merchant SKU), `costPrice` (informational), sellable `stock`, hidden/deleted flags, option-group names. |

Code: `backend/erp-sync/` (`export-service.ts` is the contract, `api.ts` the
routes, `auth.ts` the token check). Tests: `backend/erp-sync/__tests__/`.

## What is exported — and what is not

Exported per order: number, timestamps, status, payment method/status, amounts
as decimal strings (`subtotal`, combined `discount`, `shipping`, `tax`,
`total`), Set snapshots, courier provider/tracking/raw status, the activity log
(action, old/new status, time) and lines (SKU snapshot, quantity, list/sale
price, the unit price the checkout charged before order discounts, options,
Set reference).

Customer data is limited to **name, phone, governorate and city** — what is
needed to recognise an order on a courier statement. Email, street address,
order notes and activity-log notes are never exported.

## Things in this store the ERP relies on — please keep in mind

- `order.total` is what the courier collects; the ERP treats it as the trusted
  figure and derives the effective discount from it.
- A COD order's `payment_status` stays `not_required`: the ERP never reads
  "delivered" as "paid".
- Hard-deleting an order or editing its lines **after delivery** is detected by
  the ERP and raised as an error for a person, but cannot be undone there
  automatically. Prefer cancelling/archiving, and avoid editing delivered orders.
