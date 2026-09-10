import type { ReactNode } from "react";
import { Link } from "#root/components/utils/Link";
import { ArrowRight } from "lucide-react";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { cn } from "#root/lib/utils";
import { NOIR_ACCENT_LINE, NOIR_DISPLAY_FONT_CLASSES } from "./noir-tokens";

interface NoirSectionHeadingProps {
  title: string;
  eyebrow?: string;
  viewAllText?: string;
  viewAllLink?: string;
  align?: "start" | "center";
  className?: string;
  children?: ReactNode;
}

/**
 * NoirSectionHeading — unified section header used across landing +
 * shop sections: small red over-line accent, condensed uppercase
 * title, optional right-aligned view-all link. `align="center"` is
 * used for statement bands.
 */
export function NoirSectionHeading({
  title,
  eyebrow,
  viewAllText,
  viewAllLink,
  align = "start",
  className,
  children,
}: NoirSectionHeadingProps) {
  const { locale } = useMinimalI18n();
  const isAr = locale === "ar";
  const track = isAr ? "" : "tracking-[0.14em]";
  const trackWide = isAr ? "" : "tracking-[0.28em]";
  const centered = align === "center";

  return (
    <div
      className={cn(
        "flex gap-4 mb-8 md:mb-10",
        centered
          ? "flex-col items-center text-center"
          : "items-end justify-between",
        className,
      )}>
      <div className={cn(centered && "flex flex-col items-center")}>
        <div
          className={cn(NOIR_ACCENT_LINE, centered ? "mb-4" : "mb-3")}
          aria-hidden='true'
        />
        {eyebrow && (
          <p
            className={cn(
              "text-[11px] uppercase text-[#E8112D] font-medium mb-2",
              trackWide,
              NOIR_DISPLAY_FONT_CLASSES,
            )}>
            {eyebrow}
          </p>
        )}
        <h2
          className={cn(
            "text-2xl md:text-4xl uppercase font-semibold text-white leading-[1.05]",
            track,
            NOIR_DISPLAY_FONT_CLASSES,
          )}>
          {title}
        </h2>
        {children}
      </div>

      {!centered && viewAllText && viewAllLink && (
        <Link
          href={viewAllLink}
          className={cn(
            "group/va inline-flex items-center gap-1.5 text-[11px] uppercase text-white/70",
            "hover:text-[#E8112D] transition-colors duration-300 shrink-0 pb-1.5",
            isAr ? "" : "tracking-[0.2em]",
            NOIR_DISPLAY_FONT_CLASSES,
          )}>
          {viewAllText}
          <ArrowRight
            className='w-3 h-3 rtl:rotate-180 transition-transform duration-300 group-hover/va:translate-x-1 rtl:group-hover/va:-translate-x-1'
            strokeWidth={1.5}
          />
        </Link>
      )}
    </div>
  );
}
