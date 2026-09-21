import { Link } from "#root/components/utils/Link";
import { useLayoutSettings } from "#root/frontend/contexts/LayoutSettingsContext";
import { BRAND_WORDMARK, STORE_NAME } from "#root/shared/config/branding";
import { DEFAULT_FOOTER_LOGO_SIZE } from "#root/shared/types/layout-settings";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface FooterLogoProps {
  /** CSS class applied to the text logo link. */
  textClassName?: string;
  /** CSS class applied to the image element. */
  imgClassName?: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

/**
 * Global footer logo component.
 *
 * Renders exactly ONE logo element based on CMS footer settings:
 * 1. If `footer.logoUrl` exists → `<img>` (no filters, rendered as-is)
 * 2. Else if `footer.logoText` exists → styled text
 * 3. Else → the lowercase Percé wordmark
 *
 * All footer variants should use this instead of inline logo logic.
 */
export function FooterLogo({
  textClassName = "perce-wordmark inline-block text-xl md:text-2xl text-perce-frame-ink hover:text-perce-frame-ink-muted transition-colors",
  imgClassName = "",
}: FooterLogoProps) {
  const { footer } = useLayoutSettings();
  const size = footer.logoSize ?? DEFAULT_FOOTER_LOGO_SIZE;

  const logoText = footer.logoText || BRAND_WORDMARK;
  const logoAlt = footer.logoText || STORE_NAME;

  if (footer.logoUrl) {
    return (
      <Link
        href='/'
        className='inline-block hover:opacity-70 transition-opacity duration-500'>
        <img
          src={footer.logoUrl}
          alt={logoAlt}
          className={`object-cover ${imgClassName}`}
          style={{ width: size.desktopWidth, maxHeight: size.desktopMaxHeight }}
        />
      </Link>
    );
  }

  return (
    <Link href='/' className={textClassName}>
      {logoText}
    </Link>
  );
}
