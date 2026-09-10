import { cn } from "#root/lib/utils";

interface MarqueeProps {
  text: string;
  /** Number of times to repeat the text for seamless looping */
  repeat?: number;
  /** Animation speed — higher = slower (default 240s) */
  duration?: number;
  className?: string;
  /** Inline style overrides — used for arbitrary CMS-picked hex colors that don't map to a Tailwind class */
  style?: React.CSSProperties;
}

/**
 * Scrolling marquee/ticker bar — true infinite loop, no white-space gap.
 *
 * Renders TWO identical flex children, each animating translateX(0 → -100%).
 * Because both sets move in lockstep, the second set always fills in behind
 * the first as it exits left. The reset is invisible because the sets are
 * identical. direction:ltr is forced on the track so the animation works
 * consistently in RTL pages.
 */
export function Marquee({
  text,
  repeat = 12,
  duration = 240,
  className,
  style,
}: MarqueeProps) {
  const items = Array.from({ length: repeat }).map((_, i) => (
    <span
      key={i}
      className='mx-6 text-[11px] sm:text-base font-medium tracking-[0.15em] uppercase'
      aria-hidden={i > 0 ? "true" : undefined}>
      {text}
      <span className='mx-6 text-white/30'>•</span>
    </span>
  ));

  return (
    <div
      className={cn(
        "overflow-hidden whitespace-nowrap bg-stone-900 text-red-500 py-2.5",
        className,
      )}
      style={style}
      aria-label={text}>
      <div
        className='flex'
        style={{ direction: "ltr" } as React.CSSProperties}>
        <div
          className='flex shrink-0 animate-marquee'
          style={
            {
              "--marquee-duration": `${duration}s`,
            } as React.CSSProperties
          }>
          {items}
        </div>
        <div
          className='flex shrink-0 animate-marquee'
          style={
            {
              "--marquee-duration": `${duration}s`,
            } as React.CSSProperties
          }
          aria-hidden='true'>
          {items}
        </div>
      </div>
    </div>
  );
}
