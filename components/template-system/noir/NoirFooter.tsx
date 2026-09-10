import { useState, type FC, type FormEvent } from "react";
import { Link } from "#root/components/utils/Link";
import { ArrowRight } from "lucide-react";
import { STORE_NAME } from "#root/shared/config/branding";
import { useLayoutSettings } from "#root/frontend/contexts/LayoutSettingsContext";
import type { SocialPlatform } from "#root/shared/types/layout-settings";
import { FooterLogo } from "#root/components/globals/FooterLogo";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { cn } from "#root/lib/utils";
import {
  NOIR_ACCENT_BG_CLASSES,
  NOIR_DISPLAY_FONT_CLASSES,
} from "./noir-tokens";

/* ------------------------------------------------------------------ */
/*  Social Icons                                                      */
/* ------------------------------------------------------------------ */

const FacebookIcon = () => (
  <svg
    xmlns='http://www.w3.org/2000/svg'
    width='18'
    height='18'
    viewBox='0 0 24 24'
    fill='none'
    stroke='currentColor'
    strokeWidth='1.2'
    strokeLinecap='round'
    strokeLinejoin='round'
    aria-labelledby='noir-facebook-title'>
    <title id='noir-facebook-title'>Facebook</title>
    <path d='M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z' />
  </svg>
);

const InstagramIcon = () => (
  <svg
    xmlns='http://www.w3.org/2000/svg'
    width='18'
    height='18'
    viewBox='0 0 24 24'
    fill='none'
    stroke='currentColor'
    strokeWidth='1.2'
    strokeLinecap='round'
    strokeLinejoin='round'
    aria-labelledby='noir-instagram-title'>
    <title id='noir-instagram-title'>Instagram</title>
    <rect x='2' y='2' width='20' height='20' rx='5' ry='5' />
    <path d='M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z' />
    <line x1='17.5' y1='6.5' x2='17.51' y2='6.5' />
  </svg>
);

const TikTokIcon = () => (
  <svg
    xmlns='http://www.w3.org/2000/svg'
    width='18'
    height='18'
    viewBox='0 0 24 24'
    fill='none'
    stroke='currentColor'
    strokeWidth='1.2'
    strokeLinecap='round'
    strokeLinejoin='round'
    aria-labelledby='noir-tiktok-title'>
    <title id='noir-tiktok-title'>TikTok</title>
    <path d='M9 12a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' />
    <path d='M15 8c0 5 4 8 5 8' />
    <path d='M9 16v8' />
    <path d='M15 20V4c0-2 2-3 4-3' />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Data                                                              */
/* ------------------------------------------------------------------ */

const DEFAULT_SOCIAL_LINKS = [
  { id: "facebook", name: "Facebook", url: "#", Icon: FacebookIcon },
  { id: "instagram", name: "Instagram", url: "#", Icon: InstagramIcon },
  { id: "tiktok", name: "TikTok", url: "#", Icon: TikTokIcon },
];

const socialIconMap: Record<SocialPlatform, FC> = {
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  tiktok: TikTokIcon,
  twitter: FacebookIcon,
  youtube: FacebookIcon,
  pinterest: FacebookIcon,
  linkedin: FacebookIcon,
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

/**
 * Noir Footer — dark luxury variant.
 *
 * Structure mirrors EditorialFooter (brand blurb + socials | link
 * columns | newsletter | legal strip) including its useLayoutSettings
 * CMS integration, restyled to Noir: pure black bg, white/10 hairline
 * dividers, uppercase tracked column headings, signal-red hover states,
 * newsletter input with red submit button.
 */
export function NoirFooter() {
  const [email, setEmail] = useState("");
  const layoutSettings = useLayoutSettings();
  const { t, locale } = useMinimalI18n();
  const isAr = locale === "ar";
  // Letter-spacing utilities are gated off for Arabic (rule 8)
  const trackWide = isAr ? "" : "tracking-[0.28em]";
  const trackTight = isAr ? "" : "tracking-[0.08em]";

  // CMS values with fallbacks
  const effectiveDescription =
    layoutSettings.footer.description ||
    (isAr
      ? "فخامة داكنة، حضور واثق. صُمم بعناية للفرد العصري."
      : "Dark luxury, bold presence. Crafted with intention for the modern individual.");
  const effectiveCopyright = layoutSettings.footer.copyright || STORE_NAME;
  const effectiveShowNewsletter = layoutSettings.footer.showNewsletter;

  const DEFAULT_FOOTER_COLUMNS = [
    {
      title: isAr ? "تسوق" : "Shop",
      links: [
        { label: isAr ? "كل المنتجات" : "All Products", href: "/shop" },
        { label: t("new_arrivals"), href: "/shop" },
      ],
    },
    {
      title: isAr ? "الشركة" : "Company",
      links: [
        { label: isAr ? "من نحن" : "About", href: "#" },
        { label: isAr ? "وظائف" : "Careers", href: "#" },
      ],
    },
    {
      title: isAr ? "الدعم" : "Support",
      links: [
        { label: isAr ? "اتصل بنا" : "Contact Us", href: "#" },
        { label: isAr ? "الشحن والإرجاع" : "Shipping & Returns", href: "#" },
        { label: isAr ? "الأسئلة الشائعة" : "FAQ", href: "#" },
        { label: isAr ? "سياسة الخصوصية" : "Privacy Policy", href: "#" },
      ],
    },
  ];

  // Build social links from CMS if available
  const SOCIAL_LINKS =
    layoutSettings.footer.socialLinks.length > 0
      ? layoutSettings.footer.socialLinks.map((sl) => ({
          id: sl.id,
          name: sl.platform.charAt(0).toUpperCase() + sl.platform.slice(1),
          url: sl.url,
          Icon: socialIconMap[sl.platform] ?? FacebookIcon,
        }))
      : DEFAULT_SOCIAL_LINKS;

  // Build footer columns from CMS if available
  const FOOTER_COLUMNS =
    layoutSettings.footer.footerLinkGroups.length > 0
      ? layoutSettings.footer.footerLinkGroups.map((g) => ({
          title: g.title,
          links: g.links.map((l) => ({ label: l.label, href: l.url })),
        }))
      : DEFAULT_FOOTER_COLUMNS;

  const handleSubscribe = (e: FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      alert(
        isAr
          ? `شكراً لاشتراكك عبر ${email}!`
          : `Thank you for subscribing with ${email}!`,
      );
      setEmail("");
    }
  };

  return (
    <footer className='bg-black text-[#A3A3A3] selection:bg-[#E8112D]/30'>
      {/* ── Newsletter ── */}
      {effectiveShowNewsletter && (
        <div data-footer-newsletter className='border-b border-white/10'>
          <div className='mx-auto max-w-6xl px-6 md:px-12 lg:px-10 py-16 md:py-20'>
            <div className='max-w-xl mx-auto text-center space-y-6'>
              <div className='w-8 h-px bg-[#E8112D] mx-auto' />
              <h3
                className={cn(
                  "text-xs uppercase text-white font-medium",
                  trackWide,
                  NOIR_DISPLAY_FONT_CLASSES,
                )}>
                {isAr ? "ابق على اطلاع" : "Stay in the loop"}
              </h3>
              <p className='text-sm text-[#A3A3A3] leading-relaxed max-w-sm mx-auto'>
                {isAr
                  ? "وصل حديثاً، عروض حصرية ولحظات مميزة — مباشرة إلى بريدك."
                  : "New arrivals, exclusive drops & signature moments — straight to your inbox."}
              </p>
              <form
                onSubmit={handleSubscribe}
                className='flex items-stretch gap-3 max-w-sm mx-auto pt-2'>
                <input
                  type='email'
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={isAr ? "بريدك الإلكتروني" : "your@email.com"}
                  required
                  className='flex-1 bg-[#101010] border border-white/10 px-4 py-3 text-sm text-white placeholder:text-[#6B6B6B] rounded-lg focus:outline-none focus:border-[#E8112D] transition-colors duration-300'
                />
                <button
                  type='submit'
                  className={cn(
                    "px-4 rounded-lg text-white transition-colors duration-300",
                    NOIR_ACCENT_BG_CLASSES,
                  )}
                  aria-label={isAr ? "اشترك" : "Subscribe"}>
                  <ArrowRight
                    className='w-4.5 h-4.5 rtl:rotate-180'
                    strokeWidth={1.5}
                  />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── Main grid ── */}
      <div className='mx-auto max-w-6xl px-6 md:px-12 lg:px-10 py-14 md:py-16'>
        <div className='grid grid-cols-1 md:grid-cols-12 gap-12 md:gap-8 lg:gap-10'>
          {/* Brand column */}
          <div className='md:col-span-4 lg:col-span-4 space-y-5'>
            <FooterLogo
              textClassName={cn(
                "inline-block text-xl md:text-2xl font-semibold text-white uppercase hover:text-[#E8112D] transition-colors duration-300",
                isAr ? "" : "tracking-[0.14em]",
                NOIR_DISPLAY_FONT_CLASSES,
              )}
            />
            <div className='w-8 h-px bg-white/10' />
            <p className='text-xs text-[#A3A3A3] leading-relaxed max-w-65'>
              {effectiveDescription}
            </p>
            <div className='flex items-center gap-5 pt-2'>
              {SOCIAL_LINKS.map((social) => (
                <a
                  key={social.id}
                  href={social.url}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='text-[#6B6B6B] hover:text-[#E8112D] transition-colors duration-300'
                  aria-label={`Visit our ${social.name} page`}>
                  <social.Icon />
                </a>
              ))}
            </div>
          </div>

          {/* Spacer */}
          <div className='hidden lg:block lg:col-span-2' />

          {/* Link columns */}
          {FOOTER_COLUMNS.map((column) => (
            <div key={column.title} className='md:col-span-2 lg:col-span-2'>
              <h4
                className={cn(
                  "text-[10px] uppercase text-white font-medium mb-6",
                  trackWide,
                  NOIR_DISPLAY_FONT_CLASSES,
                )}>
                {column.title}
              </h4>
              <ul className='space-y-4'>
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className='text-sm text-[#A3A3A3] hover:text-[#E8112D] transition-colors duration-300'>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* ── Legal strip ── */}
      <div className='border-t border-white/10'>
        <div className='mx-auto max-w-6xl px-6 md:px-12 lg:px-10 py-6 flex flex-col md:flex-row items-center justify-between gap-4'>
          <p className={cn("text-[10px] text-[#6B6B6B]", trackTight)}>
            &copy; {new Date().getFullYear()} {effectiveCopyright}
          </p>
          <div className='flex items-center gap-6'>
            <Link
              href='#'
              className={cn(
                "text-[10px] text-[#6B6B6B] hover:text-[#E8112D] transition-colors duration-300",
                trackTight,
              )}>
              {isAr ? "الشروط" : "Terms"}
            </Link>
            <Link
              href='#'
              className={cn(
                "text-[10px] text-[#6B6B6B] hover:text-[#E8112D] transition-colors duration-300",
                trackTight,
              )}>
              {isAr ? "الخصوصية" : "Privacy"}
            </Link>
            <Link
              href='#'
              className={cn(
                "text-[10px] text-[#6B6B6B] hover:text-[#E8112D] transition-colors duration-300",
                trackTight,
              )}>
              {isAr ? "ملفات تعريف الارتباط" : "Cookies"}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
