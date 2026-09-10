import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface ParallaxImageProps {
  src: string;
  alt?: string;
  className?: string;
  /** Max translate-y in px. Default 20. Keep small for premium feel. */
  strength?: number;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

/**
 * Subtle parallax image — enabled only on `lg+` and when motion is allowed.
 *
 * Uses a clamped, viewport-aware scroll listener so the offset always resets
 * cleanly when the hero re-enters the viewport (fixes the "image disappears
 * after scrolling back up" bug).
 *
 * Falls back to a regular `<img>` on mobile or when `prefers-reduced-motion`.
 */
export function ParallaxImage({
  src,
  alt = "",
  className = "",
  strength = 20,
}: ParallaxImageProps) {
  const prefersReduced = useReducedMotion() ?? false;
  const containerRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (prefersReduced) return;

    const handleScroll = () => {
      const el = containerRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      // Out of view — reset transform so re-entry is always clean.
      if (rect.bottom <= 0 || rect.top >= viewportHeight) {
        setOffset(0);
        return;
      }

      // Progress: -1 (just entered from bottom) → 0 (centered) → +1 (about to exit top).
      const center = rect.top + rect.height / 2;
      const progress = (center - viewportHeight / 2) / viewportHeight;
      const clamped = Math.max(-1, Math.min(1, progress));
      setOffset(-clamped * strength);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [prefersReduced, strength]);

  // Reduced motion or will be hidden on mobile — just render a plain img
  if (prefersReduced) {
    return (
      <img
        src={src}
        alt={alt}
        className={`absolute inset-0 h-full w-full object-cover ${className}`}
      />
    );
  }

  return (
    <>
      {/* Mobile: plain image (hidden on lg+) */}
      <img
        src={src}
        alt={alt}
        className={`absolute inset-0 h-full w-full object-cover lg:hidden ${className}`}
      />
      {/* Desktop: parallax (hidden below lg). Container clips overflow so the
          oversized image never reveals the page background behind it. */}
      <div
        ref={containerRef}
        className='absolute inset-0 hidden lg:block overflow-hidden'>
        <img
          src={src}
          alt={alt}
          style={{
            transform: `translate3d(0, ${offset}px, 0)`,
            top: `-${strength}px`,
            height: `calc(100% + ${strength * 2}px)`,
            willChange: "transform",
          }}
          className={`absolute inset-x-0 w-full object-cover ${className}`}
        />
      </div>
    </>
  );
}
