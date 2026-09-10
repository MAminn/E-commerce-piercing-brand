# Phase 2 — Editorial Template Animation & Chrome Layer: COMPLETE

**Project:** Single-shop-DP (Percé)  
**Stack:** Vike SSR + React 19 + Vite 6 + Tailwind CSS 4 + Framer Motion 12 + shadcn/ui  
**Date completed:** March 5, 2026  
**TypeScript status:** Zero new errors (only pre-existing drizzle transaction typing in `backend/orders/create-order/service.ts`)

---

## 1. Motion Toolkit (4 files) — `components/template-system/motion/`

### `motionPresets.ts`
- Easing: `EASE_OUT = [0.16, 1, 0.3, 1]`, `EASE_IN_OUT = [0.4, 0, 0.2, 1]`
- Durations: `D_SHORT = 0.35`, `D_MED = 0.6`, `D_LONG = 0.8`
- Shared transitions: `transitionMed` (0.6s easeOut), `transitionLong` (0.8s easeOut)
- Variants: `fadeIn` (opacity only), `fadeUp` (y:24→0), `fadeDown` (y:-16→0), `staggerContainer` (stagger 0.1s, delay 0.08s), `staggerContainerFast` (stagger 0.06s), `clipReveal` (clipPath inset 8%→0% + opacity)
- Reduced motion: `fadeOnly` variant (opacity-only, 0.35s), `getMotionSafe(prefersReduced, full, reduced)` helper

### `Reveal.tsx`
- Props: `variant` ("fadeUp" | "fadeIn" | "clipReveal"), `delay`, `className`, `amount` (default 0.25)
- Uses `motion.div` + `whileInView="visible"` + `viewport={{ once: true, amount }}`
- SSR-safe (no manual IntersectionObserver)
- Respects `useReducedMotion()` — falls back to `fadeOnly`

### `Stagger.tsx`
- `StaggerContainer` — `motion.div` with `staggerContainer` variants, `viewport={{ once: true, amount: 0.15 }}`
- `StaggerItem` — `motion.div` with `fadeUp` variants, reduced-motion aware
- Must be nested: `<StaggerContainer>` → `<StaggerItem>` children

### `ParallaxImage.tsx`
- Uses `useScroll({ target, offset: ["start end", "end start"] })` + `useTransform(scrollYProgress, [0,1], [-strength, strength])`
- Props: `src`, `alt`, `className`, `strength` (default 20, max translate-y in px)
- Mobile: plain `<img>` via `lg:hidden` (no JS parallax on mobile)
- Desktop: `motion.img` with `style={{ y, top, height }}` — uses inline styles (NOT Tailwind dynamic classes, which don't work with JIT)
- Reduced motion: falls back to plain `<img>` everywhere

---

## 2. Skeleton Shimmer Upgrade

### `components/ui/skeleton.tsx`
Changed from:
```
bg-primary/10 animate-pulse rounded-md
```
To premium shimmer:
```
relative overflow-hidden bg-stone-200/70 rounded-md
after:absolute after:inset-0 after:bg-gradient-to-r after:from-transparent after:via-white/35 after:to-transparent
after:animate-[shimmer_1.4s_ease-in-out_infinite]
```

### `layouts/style.css`
Added keyframe:
```css
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
```

---

## 3. Editorial Chrome Layer (3 files) — `components/template-system/editorial/`

### `EditorialChrome.tsx` — Wrapper component
- `useEffect` sets `document.documentElement.dataset.editorialChrome = "true"` on mount
- Cleanup removes the attribute on unmount
- Renders: `<EditorialNavbar />` → `{children}` → `<EditorialFooter />`
- SSR-safe (attribute set only client-side in useEffect)

### CSS Toggle (in `layouts/style.css`)
```css
html[data-editorial-chrome="true"] #global-navbar,
html[data-editorial-chrome="true"] #global-footer {
  display: none !important;
}
```

### `layouts/LayoutDefault.tsx` — Modified
- Wrapped `<Navbar lang='en' />` in `<div id="global-navbar">`
- Wrapped `<Footer />` in `<div id="global-footer">`
- This allows the CSS toggle to hide them when editorial chrome is active

### `EditorialNavbar.tsx` — Custom editorial navigation
- `motion.nav` with animated `backgroundColor` and `borderBottomColor` (transparent→white on scroll past 24px)
- Transition: 0.35s easeOut (instant when reduced motion)
- Desktop: left — 4 nav links (Shop, New In, Collections, About) with `text-xs tracking-[0.28em] uppercase font-light`; center — STORE_NAME logo with `text-xl lg:text-2xl font-extralight tracking-[0.18em] uppercase`; right — auth links, search, cart bag icon with badge
- Mobile: hamburger → Sheet drawer (same as global Navbar pattern) with editorial-styled links, mobile search, auth
- Text/icon color swaps between `text-white` (transparent) and `text-stone-900` (scrolled)
- Cart badge: `bg-stone-900 text-white` (scrolled) / `bg-white text-stone-900` (transparent)
- All interactive elements have `focus-visible:ring-2` for accessibility
- Uses: `AuthContext`, `useCart()`, `STORE_NAME`, `navigate()` from vike, `Sheet` from shadcn

### `EditorialFooter.tsx` — Zara/COS calm aesthetic
- `bg-stone-950` dark canvas with `text-white/60` base
- Newsletter section at top: underline input, arrow submit button, `border-b border-white/[0.06]`
- 4-column grid (md:12-col): Brand (col-span-4) with logo + description + social icons | Shop | Company | Support (col-span-2 each)
- Column headings: `text-[10px] tracking-[0.32em] uppercase text-white/40`
- Links: `text-sm text-white/45 hover:text-white/80 font-light tracking-wide`
- Social icons: Facebook, Instagram, TikTok (SVG, w-18 h-18)
- Legal strip: Terms, Privacy, Cookies — `text-[10px] text-white/20`
- All transitions: `duration-500` for calm hover feel

---

## 4. Scroll Animations Applied to All 6 Editorial Templates

### `LandingTemplateEditorial.tsx`
- Hero: `<ParallaxImage>` replaces static `<picture>` for background image (strength 30)
- Hero text: 3 stacked `<Reveal variant="fadeUp">` with staggered delays (0.1, 0.25, 0.4)
- Brand Statement: `<Reveal variant="clipReveal">` on the image column, `<Reveal variant="fadeUp" delay={0.15}>` on the text column
- Categories strip: `<Reveal variant="fadeUp">` wrapper, `<StaggerContainer>` + `<StaggerItem>` on each category card
- New Arrivals grid: `<StaggerContainer>` + `<StaggerItem>` wrapping each `<EditorialProductTile>`
- Featured Products grid: `<StaggerContainer>` + `<StaggerItem>` wrapping each tile
- Value Props: `<StaggerContainer>` + `<StaggerItem>` on each prop row
- Newsletter: Two `<Reveal variant="fadeUp">` columns (text + form) with 0.15s delay offset
- Footer CTA: `<Reveal variant="fadeUp">` on centered content
- Wrapped in `<EditorialChrome>`

### `ProductPageEditorial.tsx`
- Thumbnails column: `<StaggerContainer>` + `<StaggerItem>` on each thumbnail button
- Main image: `<Reveal variant="fadeIn">` on the gallery area
- Buy box (sticky sidebar): `<Reveal variant="fadeUp" delay={0.15}>` on entire buy box including quantity, add-to-bag, value props, accordion
- Related products: `<Reveal variant="fadeUp">` on section header, `<StaggerContainer>` + `<StaggerItem>` on each related tile
- Wrapped in `<EditorialChrome>`

### `SortingEditorialTemplate.tsx`
- Hero: `<ParallaxImage>` replaces static `<img>` (strength 20)
- Hero text: `<Reveal variant="fadeUp">` on title + product count
- Product grid: `<StaggerContainer>` + `<StaggerItem>` wrapping each `<ProductTile>`
- Wrapped in `<EditorialChrome>`

### `CartPageEditorialTemplate.tsx`
- Header: `<Reveal variant="fadeUp">` on "Your Bag" heading
- Cart items list: `<StaggerContainer>` + `<StaggerItem>` wrapping each cart item row
- Order summary (sticky sidebar): `<Reveal variant="fadeUp" delay={0.15}>`
- Wrapped in `<EditorialChrome>`

### `CheckoutPageEditorialTemplate.tsx`
- Header: `<Reveal variant="fadeUp">` on "Complete Your Order" heading
- Form sections: `<StaggerContainer>` + `<StaggerItem>` on each section (Customer Info, Shipping Address, Payment Method, Order Notes)
- Order summary sidebar: `<Reveal variant="fadeUp" delay={0.2}>`
- Wrapped in `<EditorialChrome>`

### `SearchResultsEditorial.tsx`
- Header: `<Reveal variant="fadeUp">` on search query heading + result count
- Results grid: `<StaggerContainer>` + `<StaggerItem>` wrapping each `<ResultTile>`
- Wrapped in `<EditorialChrome>`

---

## 5. What Was NOT Done (Out of Scope / Deferred)

- **Page transitions (AnimatePresence in layout):** Not implemented. Would require modifying Vike's client-side routing and wrapping `{children}` in `<AnimatePresence>` in `LayoutDefault.tsx`. Deferred because Vike's SSR hydration makes AnimatePresence tricky — the exit animation needs route-aware keying and layout-level state management.
- **Custom animation keyframes per template:** Each template uses the shared motion toolkit. No template-specific custom keyframes were created — the shared presets (fadeUp, fadeIn, clipReveal, stagger) cover all needs.
- **EditorialPreviews.tsx:** The template preview/thumbnail component was not modified (it's just a visual picker, not a page template).

---

## 6. Architecture Summary

```
EditorialChrome (wrapper)
├── useEffect → html[data-editorial-chrome="true"]
│   └── CSS hides #global-navbar + #global-footer
├── <EditorialNavbar />   ← transparent→solid, motion.nav
├── {children}            ← the actual template page
│   └── Uses: Reveal, StaggerContainer, StaggerItem, ParallaxImage
└── <EditorialFooter />   ← bg-stone-950, 4-column
```

**Integration with existing system:**
- `LayoutDefault.tsx` always renders global `<Navbar>` (in `#global-navbar`) and `<Footer>` (in `#global-footer`)
- When an editorial template loads, `EditorialChrome` sets the data attribute on `<html>`
- CSS `display: none !important` hides global chrome instantly
- Editorial nav/footer render in their place
- On navigation away from editorial template, `useEffect` cleanup removes the attribute
- Global nav/footer reappear automatically

**No double navbar/footer ever visible.** The `data-editorial-chrome` attribute is the single source of truth.

---

## 7. File Inventory (All Phase 2 Files)

| # | File | Status | Action |
|---|------|--------|--------|
| 1 | `components/template-system/motion/motionPresets.ts` | NEW | Easing, durations, variants |
| 2 | `components/template-system/motion/Reveal.tsx` | NEW | Scroll-triggered reveal |
| 3 | `components/template-system/motion/Stagger.tsx` | NEW | StaggerContainer + StaggerItem |
| 4 | `components/template-system/motion/ParallaxImage.tsx` | NEW | GPU parallax for images |
| 5 | `components/template-system/editorial/EditorialNavbar.tsx` | NEW | Custom editorial navbar |
| 6 | `components/template-system/editorial/EditorialFooter.tsx` | NEW | Custom editorial footer |
| 7 | `components/template-system/editorial/EditorialChrome.tsx` | NEW | Chrome wrapper + CSS toggle |
| 8 | `layouts/LayoutDefault.tsx` | MODIFIED | Added `#global-navbar` / `#global-footer` id wrappers |
| 9 | `layouts/style.css` | MODIFIED | Shimmer keyframe + editorial chrome CSS rule |
| 10 | `components/ui/skeleton.tsx` | MODIFIED | Shimmer gradient upgrade |
| 11 | `components/template-system/landing/LandingTemplateEditorial.tsx` | MODIFIED | Chrome + all section animations |
| 12 | `components/template-system/productPage/ProductPageEditorial.tsx` | MODIFIED | Chrome + gallery/buy box/related animations |
| 13 | `components/template-system/sorting/SortingEditorialTemplate.tsx` | MODIFIED | Chrome + hero parallax + grid stagger |
| 14 | `components/template-system/cartPage/CartPageEditorialTemplate.tsx` | MODIFIED | Chrome + items stagger + summary |
| 15 | `components/template-system/checkoutPage/CheckoutPageEditorialTemplate.tsx` | MODIFIED | Chrome + form sections stagger |
| 16 | `components/template-system/searchResults/SearchResultsEditorial.tsx` | MODIFIED | Chrome + header + grid stagger |

**7 new files, 9 modified files, 0 new TypeScript errors.**
