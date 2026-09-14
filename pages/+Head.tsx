import defaultFaviconUrl from "../assets/favicon.svg";
import { useEffect } from "react";
import { usePageContext } from "vike-react/usePageContext";
import type { LayoutSettings } from "#root/shared/types/layout-settings";
import { STORE_NAME, STORE_DESCRIPTION } from "#root/shared/config/branding";
import { getPublicOrigin, toAbsoluteUrl } from "#root/shared/config/site-url";
import { buildTypographyHeadCss } from "#root/shared/typography/build-head-css";

export default function HeadDefault() {
  const pageContext = usePageContext();
  const layoutSettings = pageContext.layoutSettingsData as
    | LayoutSettings
    | undefined;
  const typographyCss = buildTypographyHeadCss(
    pageContext.typographySettings,
    pageContext.customFonts,
  );
  const activeGA4PixelId = pageContext.activeGA4PixelId;
  // Noir is the only template needing Google-hosted fonts; see the <head>
  // comment below. `templateSelection` is already passed to the client
  // (pages/+config.ts), so this is SSR-safe and needs no extra round trip.
  const templateSelection = pageContext.templateSelection as
    | Record<string, string>
    | undefined;
  const isNoirTemplate = templateSelection?.landing === "landing-noir";

  // Dynamic favicon from layout settings
  const faviconUrl = layoutSettings?.faviconUrl || defaultFaviconUrl;
  const faviconType = layoutSettings?.faviconUrl
    ? layoutSettings.faviconUrl.endsWith(".svg")
      ? "image/svg+xml"
      : layoutSettings.faviconUrl.endsWith(".png")
        ? "image/png"
        : layoutSettings.faviconUrl.endsWith(".ico")
          ? "image/x-icon"
          : "image/png"
    : "image/svg+xml";

  const siteTitle =
    pageContext.brandName ||
    layoutSettings?.siteTitle ||
    STORE_NAME;
  const siteDescription = STORE_DESCRIPTION;
  const cmsShareImageUrl = layoutSettings?.shareImageUrl?.trim();
  const cmsLogoUrl = layoutSettings?.header?.logoUrl?.trim();
  // Prefer the dedicated share-preview banner. Only fall back to the navbar
  // logo (small, often transparent) if no banner has been uploaded yet —
  // and never claim it's 1200x630 below, since it isn't.
  const ogImageUrl = cmsShareImageUrl
    ? toAbsoluteUrl(cmsShareImageUrl)
    : cmsLogoUrl
      ? toAbsoluteUrl(cmsLogoUrl)
      : undefined;
  const ogImageHasKnownSize = Boolean(cmsShareImageUrl);
  const siteOrigin = getPublicOrigin();
  const canonicalUrl =
    typeof pageContext.urlPathname === "string"
      ? `${siteOrigin}${pageContext.urlPathname}`
      : siteOrigin;

  // Dynamic document title from layout settings (client-side only)
  useEffect(() => {
    if (layoutSettings?.siteTitle) {
      document.title = layoutSettings.siteTitle;
    }
  }, [layoutSettings?.siteTitle]);

  return (
    <>
      {/* Basic favicon */}
      <link rel='icon' href={faviconUrl} type={faviconType} />

      {/* Blocking locale/dir sync — runs before first paint to prevent LTR→RTL flicker */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var l=localStorage.getItem("minimal-template-locale");if(l==="ar"){document.documentElement.setAttribute("dir","rtl");document.documentElement.setAttribute("lang","ar")}if(l&&document.cookie.indexOf("minimal-locale=")===-1){document.cookie="minimal-locale="+l+";path=/;max-age=31536000;SameSite=Lax"}}catch(e){}})();`,
        }}
      />

      {/* GA4: server-rendered so the tag is live on first paint instead of
          waiting on client hydration + a tRPC round trip. The adapter
          (frontend/pixel-adapters/google-ga4-adapter.ts) detects this via
          the data-pixel-platform/data-pixel-id attributes and skips
          re-injecting the script or redefining window.gtag. */}
      {activeGA4PixelId && (
        <>
          <script
            async
            src={`https://www.googletagmanager.com/gtag/js?id=${activeGA4PixelId}`}
            data-pixel-platform='google_ga4'
            data-pixel-id={activeGA4PixelId}
          />
          <script
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag("js",new Date());gtag("config",${JSON.stringify(
                activeGA4PixelId,
              )},{send_page_view:false});`,
            }}
          />
        </>
      )}

      {/* ── Fonts ──────────────────────────────────────────────────────
          The storefront's base families (Poppins, Rubik, Roboto Flex) are
          self-hosted via @fontsource and imported at the top of
          layouts/style.css — they are part of the CSS bundle and need no
          network preconnect. Admin-assigned fonts arrive as real @font-face
          rules in the <style> block at the bottom of this head, emitted by
          shared/typography/build-head-css.ts. That is the ONLY runtime
          typography path; nothing here declares a family.

          Noir (Demo 5) is the one exception: it needs Oswald + IBM Plex Mono
          from Google Fonts. Loading those on every page cost two render-
          blocking requests for fonts no other template uses, so they now
          load only when the Noir landing template is actually active. */}
      {isNoirTemplate && (
        <>
          <link rel='preconnect' href='https://fonts.googleapis.com' />
          <link
            rel='preconnect'
            href='https://fonts.gstatic.com'
            crossOrigin='anonymous'
          />
          <link
            rel='stylesheet'
            href='https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap'
          />
        </>
      )}

      {/* Meta tags for performance */}
      <meta
        name='viewport'
        content='width=device-width, initial-scale=1.0, viewport-fit=cover'
      />
      <meta httpEquiv='Content-Type' content='text/html; charset=utf-8' />
      <meta name='description' content={siteDescription} />

      {/* Open Graph / social link previews */}
      <meta property='og:type' content='website' />
      <meta property='og:site_name' content={siteTitle} />
      <meta property='og:title' content={siteTitle} />
      <meta property='og:description' content={siteDescription} />
      <meta property='og:url' content={canonicalUrl} />
      {ogImageUrl && (
        <>
          <meta property='og:image' content={ogImageUrl} />
          <meta property='og:image:secure_url' content={ogImageUrl} />
          <meta
            property='og:image:type'
            content={
              ogImageUrl.endsWith(".png")
                ? "image/png"
                : ogImageUrl.endsWith(".webp")
                  ? "image/webp"
                  : "image/jpeg"
            }
          />
          {/* Only declare width/height for the dedicated share banner, which is
              actually processed to this size. Declaring it for the navbar-logo
              fallback lies about the real dimensions and makes crawlers
              (WhatsApp, Facebook, iMessage) force-crop/zoom the small logo. */}
          {ogImageHasKnownSize && (
            <>
              <meta property='og:image:width' content='1200' />
              <meta property='og:image:height' content='630' />
            </>
          )}
          <meta property='og:image:alt' content={`${siteTitle} logo`} />
        </>
      )}

      {/* Twitter / X card */}
      <meta name='twitter:card' content={ogImageUrl ? "summary_large_image" : "summary"} />
      <meta name='twitter:title' content={siteTitle} />
      <meta name='twitter:description' content={siteDescription} />
      {ogImageUrl && <meta name='twitter:image' content={ogImageUrl} />}

      {/* Core Web Vitals hints */}
      <meta name='theme-color' content='#ffffff' />
      <meta name='color-scheme' content='light' />

      {/* Critical CSS — layout only. Deliberately declares NO font-family:
          that is owned by layouts/style.css (.storefront-shell rules reading
          the --font-* vars). A `body { font-family: Poppins }` here used to
          win over an admin's configured body font on first paint, producing
          a visible font swap on hydration. */}
      <style>{`
        body { margin: 0; }
        img { display: block; max-width: 100%; }
        /* Never let a single wide child scroll the whole page sideways. */
        html, body { overflow-x: hidden; }
        .hero-section { position: relative; height: 90vh; overflow: hidden; }
        .hero-content { position: relative; z-index: 9; }
        .hero-bg {
          position: absolute;
          inset: 0;
          background-position: center;
          background-size: cover;
        }
      `}</style>

      {/* Admin-configured typography (Dashboard > Typography): custom
          @font-face rules for uploaded fonts actually assigned to a role,
          plus the --font-* CSS vars every template reads from. Falls back
          to the defaults above when nothing's been configured. */}
      <style>{typographyCss}</style>
    </>
  );
}
