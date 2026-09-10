import { motion, useReducedMotion } from "framer-motion";
import { staggerContainer, fadeUp, fadeOnly, getMotionSafe } from "./motionPresets";

/* ------------------------------------------------------------------ */
/*  StaggerContainer                                                  */
/* ------------------------------------------------------------------ */

interface StaggerContainerProps {
  children: React.ReactNode;
  className?: string;
  /** Amount visible before trigger. Default 0.15 */
  amount?: number;
}

/**
 * Orchestrates staggered entry of child `StaggerItem` elements.
 * Triggers once on entering the viewport. SSR-safe.
 */
export function StaggerContainer({
  children,
  className,
  amount = 0.15,
}: StaggerContainerProps) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount }}
      variants={staggerContainer}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  StaggerItem                                                       */
/* ------------------------------------------------------------------ */

interface StaggerItemProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Individual stagger child — must be placed inside `StaggerContainer`.
 * Animates `fadeUp` (or opacity-only when reduced-motion).
 */
export function StaggerItem({ children, className }: StaggerItemProps) {
  const prefersReduced = useReducedMotion() ?? false;
  const variants = getMotionSafe(prefersReduced, fadeUp);

  return (
    <motion.div variants={variants} className={className}>
      {children}
    </motion.div>
  );
}
