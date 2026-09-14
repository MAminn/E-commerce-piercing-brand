/**
 * Layout Settings Types
 * CMS-driven header and footer configuration
 */

// ─── Navigation Link ────────────────────────────────────────────────────────

export interface NavigationLink {
  id: string;
  label: string;
  labelAr?: string;
  url: string;
  openInNewTab?: boolean;
  /** When true, link renders as a dropdown showing selected categories */
  isDropdown?: boolean;
  /** Category IDs to show in the dropdown */
  categoryIds?: string[];
}

// ─── Social Link ─────────────────────────────────────────────────────────────

export type SocialPlatform =
  | "facebook"
  | "instagram"
  | "tiktok"
  | "twitter"
  | "youtube"
  | "pinterest"
  | "linkedin";

export interface SocialLink {
  id: string;
  platform: SocialPlatform;
  url: string;
}

// ─── Footer Link Group ──────────────────────────────────────────────────────

export interface FooterLinkGroup {
  id: string;
  title: string;
  titleAr?: string;
  links: Array<{
    id: string;
    label: string;
    labelAr?: string;
    url: string;
  }>;
}

// ─── Navbar Style ────────────────────────────────────────────────────────────

export type NavbarStyle = "default" | "editorial" | "minimal";

// ─── Footer Style ────────────────────────────────────────────────────────────

export type FooterStyle = "default" | "editorial";

// ─── Header Settings ────────────────────────────────────────────────────────

// ─── Logo Size Settings ─────────────────────────────────────────────────────

export interface LogoSizeSettings {
  desktopWidth: number;
  desktopMaxHeight: number;
  mobileWidth: number;
  mobileMaxHeight: number;
}

export const DEFAULT_LOGO_SIZE: LogoSizeSettings = {
  desktopWidth: 140,
  desktopMaxHeight: 48,
  mobileWidth: 100,
  mobileMaxHeight: 36,
};

export const DEFAULT_FOOTER_LOGO_SIZE: LogoSizeSettings = {
  desktopWidth: 120,
  desktopMaxHeight: 40,
  mobileWidth: 100,
  mobileMaxHeight: 36,
};

// ─── Header Settings ────────────────────────────────────────────────────────

export interface HeaderSettings {
  logoUrl: string;
  logoSize: LogoSizeSettings;
  logoText: string;
  tagline: string;
  announcementBarEnabled: boolean;
  announcementBarText: string;
  navigationLinks: NavigationLink[];
  navbarStyle: NavbarStyle;
  /** Scrolling marquee for minimal template */
  marqueeEnabled?: boolean;
  marqueeText?: string;
  marqueeTextAr?: string;
  /** Marquee background color (hex). Defaults to white when unset. */
  marqueeBackgroundColor?: string;
  /** Marquee text color (hex). Defaults to black when unset. */
  marqueeTextColor?: string;
  /** Promo text line for product detail page (minimal template) */
  promoText?: string;
  promoTextAr?: string;
  /** Contact email shown in the info bar (minimal template) */
  contactEmail?: string;
}

// ─── Footer Settings ────────────────────────────────────────────────────────

export interface FooterSettings {
  logoUrl: string;
  logoText: string;
  logoTextAr?: string;
  logoSize: LogoSizeSettings;
  description: string;
  descriptionAr?: string;
  copyright: string;
  copyrightAr?: string;
  showNewsletter: boolean;
  footerStyle: FooterStyle;
  footerLinkGroups: FooterLinkGroup[];
  socialLinks: SocialLink[];
  /** Contact phone number shown in footer (minimal template) */
  contactPhone?: string;
  /** Contact email shown in footer (minimal template) */
  contactEmail?: string;
}

// ─── Combined Layout Settings ───────────────────────────────────────────────

/**
 * Per-locale translation overrides set by the admin via CMS.
 * Keys match the static `translations.ts` dictionary.
 */
export interface TranslationOverrides {
  en?: Record<string, string>;
  ar?: Record<string, string>;
}

export interface LayoutSettings {
  header: HeaderSettings;
  footer: FooterSettings;
  siteTitle?: string;
  faviconUrl?: string;
  /** Dedicated social-share preview image (og:image / Twitter card). Should be a 1200x630 banner — never reuse the header logo for this. */
  shareImageUrl?: string;
  translationOverrides?: TranslationOverrides;
}

// ─── Defaults ───────────────────────────────────────────────────────────────

export const DEFAULT_LAYOUT_SETTINGS: LayoutSettings = {
  siteTitle: "",
  faviconUrl: "",
  shareImageUrl: "",
  translationOverrides: { en: {}, ar: {} },
  header: {
    logoUrl: "",
    logoSize: { ...DEFAULT_LOGO_SIZE },
    logoText: "",
    tagline: "",
    announcementBarEnabled: false,
    announcementBarText: "",
    // One real destination. Placement/category navigation is added by the
    // admin once real categories exist (Dashboard > Layout Settings), where a
    // link can be marked as a dropdown bound to specific category IDs.
    navigationLinks: [{ id: "nav-shop", label: "Shop", url: "/shop" }],
    // ZELI's shell. See shared/config/storefront.ts for why minimal is the
    // foundation and what the alternatives still offer. Kept as a literal
    // (not an import) so this pure types module stays dependency-free —
    // DEFAULT_NAVBAR_STYLE is asserted equal to it by a unit test.
    navbarStyle: "minimal",
    marqueeEnabled: false,
    marqueeText: "",
    marqueeTextAr: "",
    marqueeBackgroundColor: "",
    marqueeTextColor: "",
    promoText: "",
    promoTextAr: "",
    contactEmail: "",
  },
  footer: {
    logoUrl: "",
    logoText: "",
    logoSize: { ...DEFAULT_FOOTER_LOGO_SIZE },
    description:
      "Sculptural piercings & curated jewelry — crafted with intention.",
    copyright: "",
    showNewsletter: true,
    footerStyle: "default",
    // Only routes that actually exist and work on an unconfigured store.
    // The previous defaults linked "Contact Us", "FAQ" and "Privacy Policy"
    // at "#" — footer links that looked real and did nothing. Policy and
    // company pages belong here once they exist; admins add them from
    // Dashboard > Layout Settings.
    footerLinkGroups: [
      {
        id: "shop",
        title: "Shop",
        links: [
          { id: "all-products", label: "All Products", url: "/shop" },
          { id: "offers", label: "Offers", url: "/offers" },
        ],
      },
      {
        id: "help",
        title: "Help",
        links: [
          { id: "contact", label: "Contact Us", url: "/contact" },
          { id: "account", label: "My Account", url: "/account" },
        ],
      },
    ],
    // Empty on purpose. Seeding "#" placeholders rendered three dead social
    // icons in every footer; the new brand's accounts don't exist yet and the
    // previous brand's are not being reused. Admins add real URLs from
    // Dashboard > Layout Settings, or set VITE_SOCIAL_* (see
    // shared/config/branding.ts) — until then no social row renders.
    socialLinks: [],
  },
};
