import { useRef, useEffect, useState, type ReactNode } from "react";
import { useSpring, animated, type SpringConfig } from "@react-spring/web";

interface AnimatedContentProps {
  children: ReactNode;
  distance?: number;
  direction?: "vertical" | "horizontal";
  reverse?: boolean;
  config?: SpringConfig;
  initialOpacity?: number;
  animateOpacity?: boolean;
  scale?: number;
  threshold?: number;
  delay?: number;
  className?: string;
}

const AnimatedContent: React.FC<AnimatedContentProps> = ({
  className,
  children,
  distance = 50,
  direction = "vertical",
  reverse = false,
  config = { tension: 70, friction: 20 },
  initialOpacity = 0,
  animateOpacity = true,
  scale = 1,
  threshold = 0.1,
  delay = 0,
}) => {
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const throttleTime = 100;
    let lastTime = 0;
    const throttledCallback = (entries: IntersectionObserverEntry[]) => {
      const now = Date.now();
      if (now - lastTime < throttleTime) return;
      lastTime = now;

      const [entry] = entries;
      if (entry?.isIntersecting) {
        observer.unobserve(element);
        setTimeout(() => {
          setInView(true);
        }, delay);
      }
    };

    const observer = new IntersectionObserver(throttledCallback, { threshold });
    observer.observe(element);

    return () => observer.disconnect();
  }, [threshold, delay]);

  const directions: Record<"vertical" | "horizontal", string> = {
    vertical: "Y",
    horizontal: "X",
  };

  const springProps = useSpring({
    from: {
      transform: `translate${directions[direction]}(${
        reverse ? `-${distance}px` : `${distance}px`
      }) scale(${scale})`,
      opacity: animateOpacity ? initialOpacity : 1,
    },
    to: inView
      ? {
          transform: `translate${directions[direction]}(0px) scale(1)`,
          opacity: 1,
        }
      : undefined,
    config,
  });
  const AnimatedDiv = animated("div");

  return (
    <AnimatedDiv ref={ref} style={springProps} className={className}>
      {children}
    </AnimatedDiv>
  );
};

export default AnimatedContent;
