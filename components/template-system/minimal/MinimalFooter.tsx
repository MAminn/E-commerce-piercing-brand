import { useState } from "react";
import { usePageContext } from "vike-react/usePageContext";
import { Link } from "#root/components/utils/Link";
import { useLayoutSettings } from "#root/frontend/contexts/LayoutSettingsContext";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import {
  BRAND_LINE,
  BRAND_WORDMARK,
  STORE_NAME,
  STORE_SOCIAL_LINKS,
  isUsableUrl,
} from "#root/shared/config/branding";
import { isUsableHref } from "#root/shared/config/storefront";
import type { SocialPlatform } from "#root/shared/types/layout-settings";
import { Mail, Phone, Loader2, Send } from "lucide-react";
import { trpc } from "#root/shared/trpc/client";
import { toast } from "sonner";

// ─── Social Icons (inline SVGs for minimal bundle) ──────────────────────────

const FacebookIcon = () => (
  <svg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
    <path d='M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z' />
  </svg>
);
const InstagramIcon = () => (
  <svg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
    <rect x='2' y='2' width='20' height='20' rx='5' ry='5' />
    <path d='M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z' />
    <line x1='17.5' y1='6.5' x2='17.51' y2='6.5' />
  </svg>
);
const TikTokIcon = () => (
  <svg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
    <path d='M9 12a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' />
    <path d='M15 8c0 5 4 8 5 8' />
    <path d='M9 16v8' />
    <path d='M15 20V4c0-2 2-3 4-3' />
  </svg>
);
const TwitterIcon = () => (
  <svg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
    <path d='M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z' />
  </svg>
);
const YouTubeIcon = () => (
  <svg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
    <path d='M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17' />
    <path d='m10 15 5-3-5-3z' />
  </svg>
);
const WhatsAppIcon = () => (
  <svg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
    <path d='M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21' />
    <path d='M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1' />
  </svg>
);
const SnapchatIcon = () => (
  <svg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
    <path d='M12 2C8.5 2 6 5 6 8c0 1.5-.5 3-1 4-.5 1 0 2 1 2h1c-.5 1.5-2 2-3 2.5s-1 1.5 0 2c1.5.5 3 1 3 2.5 0 .5-.5 1-1 1h12c-.5 0-1-.5-1-1 0-1.5 1.5-2 3-2.5s1-1.5 0-2-2.5-1-3-2.5h1c1 0 1.5-1 1-2-.5-1-1-2.5-1-4 0-3-2.5-6-6-6z' />
  </svg>
);

const socialIconMap: Record<SocialPlatform | "whatsapp", React.FC> = {
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  tiktok: TikTokIcon,
  twitter: TwitterIcon,
  youtube: YouTubeIcon,
  pinterest: SnapchatIcon,
  linkedin: SnapchatIcon,
  whatsapp: WhatsAppIcon,
};

/**
 * Percé footer — the bottom of the dark brand frame.
 *
 * Ground background, Paper type, hairlines in the brand Line colour. The
 * lowercase wordmark, the brand line, the CMS link groups, contact, and the
 * social profiles. Social links come from the CMS first and fall back to the
 * VITE_SOCIAL_* environment (shared/config/branding.ts); anything not
 * configured is simply absent — no placeholder icons, no previous brand's
 * accounts.
 */
export function MinimalFooter() {
  const layoutSettings = useLayoutSettings();
  const { t, locale, dir } = useMinimalI18n();
  const { urlPathname } = usePageContext();
  const footer = layoutSettings.footer;
  // Dashboard > Layout Settings > Footer > "Show newsletter" is the switch.
  // The /offers page has its own newsletter signup box, so the duplicate is
  // also hidden there to avoid showing it twice on that page.
  const showNewsletter =
    footer.showNewsletter !== false && !urlPathname.startsWith("/offers");

  const logoText = locale === "ar" && footer.logoTextAr
    ? footer.logoTextAr
    : (footer.logoText || BRAND_WORDMARK);
  const logoAlt = footer.logoText || STORE_NAME;
  const showLogo = !!footer.logoUrl;
  // Drop links pointing at placeholders, then drop any group left empty —
  // the footer shows fewer columns rather than links that go nowhere.
  const linkGroups = (footer.footerLinkGroups ?? [])
    .map((g) => ({ ...g, links: g.links.filter((l) => isUsableHref(l.url)) }))
    .filter((g) => g.links.length > 0);
  // Placeholder ("#") and blank URLs are dropped — an unconfigured profile
  // should be absent, not a dead icon. CMS links win; the env-configured
  // profiles (STORE_SOCIAL_LINKS) are the fallback so the footer, /links and
  // emails all agree on which accounts exist.
  const cmsSocialLinks = (footer.socialLinks ?? []).filter((s) =>
    isUsableUrl(s.url),
  );
  const socialLinks: Array<{ id: string; platform: SocialPlatform | "whatsapp"; url: string }> =
    cmsSocialLinks.length > 0
      ? cmsSocialLinks
      : STORE_SOCIAL_LINKS.map((s) => ({ id: `env-${s.platform}`, platform: s.platform, url: s.url }));
  const copyright = locale === "ar" && footer.copyrightAr
    ? footer.copyrightAr
    : (footer.copyright || `${STORE_NAME} ${new Date().getFullYear()}`);
  const description = locale === "ar" && footer.descriptionAr
    ? footer.descriptionAr
    : footer.description;

  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [isSubscribing, setIsSubscribing] = useState(false);

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = newsletterEmail.trim();
    if (!email) return;
    setIsSubscribing(true);
    try {
      const result = await trpc.settings.subscribeNewsletter.mutate({ email });
      if (result.success) {
        toast.success(
          locale === "ar" ? "تم الاشتراك بنجاح!" : "You're subscribed!",
        );
        setNewsletterEmail("");
      } else {
        toast.error(
          result.error ||
            (locale === "ar" ? "فشل الاشتراك" : "Failed to subscribe"),
        );
      }
    } catch {
      toast.error(locale === "ar" ? "فشل الاشتراك" : "Failed to subscribe");
    } finally {
      setIsSubscribing(false);
    }
  };

  return (
    <footer className='bg-perce-ground text-perce-frame-ink border-t border-perce-frame-line'>
      {/* ── Newsletter signup ── */}
      {showNewsletter && (
        <div className='border-b border-perce-frame-line'>
          <div className='max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-10'>
            <div className='flex flex-col md:flex-row items-start md:items-center justify-between gap-4'>
              <div>
                {/* Heading only. The subtitle used to promise "offers" —
                    there is no offers/pricing programme yet, so no marketing
                    line ships by default. */}
                <h4 className='text-sm font-medium text-perce-frame-ink'>
                  {locale === "ar" ? "اشتركي في النشرة" : "Join the list"}
                </h4>
              </div>
              <form
                onSubmit={handleNewsletterSubmit}
                className='flex w-full md:w-auto max-w-md gap-2'>
                <input
                  type='email'
                  required
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  placeholder={locale === "ar" ? "بريدك الإلكتروني" : "Your email address"}
                  className='flex-1 md:w-64 px-4 py-2.5 text-sm border border-perce-frame-line bg-transparent text-perce-frame-ink placeholder:text-perce-frame-ink-muted outline-none focus:border-perce-frame-ink transition-colors'
                />
                <button
                  type='submit'
                  disabled={isSubscribing}
                  className='px-4 py-2.5 bg-perce-paper text-perce-ground text-sm font-medium hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shrink-0'
                  aria-label={locale === "ar" ? "اشتراك" : "Subscribe"}>
                  {isSubscribing ? (
                    <Loader2 className='w-4 h-4 animate-spin' />
                  ) : (
                    <Send className='w-4 h-4' />
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className='max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16'>
        <div className='grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8'>
          {/* ── Logo + description column ── */}
          <div className='md:col-span-4 flex flex-col items-start'>
            {showLogo ? (
              <img
                src={footer.logoUrl}
                alt={logoAlt}
                className='max-h-12 object-contain mb-4'
                style={{
                  width: footer.logoSize?.desktopWidth ?? 120,
                  maxHeight: footer.logoSize?.desktopMaxHeight ?? 40,
                }}
              />
            ) : (
              <span className='perce-wordmark text-2xl text-perce-frame-ink mb-3'>
                {logoText}
              </span>
            )}
            {/* The brand line, once. Not repeated anywhere else on the page. */}
            <p className='text-sm text-perce-frame-ink mb-3'>{BRAND_LINE}</p>
            {footer.description && (
              <p className='text-sm text-perce-frame-ink-muted leading-relaxed text-start max-w-xs'>
                {description}
              </p>
            )}
            {/* Practical facts only — both are true for every order: the
                store delivers Egypt-wide and cash on delivery is always
                offered (shared/config/payment.ts). The exchange window is
                deliberately NOT stated here until a returns policy is
                actually published on /return-policy. */}
            <p className='mt-4 text-xs text-perce-frame-ink-muted'>
              {locale === "ar"
                ? "توصيل لكل مصر · الدفع عند الاستلام"
                : "Delivery across Egypt · Cash on delivery"}
            </p>
          </div>

          {/* ── Link groups ── */}
          {linkGroups.map((group) => (
            <div
              key={group.id}
              className='md:col-span-2 flex flex-col items-start'>
              <h4 className='text-sm font-medium text-perce-frame-ink mb-4'>
                {locale === "ar" && group.titleAr ? group.titleAr : group.title}
              </h4>
              <ul className='space-y-2.5'>
                {group.links.map((link) => (
                  <li key={link.id}>
                    <Link
                      href={link.url}
                      className='text-sm text-perce-frame-ink-muted hover:text-perce-frame-ink transition-colors'>
                      {locale === "ar" && link.labelAr ? link.labelAr : link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* ── Contact us column ── */}
          {(footer.contactPhone || footer.contactEmail) && (
            <div className='md:col-span-2 flex flex-col items-start'>
              <h4 className='text-sm font-medium text-perce-frame-ink mb-4'>
                {t("footer.contact")}
              </h4>
              <ul className='space-y-2.5'>
                {footer.contactPhone && (
                  <li>
                    <a
                      href={`tel:${footer.contactPhone}`}
                      className='flex items-center gap-2 text-sm text-perce-frame-ink-muted hover:text-perce-frame-ink transition-colors'>
                      <Phone className='w-4 h-4 shrink-0' />
                      <span dir='ltr'>{footer.contactPhone}</span>
                    </a>
                  </li>
                )}
                {footer.contactEmail && (
                  <li>
                    <a
                      href={`mailto:${footer.contactEmail}`}
                      className='flex items-center gap-2 text-sm text-perce-frame-ink-muted hover:text-perce-frame-ink transition-colors'>
                      <Mail className='w-4 h-4 shrink-0' />
                      {footer.contactEmail}
                    </a>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* ── Social icons + payments + copyright ── */}
      <div className='border-t border-perce-frame-line'>
        <div className='max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6'>
          <div className='flex flex-col sm:flex-row items-center justify-between gap-4'>
            {/* Social icons */}
            {socialLinks.length > 0 && (
              <div className='flex items-center gap-3'>
                {socialLinks.map((link) => {
                  const Icon = socialIconMap[link.platform];
                  if (!Icon) return null;
                  return (
                    <a
                      key={link.id}
                      href={link.url}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='text-perce-frame-ink-muted hover:text-perce-frame-ink transition-colors'
                      aria-label={link.platform}>
                      <Icon />
                    </a>
                  );
                })}
              </div>
            )}

            {/* Payment methods.
                This used to hardcode Visa / Mastercard / Apple Pay / Mada as
                accepted methods. Which methods a customer can actually use is
                decided by what is configured in shared/config/payment.ts
                (Paymob and/or Stripe, else cash on delivery) — and this store
                currently has no gateway keys set, so all four badges were a
                promise checkout could not keep. Mada in particular is a Saudi
                network, not an Egyptian one.

                Rather than guess, the real accepted methods are shown at
                checkout where they are derived from live configuration. */}

            {/* Copyright */}
            <p className='text-xs text-perce-frame-ink-muted'>
              {t("footer.copyright")} · {copyright}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
