import { type DependencyList, type RefObject, useEffect, useState } from "react";

/**
 * Shared geometry for the fixed mobile bottom nav (MinimalMobileBottomNav).
 *
 * Anything fixed to the bottom of a phone screen — the PDP's sticky Add to
 * bag, the cart's sticky checkout bar — must rest ON TOP of the nav, never
 * under it: the nav paints above them (`--perce-z-bottom-nav` > `--perce-z-sticky`),
 * so whatever it covers cannot be tapped. On a 650–760px in-app browser that
 * used to swallow the PDP's Add to bag (the tap landed on Wishlist).
 */

/**
 * CSS `bottom` for a bar that sits on the nav: its 4rem height plus the
 * device's bottom safe area. On a phone whose safe area is already inside the
 * nav this leaves a strip of up to that inset between the two — never an
 * overlap, which is the failure that matters.
 */
export const BOTTOM_NAV_CLEARANCE = "calc(4rem + env(safe-area-inset-bottom))";

/** Attribute the nav carries so geometry code can find it without a ref. */
export const BOTTOM_NAV_ATTR = "data-perce-bottom-nav";

/**
 * Pixels of the viewport's bottom edge covered by the bottom nav right now:
 * from the nav's top edge to the bottom of the viewport. 0 when there is no
 * nav, or it is hidden (`lg:hidden`, `/checkout`), or not in a browser.
 */
export function bottomNavOcclusion(doc: Document | undefined = globalThis.document): number {
  if (!doc) return 0;
  const nav = doc.querySelector<HTMLElement>(`[${BOTTOM_NAV_ATTR}]`);
  if (!nav) return 0;
  const rect = nav.getBoundingClientRect();
  if (rect.height <= 0 || rect.width <= 0) return 0;
  const viewportHeight = doc.defaultView?.innerHeight ?? doc.documentElement.clientHeight;
  return Math.max(0, Math.ceil(viewportHeight - rect.top));
}

/**
 * Whether a watched control is fully visible in the part of the viewport the
 * bottom nav does not cover. `entry` comes from an IntersectionObserver whose
 * root margin already excludes the nav (see useFullyUsable).
 */
export function isFullyUsable(entry: Pick<IntersectionObserverEntry, "isIntersecting" | "intersectionRatio">): boolean {
  // 0.99, not 1: sub-pixel layout can leave a fully visible button at 0.998.
  return entry.isIntersecting && entry.intersectionRatio >= 0.99;
}

/**
 * Tracks whether `ref`'s element is fully usable — entirely on screen and not
 * under the fixed bottom nav. False while it is below the fold, behind the
 * nav, partly cut off, or scrolled away above; true only when it can actually
 * be tapped. The nav's height is re-measured on resize/orientation change
 * (in-app browsers resize the viewport as their toolbars collapse).
 *
 * Starts `true`, so nothing that keys off "not usable" shows before the first
 * observation (and never on the server).
 */
export function useFullyUsable(ref: RefObject<Element | null>, deps: DependencyList): boolean {
  const [usable, setUsable] = useState(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the caller's deps say when the element remounts
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let observer: IntersectionObserver | null = null;
    let occlusion = -1;
    const observe = () => {
      const next = bottomNavOcclusion();
      if (next === occlusion && observer) return;
      occlusion = next;
      observer?.disconnect();
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          if (entry) setUsable(isFullyUsable(entry));
        },
        { rootMargin: `0px 0px -${occlusion}px 0px`, threshold: [0, 0.5, 0.99, 1] },
      );
      observer.observe(el);
    };
    observe();
    window.addEventListener("resize", observe);
    window.addEventListener("orientationchange", observe);
    return () => {
      window.removeEventListener("resize", observe);
      window.removeEventListener("orientationchange", observe);
      observer?.disconnect();
    };
  }, deps);
  return usable;
}
