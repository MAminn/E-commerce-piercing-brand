# SYNT — Change Request Test Manual

Covers every item from `docs/synt-new-changes.md` plus the WhatsApp clarifications with your client. One item remains deferred:
- Telegram bot (addition #4) — left for last, on hold.

The sticky mobile bottom nav (addition #6) is now built, based on the reference screenshot you sent.

## Refinement round 3 (this update)

Your latest two notes:
1. "the add to cart button isn't matching what they want" — the shop-grid product card's Add to Cart button now shows a small cart icon next to the text, matching your reference image (`components/template-system/minimal/MinimalProductCard.tsx`).
2. "all the info i put in while making the product isn't showing... nothing can be fixed or hardcoded" — this was actually **two real bugs plus one missing feature**, now all fixed:
   - **Root cause bug**: the product detail page (`pages/featured/products/@productId/+Page.tsx`) was fetching `fragranceInfo` from the backend but never passing it down to the page template. Every fragrance field you filled in from the admin (tagline, notes, ingredients, badges, scent intensity, gender, etc.) was silently dropped before it ever reached the Scent Notes / About accordion. Fixed — it now flows through end-to-end. Please retest by editing a product's fragrance info and confirming it renders correctly on that product's page.
   - **Hardcoded text removed**: the Shipping, Returns, and FAQs accordion sections were static text baked into the code — not editable anywhere. There is now a new **"Product Page Content"** card on `/dashboard/settings` where you can set the Shipping text, Returns text, and add/edit/remove as many FAQ question/answer pairs as you want (English + optional Arabic for each). If you leave them blank, the product page falls back to the previous default text, so nothing breaks if you don't touch it.

## Refinement round 2

Based on your first round of testing, this update adds/fixes:
1. **Review detail modal** — click any row (or the new eye icon) in `/dashboard/reviews` to see the full comment and a larger photo, with Approve/Reject actions right there too.
2. **Mobile menu language toggle** moved to the very bottom, directly above Logout (previously it sat right after the nav links).
3. **Product page info section rebuilt as accordions** — Scent Notes, About, Shipping, Returns, FAQs, Details, and Best Layered With, matching the dossier-style reference you sent. New fields (tagline, ingredients, badges, scent intensity, gender) were added to the product schema and admin form.
4. **Quantity stepper moved inline** next to Add to Cart (same row), Buy Now stays full-width below — matching your reference image.
5. **New homepage "scroll to products" button** — a floating arrow-up button that appears once you scroll down the landing page and smoothly scrolls back to the products section, per your screenshot.
6. Re-checked the sticky Add-to-Cart bar code — no bug found. It's possible it wasn't showing before simply because the product page wasn't tall enough to scroll past the buttons; the new accordion section makes the page substantially taller, so please retest.

**On the OpenGraph question**: the site-wide fix (proper `og:image:width`/`height`/`type` tags so WhatsApp/Facebook/iMessage render your logo correctly) is done and verified in the build. The known limitation is unchanged — individual product links still show the generic site preview, not that product's own photo, since there's no per-product preview page yet. That's a separate, larger feature; let me know if you want it built.

## Before you test

Three new database migrations were generated but **not applied** (no reachable Postgres instance in the environment these were written in):

```
shared/database/migrations/0038_sour_red_ghost.sql   — review status + image
shared/database/migrations/0039_pale_lord_tyger.sql  — product fragrance info
shared/database/migrations/0040_concerned_mach_iv.sql — order stock-restore flag + edit log action
shared/database/migrations/0041_optimal_eternity.sql  — product page content (shipping/returns/FAQ text)
```

Run `npm run drizzle:migrate` against your real database before testing anything below. `npm run typecheck` and `npm run build` both pass cleanly as of this change set.

---

## 1. Sales-by-day filter — `/dashboard/orders`

1. Open the Orders page as admin.
2. Next to the status filter, use the new date dropdown: **All Time / Today / Yesterday / Specific day…**.
3. Pick "Today" — the order list should narrow to only today's orders, and a line should appear under the filters: *"Sales for today: X.XX EGP across N orders."*
4. Pick "Specific day…" and choose a date with known past orders — verify the count/total match your expectations for that date.
5. Switch back to "All Time" — the summary line disappears and the full list returns.

## 2 & 3. Reviews — image upload + approve/reject moderation

**Public side (product page):**
1. Open any product page → Reviews section → "Write a Review".
2. Fill in name, star rating, comment, and attach a photo (JPEG/PNG/WebP only, under 5MB) — a thumbnail preview should appear with an "Uploading…" state briefly, then a small ✕ to remove it.
3. Submit. You should see a toast confirming the review was received and **will appear once reviewed** — note it does **not** show up in the public list yet.

**Admin side (`/dashboard/reviews`):**
4. Open the Reviews dashboard — your new review should appear with a **Pending** badge, its photo thumbnail, and green ✓ / red ✕ action buttons.
5. Click ✓ to approve — badge turns **Approved**.
6. Go back to the product page — the review (with photo) should now be publicly visible.
7. Try rejecting a different review — its badge turns **Rejected** and it should never appear publicly.
8. Confirm the old delete (trash icon) still works independent of status.

⚠️ Note: reviews that existed **before** this migration were auto-marked "approved" during migration so they don't silently vanish — spot check a couple of old reviews are still visible publicly after migrating.

## 4. Fragrance info section — product page + admin

1. In `/dashboard/products`, edit any product — scroll to the new **"Fragrance Info (Optional)"** box: About text, Longevity, When to Use, Concentration, Top/Middle/Base Notes.
2. Fill a few fields in and save.
3. Open that product's public page — a new section should render below the description (no icons), showing the About paragraph and label/value rows for whichever fields you filled in. Empty fields don't render at all.
4. Edit the product again and clear all fragrance fields, save — the section should disappear from the product page entirely.

## 5. Offer bar (marquee) color — `/dashboard/admin/homepage`

1. Open the homepage admin page → **Scrolling Marquee** card.
2. Enable it, set some text, then use the new **Background Color** and **Text Color** pickers (color swatch + hex text input, both work interchangeably).
3. Save, then view the live storefront — the scrolling marquee bar at the top should reflect your chosen colors exactly (not the default black/white).
4. Clear the color fields and save — it should fall back to the default white background / black text.

## 6. Category nav flattened + language bar removed

1. View the storefront desktop nav — categories that were previously a hover-dropdown should now render as flat, individual links in the top nav (no dropdown/chevron).
2. Confirm the **top strip showing the language toggle + contact email above the marquee/nav is gone entirely** — that floating bar no longer renders anywhere.
3. Open the mobile hamburger menu — categories should be a flat list (no accordion/expand arrows), and the language toggle should still be present near the bottom of that menu, alongside My Account / Orders / Wishlist (if logged in).
4. Toggle the language from the mobile menu — confirm it still works (switches EN/AR, RTL layout flips).

## 7. Sticky "Add to Cart" on scroll

1. Open any in-stock product page on a tall viewport (or shrink the window).
2. Scroll down past the main Add to Cart / Buy Now buttons — a slim bar should slide up from the bottom showing the product thumbnail, name, price, an outline "Add to Cart" button and a red "Buy It Now" button.
3. Add the item to your cart from this bar — it should show "N in cart" next to the price once added.
4. Scroll back up — the bar should slide back out of view once the main buttons are visible again.
5. ⚠️ Also add an item to the cart from a *different* page first, then visit a product page and scroll — check whether the existing global cart-nudge pill (bottom-of-screen, shows cart total/offers) visually overlaps this new bar. They weren't explicitly coordinated; flag it if it looks bad and I'll adjust the stacking.

## 8. Buy Now button (quick checkout)

1. On a product page, below "Add to Cart", confirm a red **"Buy It Now"** button is present.
2. Click it with a product in stock and all variants selected — it should add the item to your cart and take you straight to `/checkout`, skipping the cart page.
3. Try it with an unselected required variant — button should be disabled until a variant is chosen.

## 9. In Stock / Inspired By — bolder text

1. Open a product page — "In Stock" (or "Out of Stock") text and the "Inspired by" line (if the product has one) should both read visibly larger and bolder than before.

## 10. Footer alignment

1. Scroll to the footer on both desktop and mobile.
2. Confirm the logo/description column and all link-group columns (Discover, Help, etc.) are consistently **left-aligned** on both breakpoints — previously they were centered on mobile and left-aligned only on desktop.

## 11. Order item-count bug fix — `/dashboard/orders`

1. Find (or place) a test order containing multiple **quantities** of a product (e.g. 2× Synt Imagine) alongside another product (e.g. 1× Black Opium) — 3 total units across 2 distinct products.
2. In the orders **list** (both desktop table and mobile card view), confirm it now reads **"3 items"**, not "2 items" — matches your original bug report exactly.

## 12. Order edit-after-submission + stock adjustment

1. Open an order's details (desktop only — this control isn't in the mobile order-details sheet yet) and click **"Edit Items"**.
2. Change a line item's quantity up or down using the new number inputs; the line/row total updates live.
3. Click **Save Changes** — a toast confirms, and the dialog closes.
4. Verify in `/dashboard/products` that the product's stock changed by exactly the delta (increase quantity → stock goes down further; decrease quantity → stock is released back).
5. Try increasing a quantity beyond available stock — should get a clear error and no partial update.
6. Set an item's quantity to 0 and save — that line should be removed from the order (as long as at least one item remains; you can't edit an order down to zero items this way).
7. **Bugfix check**: cancel a *different* order (via the status dropdown) that has never been edited — go check the ordered products' stock increased by the cancelled quantities. Previously, cancelling silently lost that stock forever.
8. Repeat the same check by **deleting** an order (trash icon) that was never cancelled — stock should be restored on delete too, and only once (cancel-then-delete the same order won't double-restore).

## 13. Sticky mobile bottom nav (new — from your screenshot)

1. On mobile width, browse the storefront — a 5-tab bar (Home / Shop / Wishlist / Offers / Cart) should be fixed to the bottom of the screen, with badge counts on Wishlist and Cart when non-empty.
2. Tap each tab — confirm navigation and that the active tab is visually highlighted (darker icon/text).
3. Add something to your cart, then scroll a product page — confirm the black cart-nudge pill (if it appears) and, separately, the sticky Add-to-Cart bar from #7 both now sit **above** this new bottom bar rather than overlapping it.
4. Go to `/checkout`, `/login`, or `/register` — the bottom bar should disappear on these pages (matches how the existing cart-nudge pill already behaves). It **stays visible** on `/cart` itself — flag it if you'd rather it hide there too.
5. ⚠️ Open question: **"Offers" has no dedicated public page** — it currently links to `/shop` as a placeholder. Let me know if you want a real Offers page (listing active promotions) or a different destination.

## 14. OpenGraph link preview

1. Share your homepage/product URL somewhere that renders link previews (WhatsApp, Slack, or a validator like Facebook's Sharing Debugger / opengraph.xyz).
2. Confirm the preview card now renders your site logo/image properly sized, instead of a blank/broken image.
3. Known limitation: this only fixes the *site-wide* preview image (your header logo) — individual product links still show the generic site preview, not that product's own photo. That's a larger feature (a per-product preview) that wasn't in scope here; let me know if you want it built separately.

---

## Known trade-offs / things I intentionally left out

- **Review moderation** has no rate limiting on the public image-upload endpoint — it's capped at 5MB, image-only, and always re-encoded, but there's no throttling against spam uploads. Fine for now given a single-shop, low-traffic site; worth revisiting if abuse shows up.
- **Fragrance info** admin form only has English inputs for now (Arabic fields exist in the database and will render correctly if set via the API, just not exposed in the admin UI yet).
- **Order item editing** is desktop-only in the dashboard for now (not added to the mobile order-details sheet).
- **Telegram bot** — deliberately not touched yet, per your instructions.
- **"Offers" tab** in the new bottom nav has no real destination page — links to `/shop` as a placeholder until you decide what it should be.
