/**
 * Homepage hero background video — rules shared by the upload route, the
 * admin form and the storefront hero, so all three agree on what a valid hero
 * video is and when it plays.
 */

/** 50MB. A hero loop should be a few MB; this leaves room without inviting raw exports. */
export const HERO_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

export const HERO_VIDEO_FORMATS = {
  mp4: { extension: "mp4", mimeTypes: ["video/mp4"] },
  webm: { extension: "webm", mimeTypes: ["video/webm"] },
} as const;

export type HeroVideoFormat = keyof typeof HERO_VIDEO_FORMATS;

/** `accept` attribute for the admin file inputs. */
export const HERO_VIDEO_ACCEPT = "video/mp4,video/webm,.mp4,.webm";

/**
 * Same breakpoint the hero's `<picture>` uses for `mobileImageUrl`, so the
 * mobile video and the mobile poster image switch at the same width.
 */
export const HERO_MOBILE_MEDIA_QUERY = "(max-width: 767px)";

/** Matches a declared MIME type or file extension to a supported format. */
export function heroVideoFormatFromMime(mimeType: string): HeroVideoFormat | null {
  const mime = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  for (const [format, spec] of Object.entries(HERO_VIDEO_FORMATS)) {
    if ((spec.mimeTypes as readonly string[]).includes(mime)) {
      return format as HeroVideoFormat;
    }
  }
  return null;
}

export function heroVideoFormatFromFilename(filename: string): HeroVideoFormat | null {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (!filename.includes(".")) return null;
  for (const [format, spec] of Object.entries(HERO_VIDEO_FORMATS)) {
    if (spec.extension === ext) return format as HeroVideoFormat;
  }
  return null;
}

/**
 * A stored hero video URL must be a same-origin path ("/uploads/...") or an
 * absolute https URL. Protocol-relative ("//host") and http URLs are rejected:
 * the first hides the origin, the second is blocked as mixed content on the
 * https storefront anyway.
 */
export function isAllowedHeroVideoUrl(url: string): boolean {
  const value = url.trim();
  if (!value) return true;
  if (value.startsWith("/")) return !value.startsWith("//");
  return /^https:\/\/[^\s/]+/i.test(value);
}

export interface HeroVideoEnvironment {
  desktopSrc?: string | null;
  mobileSrc?: string | null;
  isMobile: boolean;
  prefersReducedMotion: boolean;
  /** `navigator.connection.saveData` where the browser exposes it. */
  saveData?: boolean;
}

/**
 * Which video the hero should play, or null to keep the still image.
 *
 * Mobile uses the mobile video and falls back to the desktop one; desktop and
 * tablet always use the desktop one. Reduced motion and Save-Data both keep the
 * poster image — an autoplaying loop is exactly what those settings opt out of.
 */
export function selectHeroVideoSource({
  desktopSrc,
  mobileSrc,
  isMobile,
  prefersReducedMotion,
  saveData = false,
}: HeroVideoEnvironment): string | null {
  if (prefersReducedMotion || saveData) return null;
  const desktop = desktopSrc?.trim() || null;
  const mobile = mobileSrc?.trim() || null;
  if (isMobile) return mobile ?? desktop;
  return desktop;
}
