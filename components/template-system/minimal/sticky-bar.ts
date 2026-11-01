import { type DependencyList, type RefObject, useEffect, useState } from "react";

/**
 * Shared geometry for bars fixed to the bottom of a phone screen — the PDP's
 * sticky Add to bag and the cart's sticky checkout.
 *
 * There is no fixed mobile bottom nav any more (its destinations live in the
 * header and the menu), so these bars sit on the viewport's bottom edge and
 * pad their content above the device's home-indicator area instead of
 * resting on a nav.
 */

/** CSS `bottom` for a sticky bar: the viewport edge. */
export const STICKY_BAR_BOTTOM = "0px";

/**
 * CSS `padding-bottom` for a sticky bar: its normal 12px inset, or the
 * device's bottom safe area when that is larger, so the button is never
 * under the home indicator.
 */
export const STICKY_BAR_PADDING_BOTTOM = "max(0.75rem, env(safe-area-inset-bottom))";

/**
 * Whether a watched control is fully visible in the viewport. 0.99, not 1:
 * sub-pixel layout can leave a fully visible button at 0.998.
 */
export function isFullyUsable(entry: Pick<IntersectionObserverEntry, "isIntersecting" | "intersectionRatio">): boolean {
  return entry.isIntersecting && entry.intersectionRatio >= 0.99;
}

/**
 * Tracks whether `ref`'s element is fully usable — entirely on screen. False
 * while it is below the fold, partly cut off, or scrolled away above; true
 * only when it can actually be tapped.
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
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) setUsable(isFullyUsable(entry));
      },
      { threshold: [0, 0.5, 0.99, 1] },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, deps);
  return usable;
}
