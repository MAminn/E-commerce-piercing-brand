import { motion, useReducedMotion } from "framer-motion";
import {
  fadeUp,
  fadeIn,
  clipReveal,
  fadeOnly,
  getMotionSafe,
} from "./motionPresets";
import type { Variants } from "framer-motion";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type RevealVariant = "fadeUp" | "fadeIn" | "clipReveal";

interface RevealProps {
  children: React.ReactNode;
  variant?: RevealVariant;
  delay?: number;
  className?: string;
  /** Amount of element visible before triggering (0–1). Default 0.25 */
  amount?: number;
}

/* ------------------------------------------------------------------ */
/*  Variant map                                                       */
/* ------------------------------------------------------------------ */

const VARIANT_MAP: Record<RevealVariant, Variants> = {
  fadeUp,
  fadeIn,
  clipReveal,
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

/**
 * Scroll-triggered reveal wrapper.
 *
 * Renders a `motion.div` that animates once when scrolled into the viewport.
 * SSR-safe — uses Framer Motion's `whileInView` (no manual IntersectionObserver).
 * Respects `prefers-reduced-motion`.
 */
export function Reveal({
  children,
  variant = "fadeUp",
  delay = 0,
  className,
  amount = 0.25,
}: RevealProps) {
  const prefersReduced = useReducedMotion() ?? false;
  const variants = getMotionSafe(prefersReduced, VARIANT_MAP[variant]);

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount }}
      variants={variants}
      transition={delay > 0 ? { delay } : undefined}
      className={className}
    >
      {children}
    </motion.div>
  );
}
