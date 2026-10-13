# Promotions pricing rules — eligible units, set codes, percentage sets

How Percé prices **Pick Your Set** (percentage or fixed), **promo codes**
(including exact-quantity "set codes" such as the planned PICK3 / PICK6),
**automatic offers**, sale prices and shipping — and how they are kept from
discounting the same piece twice.

One implementation serves the cart preview and the authoritative order path:

| Concern | Code |
| --- | --- |
| Unit counting, exact/min/max rules, percentage math, promo eligibility | `shared/pricing/eligible-units.ts` |
| Effective (sale) price rule | `shared/pricing/effective-price.ts` |
| Cart totals, promo plan, discount ownership, shipping | `shared/bundles/cart-pricing.ts` (`planPromo`, `buildOfferInputs`, `computeCartTotals`) |
| Pick Your Set tiers (fixed + percentage) | `shared/bundles/evaluate.ts` (`tierChargeMinor`, `evaluateBundleSelection`) |
| Shipping line incl. promo free shipping | `shared/shipping/checkout-shipping.ts` (`deriveShippingLine`) |
| Server: code eligibility loader | `backend/promo-codes/eligibility.ts` |
| Server: authoritative totals | `backend/orders/create-order/service.ts` |

`CartContext` and `create-order` call the same functions with the same
inputs. The client's prices, discounts and eligibility are never trusted —
create-order re-reads the code, its eligibility, the products and the
shipping rules inside the order transaction and recomputes every total.

## Eligible units

* Eligibility is **product-level** and comes only from admin configuration:
  - promo code: *all products* or *listed products ∪ products in listed
    categories*, then **minus excluded products** (exclusions always win);
  - Pick Your Set: the campaign pool (manual / dynamic / hybrid), unchanged.
* Quantity counts **units**, not cart lines: 3 × one SKU = 3 eligible units.
* Non-eligible products never count toward a quantity rule and never receive
  the discount. In a mixed cart they stay at their normal (effective) price.
* Nothing is excluded by price. The fixed 3-piece sets (~250 EGP) are kept
  out of PICK3/PICK6 by **excluding those products** on the code (and by
  leaving them out of a Pick Your Set pool).

## Quantity rules (promo codes)

Stored as `promo_code.eligible_min_quantity` / `eligible_max_quantity`
(inclusive; null = unbounded). Admin picks a rule type:

| Rule type | Stored | Example |
| --- | --- | --- |
| No rule | null / null | every pre-existing code |
| Exactly N | N / N | PICK3 = 3/3, PICK6 = 6/6 |
| At least N | N / null | |
| At most N | null / N | |
| Between | min / max | |

Automatic offers' *Min Quantity* condition gained the same optional maximum
(`condition.maxQuantity`, JSONB — no migration). Offers without it behave
exactly as before.

## Percentage math and rounding

A percentage is applied to an eligible **subtotal** in integer piasters and
rounded **once, half-up**, to 0.01 EGP (`percentOfMinor`). It is never
rounded per unit, so the receipt always adds up.

> 6 eligible pieces = 1,075.00 · 15% = **161.25** · products after discount
> = **913.75** · PICK6 shipping on a deliverable destination = **0**.

## Sale-price rule (explicit)

The base for every percentage — Pick Your Set percentage tiers and
percentage promo codes — is the unit's **effective price**:

* a **valid** sale price (`discount_price` present, ≥ 0 and **strictly below**
  `price`), otherwise the regular price, plus option modifiers.

This is the price the storefront displays and the shopper would otherwise
pay, and the base fixed-price bundle savings, automatic offers and promo codes
already used. The percentage is therefore applied **to the sale price**, never
to the pre-sale regular price as well: a 200 EGP piece on sale at 150 inside
PICK3 gets 20% of 150 (30), and the shopper pays 120. The sale is a catalogue
price, not a promotion; the promotion engine still applies at most one
promotional discount per unit (see below).

`effectiveUnitPrice()` is now the only implementation. Before this change the
order path charged `discount_price ?? price`, which differed from the
displayed price only for a misconfigured row (a "sale" price at or above the
regular price). It now charges what the page shows.

If the merchant does not want sale items in a PICK offer at all, exclude
those products from the code / leave them out of the set's pool.

## Exact stacking rule — one promotional discount per unit

1. **Bundles own their units.** A unit inside a Pick Your Set / Ready Set
   instance is priced by that bundle.
   * `exclusive` (default; **mandatory for percentage-priced sets**): the
     bundle is invisible to automatic offers and promo codes — its units
     neither count toward their conditions nor receive their discounts.
   * `stackable` (fixed-total only, explicit merchant opt-in, unchanged):
     offers and *ordinary* promo codes may discount the bundle price.
2. **Set codes own their units.** A promo code with a quantity rule is a
   *set code* (PICK3, PICK6). It counts and discounts **ordinary cart lines
   only** — never units already inside any bundle, exclusive or stackable.
   While it qualifies, its eligible lines are **removed from the automatic
   offer engine's input**, so no offer can discount them or be triggered by
   them (this is also what stops an old "free shipping on 2+ pieces" offer
   from overriding PICK3's normal shipping). Unrelated lines in the same cart
   remain visible to offers.
3. **Ordinary promo codes** (no quantity rule) keep the pre-existing
   sequential rule: they apply after automatic offers, to their eligible
   value minus that value's pro-rata share of the offer discount. For an
   all-products code this is exactly the old `(subtotal − offers) × %`.
   Change: a code restricted to products/categories now discounts **only**
   its eligible value (it used to discount the whole cart once any eligible
   product was present).
4. Exclusive / priority between automatic offers is unchanged.

Consequences: entering through a percentage Pick Your Set and then applying
the equivalent code never discounts the same pieces twice — the code finds no
loose eligible pieces and is refused ("doesn't apply to any of the items",
with a hint that pieces inside a set don't count). A cart with a set *and*
six further loose pieces gets one discount on each group.

## Shipping

* Shipping is quoted per governorate by the existing service. An
  **unavailable destination is refused before any pricing** (create-order)
  and stays "unavailable" in the cart — free shipping can never create a
  shipping option.
* A qualifying code with **Free shipping** (`promo_code.free_shipping`)
  zeroes an *available* quote for the whole order. PICK3 without it pays the
  normal governorate fee.
* A **Pick Your Set** campaign with **Free shipping**
  (`bundle_campaign.free_shipping`, migration `0062`, default off) does the
  same whenever a valid instance of it is in the cart — fixed or percentage
  pricing, no code needed. It is part of the set's own benefit, so it applies
  even though percentage sets are exclusive; it never discounts an item, and
  unrelated items in the cart keep their price. Ready Sets are kept out of
  scope (always stored off): a curated stack is a single fixed-price product
  in the cart, and the requirement was the shopper-built set.
* Several free-shipping sources (set, offer, code) zero the fee **once**; the
  total never changes twice.
* The order snapshot records who waived the fee:
  `shipping_quote.freeShippingSource = "bundle" | "offer" | "promo_code"`
  (bundle reported first), and `order_bundle.free_shipping` marks the set.
* The checkout sends the fee it displayed (`expectedShippingFee`); a mismatch
  is a 409, so a cart that lost PICK6 can't silently be charged shipping it
  never saw (and vice versa).

## Revalidation

| When | What re-runs |
| --- | --- |
| Code applied | `promoCode.validate`: status, dates, limits, minimum, eligible units, quantity rule |
| Cart quantity change / item removed / item added | `CartContext` re-validates the code (removed with a reason if PICK6 drops to 5 or rises to 7) and re-evaluates offers on the non-owned lines |
| Governorate change | new quote; promo / set free shipping only zeroes an available one |
| Set added / removed / cart restored | `CartContext` re-checks every set with `bundle.evaluateSelection` and takes its free-shipping flag from the live campaign |
| Checkout start (page load) | saved code re-validated against the saved cart |
| Order creation | everything above, again, from the database, inside the transaction; totals recomputed |

## Pick Your Set — percentage pricing

* `bundle_campaign.pricing_type = 'percentage_discount'`; each
  `bundle_campaign_tier` row carries `discount_percent` (and a null `price`).
* A selection must match a tier's piece count **exactly** (3 → 20%,
  6 → 15%); duplicate / max-per-product / repeatable rules are unchanged.
* Bundle total = selected effective subtotal − percentage (rounded once).
* Ready Sets stay fixed-price only; percentage sets are always exclusive.
* Orders snapshot `order_bundle.pricing_type` and `discount_percent`.
* The builder shows, live: selected subtotal, discount %, discount amount,
  set total — produced by the same evaluator the server re-runs.

## Configuring PICK3 / PICK6 (not done by this change)

Nothing creates or activates these campaigns. When ready, in **Promo Codes**:

| | PICK3 | PICK6 |
| --- | --- | --- |
| Discount | Percentage 20 | Percentage 15 |
| Quantity rule | Exactly 3 | Exactly 6 |
| Free shipping | off | **on** |
| Applicability | the single-piece categories/products | same |
| Excluded products | the fixed 3-piece sets | same |

…or, for the browse-and-pick experience, **Pick Your Set** campaigns in
*Percentage discount* mode (pool without the 3-piece sets): a 3-piece / 20%
campaign with Free shipping **off**, and a 6-piece / 15% campaign with Free
shipping **on**. Free shipping is per campaign, so PICK3 and PICK6 are two
campaigns if only one of them ships free.
