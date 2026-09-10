import type { Variants, Transition } from "framer-motion";

/* ------------------------------------------------------------------ */
/*  Easing                                                            */
/* ------------------------------------------------------------------ */

/** Calm easeOut — Zara / COS feel */
export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];
export const EASE_IN_OUT: [number, number, number, number] = [0.4, 0, 0.2, 1];

/* ------------------------------------------------------------------ */
/*  Durations                                                         */
/* ------------------------------------------------------------------ */

export const D_SHORT = 0.35;
export const D_MED = 0.6;
export const D_LONG = 0.8;

/* ------------------------------------------------------------------ */
/*  Shared transition                                                 */
/* ------------------------------------------------------------------ */

export const transitionMed: Transition = {
  duration: D_MED,
  ease: EASE_OUT,
};

export const transitionLong: Transition = {
  duration: D_LONG,
  ease: EASE_OUT,
};

/* ------------------------------------------------------------------ */
/*  Reusable Variants                                                 */
/* ------------------------------------------------------------------ */

/** Simple opacity fade */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: transitionMed },
};

/** Fade + translate-y 24px */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: transitionMed },
};

/** Fade + translate-y -16px (top reveal) */
export const fadeDown: Variants = {
  hidden: { opacity: 0, y: -16 },
  visible: { opacity: 1, y: 0, transition: transitionMed },
};

/** Stagger container — orchestrates children */
export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.08,
    },
  },
};

/** Fast stagger for thumbnail rails, etc. */
export const staggerContainerFast: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.04,
    },
  },
};

/** Clip-path reveal (inset from bottom) with opacity fallback */
export const clipReveal: Variants = {
  hidden: {
    opacity: 0,
    clipPath: "inset(8% 0% 0% 0%)",
  },
  visible: {
    opacity: 1,
    clipPath: "inset(0% 0% 0% 0%)",
    transition: { duration: D_LONG, ease: EASE_OUT },
  },
};

/* ------------------------------------------------------------------ */
/*  Reduced-motion safe variants                                      */
/* ------------------------------------------------------------------ */

/** Opacity-only fallback for reduced motion */
export const fadeOnly: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: D_SHORT } },
};

/**
 * Return the appropriate variant set depending on reduced-motion preference.
 * @param prefersReduced - value from useReducedMotion()
 * @param full - variants with transforms
 * @param reduced - fallback (opacity-only by default)
 */
export function getMotionSafe(
  prefersReduced: boolean,
  full: Variants,
  reduced: Variants = fadeOnly,
): Variants {
  return prefersReduced ? reduced : full;
}
