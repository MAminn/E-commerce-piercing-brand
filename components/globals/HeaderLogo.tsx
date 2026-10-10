import { Link } from "#root/components/utils/Link";
import { useLayoutSettings } from "#root/frontend/contexts/LayoutSettingsContext";
import { STORE_NAME } from "#root/shared/config/branding";
import { DEFAULT_LOGO_SIZE } from "#root/shared/types/layout-settings";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface HeaderLogoProps {
  /** CSS class applied to the text logo `<span>`. */
  textClassName?: string;
  /** Called when the logo link is clicked (e.g. to close a sheet). */
  onClick?: () => void;
  /**
   * Which CMS size to render. "responsive" uses the mobile size below the
   * `lg` breakpoint and the desktop size from `lg` up — for a header bar
   * that is on screen at every width.
   */
  variant?: "desktop" | "mobile" | "responsive";
}

/* ------------------------------------------------------------------ */
/*  Resolved logo data (for navbars that need raw values)             */
/* ------------------------------------------------------------------ */

export interface ResolvedHeaderLogo {
  kind: "image" | "text";
  /** Image URL (only when kind === "image"). */
  imageUrl: string;
  /** Resolved display text: logoText → STORE_NAME ("Percé"), exactly as typed. */
  text: string;
  /** Accessible name for an image logo: logoText → STORE_NAME ("Percé"). */
  alt: string;
  /** Width in px for the current variant. */
  width: number;
  /** Max-height in px for the current variant. */
  maxHeight: number;
}

/**
 * Hook that resolves the global header logo data from CMS settings.
 * Every navbar variant should call this to get a single source of truth.
 */
export function useResolvedHeaderLogo(
  variant: "desktop" | "mobile" = "desktop",
): ResolvedHeaderLogo {
  const { header } = useLayoutSettings();
  const size = header.logoSize ?? DEFAULT_LOGO_SIZE;
  // An uploaded logo image always wins. Without one the header shows the
  // brand name "Percé" — capital P, accent — or the admin's logoText, and the
  // navbars render it exactly as typed (no forced lowercase/uppercase).
  // Whitespace-only fields count as empty rather than rendering a blank logo.
  const logoText = header.logoText?.trim() ?? "";
  const logoUrl = header.logoUrl?.trim() ?? "";
  const text = logoText || STORE_NAME;

  return {
    kind: logoUrl ? "image" : "text",
    imageUrl: logoUrl,
    text,
    alt: text,
    width: variant === "desktop" ? size.desktopWidth : size.mobileWidth,
    maxHeight:
      variant === "desktop" ? size.desktopMaxHeight : size.mobileMaxHeight,
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

/**
 * Global header logo component.
 *
 * Renders exactly ONE logo element (image or text) based on CMS settings.
 * All navbar variants should use this instead of inline logo logic.
 *
 * - If `header.logoUrl` exists → `<img>` with CMS sizing, no filters and no
 *   backing box: a transparent logo sits directly on whatever is behind the
 *   header (the hero, or the solid bar once scrolled).
 * - Else if `header.logoText` exists → styled text, as typed.
 * - Else → "Percé".
 */
export function HeaderLogo({
  textClassName = "",
  onClick,
  variant = "desktop",
}: HeaderLogoProps) {
  const isResponsive = variant === "responsive";
  const logo = useResolvedHeaderLogo(isResponsive ? "desktop" : variant);
  const mobile = useResolvedHeaderLogo("mobile");

  if (logo.kind === "image") {
    return (
      <Link href='/' onClick={onClick} className='inline-flex items-center'>
        {/* `height: auto` + object-contain: the CMS width and max-height are
            a box the logo fits inside at its own proportions — never
            stretched to fill it. */}
        <img
          src={logo.imageUrl}
          alt={logo.alt}
          className={
            isResponsive
              ? "block h-auto object-contain w-(--logo-w) max-h-(--logo-h) lg:w-(--logo-w-lg) lg:max-h-(--logo-h-lg)"
              : "block h-auto object-contain"
          }
          style={
            isResponsive
              ? ({
                  "--logo-w": `${mobile.width}px`,
                  "--logo-h": `${mobile.maxHeight}px`,
                  "--logo-w-lg": `${logo.width}px`,
                  "--logo-h-lg": `${logo.maxHeight}px`,
                } as React.CSSProperties)
              : { width: logo.width, maxHeight: logo.maxHeight }
          }
          decoding='async'
        />
      </Link>
    );
  }

  return (
    <Link href='/' onClick={onClick} className={textClassName}>
      {logo.text}
    </Link>
  );
}
