# ZELI catalogue requirements

> Derived by reading the live schema and the admin create/edit paths, not from
> assumption. Sources:
> [`shared/database/drizzle/schema.ts`](../shared/database/drizzle/schema.ts),
> [`backend/categories/create-category/create-category.ts`](../backend/categories/create-category/create-category.ts),
> [`backend/products/create-product/service.ts`](../backend/products/create-product/service.ts),
> [`pages/dashboard/products/components.tsx`](../pages/dashboard/products/components.tsx).
>
> This document lists **what the system requires**. It contains no example ZELI
> products, prices, categories or copy — none exist yet, and inventing them is
> exactly what this document is meant to prevent.

---

## 1. Load order

Categories must exist before products: `product.categoryId` is a `NOT NULL`
foreign key, and product creation additionally requires `categoryIds` to have
**at least one** entry.

```
1. Upload category images   →  2. Create categories
3. Upload product images    →  4. Create products
5. Set homepage merchandising (featured / new / curated picks)
```

---

## 2. Categories

Table `category`. Created via **Dashboard → Categories**.

| Field | Required | Notes |
|---|:--:|---|
| `name` | **Yes** | Max 255 chars. Displayed on the homepage tile and the category page `<h1>`. |
| `imageId` | **Yes** | A `file` row id — **you must upload an image first; a category cannot be created without one.** |
| `type` | **Yes** | Max 255 chars, free text. Legacy grouping key (`men`/`women`/`general`). Use one consistent value, e.g. `general`. |
| `slug` | auto | Generated from `name` via the `slug` package. Not editable in the admin UI. |
| `showOnLanding` | default `true` | Controls whether the category appears in the homepage "shop by" rail. |
| `deleted` | default `false` | Soft delete. |

**Not supported by the schema** — do not plan around these:

- **No nested / parent categories.** `category` has no `parentId`. The list is flat.
- **No manual category sort order.** `viewCategories` has no `ORDER BY`, so
  display order is whatever Postgres returns. The homepage takes the **first 8**
  after filtering. If order matters, that needs a schema change (deferred — it
  would be a migration).
- **No per-category SEO fields** (no meta title/description column).

### Image specification

The homepage tile and the category page both render a **4:5 portrait** crop,
`object-cover`, `object-position: center`.

- Supply **portrait** images. A landscape photo will be centre-cropped and lose its edges.
- Recommended: **1200 × 1500 px**, JPG or WebP.
- The tile places the category name over a dark gradient scrim across the
  bottom ~40%: keep that area free of critical detail.

### Placement categories

The homepage renders whatever enabled categories exist — nothing is hardcoded.
Candidate placements (Ear, Nose, Belly, Lip, Fake Piercings) are **a business
decision, not created in code**. Create only the ones actually launching.

---

## 3. Products

Table `product`. Created via **Dashboard → Products**.

### Required

| Field | Notes |
|---|---|
| `name` | Max 255 chars. |
| `description` | **Non-empty**, max 3000 chars. There is no "no description" path — the product page renders it as the Description accordion. |
| `imageId` | Primary image `file` id. Upload first. |
| `categoryId` | Primary category. |
| `categoryIds[]` | At least one. Drives `/categories/[slug]` listings. |
| `price` | Number, **0–10000**. See the price-cap note below. |
| `stock` | Integer, 0–10000. `stock > 0` is what makes a product purchasable — `available` is derived, not stored. |

### Optional

| Field | Notes |
|---|---|
| `discountPrice` | 0–10000. Renders a struck-through original + a SALE badge — **only when it is genuinely lower than `price`.** |
| `productImages[]` | Extra gallery images, each `{ id, isPrimary }`. Order via `sortOrder` on `product_image`. |
| `variants[]` | `{ name, values[] }`, where a value may be a plain string or `{ value, priceModifier, enabledOverride }`. Use for size/gauge/length/material. |
| `sortOrder` | Integer. Lower shows first within a category. |
| `hidden` | Hides from the public shop while keeping the row. Useful for staging a product before launch. |
| `inspiredBy` | Free text, supports `[color:#hex]text[/color]`. |
| `bestLayeredWithIds[]` | Admin-picked related product ids for the product page rail. Falls back to category-based suggestions. |
| `slug` | Auto-generated, unique. |

### Not available — plan around these

- **No SKU column.** The premium product template displays a `sku` field, but
  nothing persists it. Do not build an SKU-based process without a migration.
- **No `isNew` / `tag` column.** The product card can show a NEW badge, but the
  flag is not stored on `product` — "new" is derived from `createdAt` ordering
  in the New Arrivals query. There is no manual "mark as new" switch.
- **No bestseller / popularity field.** Nothing in the schema supports a
  "bestseller" badge. It would have to be invented, so it is not offered.
- **No per-product SEO fields** (no meta title/description/OG image column).
- **No weight/dimensions, no cost price, no barcode.**
- **`fragranceInfo`** exists (a perfume-era JSON column: scent notes,
  longevity, concentration). **Leave it empty for every ZELI product.** Filling
  it makes a "Scent Notes" accordion appear on the product page.

### Price cap

`price` and `discountPrice` are validated as `0–10000` in
`createProductSchema`. In EGP that caps a product at **10,000 EGP**. If any
ZELI piece is priced above that, the limit must be raised before load — it is a
Zod bound in application code, not a DB constraint, so it is a small change and
**not** a migration.

### Image specification

Product cards render a **4:5 portrait** crop, `object-cover`. The product page
gallery renders the same images at larger sizes.

- Supply **portrait** images, consistent crop across the catalogue — a mixed
  set of square and portrait shots is what makes a jewelry grid look untidy.
- Recommended: **1400 × 1750 px**, JPG or WebP, consistent background.
- The first/primary image is what appears in every rail and grid. Shoot it as
  the hero angle.
- `alt` text is the product `name` — no separate alt field, so names should
  read sensibly out loud.

---

## 4. Homepage merchandising

Set in **Dashboard → Homepage**, stored as JSON in `homepage_content.content`
(no migration needed to change what is stored).

| Section | Data source | Behaviour when empty |
|---|---|---|
| Hero | CMS `hero` — title, subtitle, CTA text/link, `heroSlides[]` (desktop + mobile image, link, alt) | Hidden |
| Shop by placement | Live categories where `showOnLanding` is true, first 8 | Hidden |
| New Arrivals | Newest products by `createdAt` | Hidden |
| Featured | CMS `featuredProducts.productIds[]`; falls back to a general product query | Hidden |
| Editorial / brand block | CMS `brandStatement` — title, description, image | Hidden |
| Curated rail | CMS `discountedProducts` — products with a real `discountPrice` | Hidden |
| Stack inspiration | CMS `bottomCarousel.slides[]` — image, mobile image, link, alt | Hidden |
| Testimonials | CMS `testimonials.items[]` — **real reviews only** | Hidden |

Every section hides when its data is absent. There are no placeholder cards.

---

## 5. How to load the initial catalogue

**Recommended: (A) the existing admin dashboard.**

The admin already covers everything required: file upload, category CRUD,
product CRUD with multi-image and variants, plus homepage merchandising. For a
launch catalogue in the tens of products this is the safest route — it runs the
same Zod validation, slug generation, `product_category` join writes and audit
logging (`category_log`) as any other write, inside the same transaction.

**(B) The existing import mechanism does not fit.** `backend/env-sync/` is a
whole-database `pg_dump`/`pg_restore` snapshot tool for pulling production down
into dev. It is superadmin-only, **blocked when `NODE_ENV=production`**, and is
an irreversible full-database overwrite. It is not a catalogue importer and
must not be used as one.

**(C) A purpose-built importer is not justified yet.** It would have to
re-implement image upload, slug uniqueness, the `product_category` join and the
variant shape — real risk for no benefit at this volume. Revisit only if the
catalogue is large enough that manual entry is genuinely impractical, and even
then it should call the existing tRPC mutations rather than write SQL.

---

## 6. Pre-load checklist

- [ ] Final list of placement categories actually launching
- [ ] One portrait image per category (1200×1500)
- [ ] Product list: name, description, price (EGP), opening stock
- [ ] Variant axes per product, if any (gauge / length / material)
- [ ] Which products carry a genuine discount, and the discounted price
- [ ] Product photography, portrait, consistent crop (1400×1750)
- [ ] Which products are Featured on the homepage
- [ ] Confirm no ZELI product exceeds the 10,000 EGP validation cap
