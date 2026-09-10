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
  /** Which size variant to render. */
  variant?: "desktop" | "mobile";
}

/* ------------------------------------------------------------------ */
/*  Resolved logo data (for navbars that need raw values)             */
/* ------------------------------------------------------------------ */

export interface ResolvedHeaderLogo {
  kind: "image" | "text";
  /** Image URL (only when kind === "image"). */
  imageUrl: string;
  /** Resolved display text: logoText → STORE_NAME. */
  text: string;
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
  const text = header.logoText || STORE_NAME;

  return {
    kind: header.logoUrl ? "image" : "text",
    imageUrl: header.logoUrl,
    text,
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
 * - If `header.logoUrl` exists → `<img>` with CMS sizing, no filters.
 * - Else if `header.logoText` exists → styled text.
 * - Else → STORE_NAME fallback.
 */
export function HeaderLogo({
  textClassName = "",
  onClick,
  variant = "desktop",
}: HeaderLogoProps) {
  const logo = useResolvedHeaderLogo(variant);

  if (logo.kind === "image") {
    return (
      <Link href='/' onClick={onClick}>
        <img
          src={logo.imageUrl}
          alt={logo.text}
          className='object-contain'
          style={{ width: logo.width, maxHeight: logo.maxHeight }}
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
