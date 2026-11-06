import { type RefObject, useEffect } from "react";

/**
 * How a set page's own purchase controls share the bottom of the window with
 * the rest of the storefront.
 *
 * Pick Your Set has a fixed action bar at every width; a Ready Set has a fixed
 * bar on phones and an inline price panel from `sm`. Two things follow:
 *
 *   - While such a bar is fixed, its height is published as --perce-set-bar-h.
 *     The storefront <main> reserves it (so the footer scrolls clear) and the
 *     desktop bag bar stacks above it (layouts/style.css, StickyCartBar).
 *   - While an inline panel is on screen, the bag bar steps aside, because a
 *     floating bar would otherwise sit on the set's price and button.
 */

const SET_BAR_VAR = "--perce-set-bar-h";
const PANEL_IN_VIEW_ATTR = "data-set-panel-in-view";

/** Publishes `ref`'s height while it is position: fixed; 0 once it is in the page's flow. */
export function usePublishSetBarHeight(ref: RefObject<HTMLElement | null>, ready = true): void {
  useEffect(() => {
    const el = ref.current;
    if (!ready || !el) return;
    const root = document.documentElement;
    const update = () => {
      const fixed = getComputedStyle(el).position === "fixed";
      root.style.setProperty(SET_BAR_VAR, `${fixed ? Math.ceil(el.getBoundingClientRect().height) : 0}px`);
    };
    update();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(el);
    window.addEventListener("resize", update, { passive: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      root.style.removeProperty(SET_BAR_VAR);
    };
  }, [ref, ready]);
}

/** Marks the document while `ref`'s panel is on screen, so the bag bar can step aside. */
export function useSetPanelInView(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const root = document.documentElement;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry?.isIntersecting) root.setAttribute(PANEL_IN_VIEW_ATTR, "");
      else root.removeAttribute(PANEL_IN_VIEW_ATTR);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.removeAttribute(PANEL_IN_VIEW_ATTR);
    };
  }, [ref]);
}
