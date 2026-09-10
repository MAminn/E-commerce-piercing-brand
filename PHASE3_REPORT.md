# Phase 3 — Page Transitions Report

## Overview

Vike-safe, SSR-safe page transitions using a **CSS overlay approach** controlled by Vike's `+onPageTransitionStart` / `+onPageTransitionEnd` hooks. The overlay fades in to cover the page while Vike swaps content underneath, then fades out to reveal the new page. No new dependencies, no AnimatePresence, no hydration risk.

---

## Architecture

### Approach: CSS Overlay + Vike Hooks

```
User clicks link
  → Vike fires onPageTransitionStart
    → html[data-page-transition="out"]
    → .page-transition-overlay fades to opacity 1 (240ms CSS transition)
    → Hook awaits 180ms (120ms for back nav) then resolves
  → Vike swaps page content underneath the opaque overlay
  → Vike fires onPageTransitionEnd
    → html[data-page-transition="in"]
    → .page-transition-overlay fades to opacity 0 (240ms CSS transition)
    → Hook awaits 220ms then deletes dataset attribute
    → Overlay returns to fully inert state
```

### Why CSS Overlay (Not AnimatePresence)

- **SSR-safe**: The overlay div renders at `opacity: 0` with no dataset attribute on initial load — completely inert during SSR and hydration
- **No hydration mismatch**: The overlay is a static DOM element, not conditionally rendered
- **No new dependencies**: Uses native CSS transitions, no animation library needed for this layer
- **Deterministic timing**: CSS `transition` + `setTimeout` in hooks gives precise control over the transition lifecycle

---

## Files Modified

### 1. `layouts/LayoutDefault.tsx`

**Change**: Added `#page-transition-overlay` div as the last child inside `<main>`.

```tsx
{/* Phase 3 — page-transition overlay (CSS-only, SSR-inert) */}
<div
  id='page-transition-overlay'
  aria-hidden='true'
  className='page-transition-overlay'
/>
```

**Placement**: After `<Toaster />` and `<ShadcnToaster />`, before closing `</main>`. This ensures the overlay sits on top of all page content (reinforced by `z-index: 9999`).

---

### 2. `pages/+onPageTransitionStart.ts`

**Change**: Replaced gutted stub with full CSS-overlay transition logic.

```typescript
const REDUCED =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export const onPageTransitionStart: OnPageTransitionStartAsync =
  async (): Promise<void> => {
    document.documentElement.dataset.pageTransition = "out";

    if (REDUCED) return;

    const isBack =
      (globalThis as Record<string, unknown>).__vikeIsBackward === true;
    await new Promise<void>((r) => setTimeout(r, isBack ? 120 : 180));
  };
```

**Behaviour**:
- Sets `data-page-transition="out"` on `<html>` → CSS transitions overlay to `opacity: 1`
- Reduced motion: sets attribute (CSS handles instant flip) but returns immediately with no delay
- Normal motion: awaits **180ms** (or **120ms** for backward navigation) to let the overlay fade in before Vike swaps page content
- The `REDUCED` constant is evaluated once at module load (client-only)

---

### 3. `pages/+onPageTransitionEnd.ts`

**Change**: Added overlay fade-out logic while preserving existing tracking + dashboard reload behaviour.

```typescript
const REDUCED =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export const onPageTransitionEnd: OnPageTransitionEndAsync = async (
  pageContext,
): Promise<void> => {
  // Phase 3: fade overlay out
  document.documentElement.dataset.pageTransition = "in";

  if (REDUCED) {
    delete document.documentElement.dataset.pageTransition;
  } else {
    await new Promise<void>((r) => setTimeout(r, 220));
    delete document.documentElement.dataset.pageTransition;
  }

  // Existing: dashboard reload + page_viewed tracking (preserved)
  // ...
};
```

**Behaviour**:
- Sets `data-page-transition="in"` → CSS transitions overlay to `opacity: 0`
- Reduced motion: deletes dataset attribute immediately
- Normal motion: awaits **220ms** then deletes attribute, returning overlay to fully inert state
- All pre-existing logic preserved: dashboard force-refresh, `trackingEventBus.emit` for `PAGE_VIEWED`

---

### 4. `layouts/style.css`

**Change**: Replaced old `body.page-is-transitioning #page-content` CSS with full overlay system.

```css
/* ── Phase 3 — CSS-overlay page transitions ─────────────────────── */

.page-transition-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  opacity: 0;
  background: rgba(250, 250, 249, 0.96);   /* warm stone-50-ish */
  pointer-events: none;
  transition: opacity 240ms cubic-bezier(0.16, 1, 0.3, 1);
  will-change: opacity;
}

html[data-page-transition="out"] .page-transition-overlay {
  opacity: 1;
  pointer-events: auto;   /* block clicks while transitioning */
}

html[data-page-transition="in"] .page-transition-overlay {
  opacity: 0;
}

html[data-page-transition="out"] body {
  cursor: progress;
}

@media (prefers-reduced-motion: reduce) {
  .page-transition-overlay {
    transition-duration: 0ms;
  }
}
```

**Removed**:
```css
/* Old approach — deleted */
#page-content { opacity: 1; transition: opacity 0.2s ease-in-out; }
body.page-is-transitioning #page-content { opacity: 0; }
```

---

## Timing Specification

| Phase | Delay (normal) | Delay (reduced motion) | CSS Duration |
|-------|---------------|----------------------|-------------|
| **Out** (overlay fade in) | 180ms (120ms back nav) | 0ms (immediate return) | 240ms |
| **In** (overlay fade out) | 220ms | 0ms (immediate cleanup) | 240ms |

**Easing**: `cubic-bezier(0.16, 1, 0.3, 1)` — fast start, gentle ease-out for a premium feel.

---

## SSR Safety Guarantees

| Concern | Mitigation |
|---------|-----------|
| Hydration mismatch | Overlay is a static div, always in DOM, no conditional rendering |
| Server-side `document` access | Hooks only run client-side (Vike guarantee) |
| `matchMedia` on server | `REDUCED` constant guarded by `typeof window !== "undefined"` |
| Initial page load flash | No `data-page-transition` attribute on SSR → overlay stays at `opacity: 0` |
| Overlay blocking interaction | `pointer-events: none` by default, only `auto` during `"out"` state |

---

## Accessibility

- `aria-hidden="true"` on overlay div — screen readers ignore it entirely
- `prefers-reduced-motion: reduce` → CSS transition duration set to `0ms`, hooks return immediately with no delays
- `cursor: progress` during transition gives visual feedback that navigation is in progress

---

## Prerequisites (Already in Place)

| Requirement | Status |
|-------------|--------|
| `clientRouting: true` in `pages/+config.ts` | ✅ Already enabled |
| `hydrationCanBeAborted: true` in `pages/+config.ts` | ✅ Already enabled |
| `vike-react` extension | ✅ Already configured |
| Vike hooks file locations (`pages/+onPageTransition*.ts`) | ✅ Already existed (stubs replaced) |

---

## TypeScript Verification

```
Zero new errors.
Only pre-existing: backend/orders/create-order/service.ts — drizzle transaction typing (unrelated).
```

---

## No Breaking Changes

- **No new dependencies** added
- **No template prop or schema changes**
- **No modifications to editorial templates** (Phase 2 work untouched)
- **Existing tracking & dashboard logic** in `+onPageTransitionEnd.ts` fully preserved
- **Old CSS removed**: `body.page-is-transitioning` approach was already unused (hooks were gutted)
