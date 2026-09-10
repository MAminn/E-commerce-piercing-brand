import { cn } from "#root/lib/utils.js";
import type React from "react";
import { usePageContext } from "vike-react/usePageContext";

export function Link({
  href,
  children,
  className,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const pageContext = usePageContext();
  const { urlPathname } = pageContext;
  const isActive =
    href === "/" ? urlPathname === href : urlPathname.startsWith(href);
  return (
    <a
      href={href}
      className={cn(isActive ? "is-active" : undefined, `${className}`)}
      onClick={onClick}>
      {children}
    </a>
  );
}
