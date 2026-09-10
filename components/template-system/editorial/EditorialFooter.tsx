import { useState, type FC } from "react";
import { Link } from "#root/components/utils/Link";
import { ArrowRight } from "lucide-react";
import { STORE_NAME } from "#root/shared/config/branding";
import { useLayoutSettings } from "#root/frontend/contexts/LayoutSettingsContext";
import type { SocialPlatform } from "#root/shared/types/layout-settings";
import { FooterLogo } from "#root/components/globals/FooterLogo";

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
    aria-labelledby='ed-facebook-title'>
    <title id='ed-facebook-title'>Facebook</title>
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
    aria-labelledby='ed-instagram-title'>
    <title id='ed-instagram-title'>Instagram</title>
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
    aria-labelledby='ed-tiktok-title'>
    <title id='ed-tiktok-title'>TikTok</title>
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

const DEFAULT_FOOTER_COLUMNS = [
  {
    title: "Shop",
    links: [
      { label: "All Products", href: "/shop" },
      { label: "New Arrivals", href: "/shop" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Sustainability", href: "#" },
      { label: "Careers", href: "#" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Contact Us", href: "#" },
      { label: "Shipping & Returns", href: "#" },
      { label: "FAQ", href: "#" },
      { label: "Privacy Policy", href: "#" },
    ],
  },
] as const;

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
 * Editorial Footer — Zara / COS calm aesthetic.
 *
 * - `bg-stone-950` dark canvas
 * - 4-column desktop: Brand | Shop | Company | Support
 * - Newsletter section at top
 * - Social icons, legal strip at bottom
 * - text-xs tracking-[0.32em] uppercase headings
 * - text-sm text-white/75 links
 */
export function EditorialFooter() {
  const [email, setEmail] = useState("");
  const layoutSettings = useLayoutSettings();

  // CMS values with fallbacks
  const effectiveDescription =
    layoutSettings.footer.description ||
    "Curated fashion, quiet confidence. Crafted with intention for the modern individual.";
  const effectiveCopyright = layoutSettings.footer.copyright || STORE_NAME;
  const effectiveShowNewsletter = layoutSettings.footer.showNewsletter;

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

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      alert(`Thank you for subscribing with ${email}!`);
      setEmail("");
    }
  };

  return (
    <footer className='bg-stone-950 text-white/60 selection:bg-white/10'>
      {/* ── Newsletter ── */}
      {effectiveShowNewsletter && (
        <div className='border-b border-white/[0.06]'>
          <div className='mx-auto max-w-6xl px-6 md:px-12 lg:px-10 py-16 md:py-20'>
            <div className='max-w-xl mx-auto text-center space-y-6'>
              <div className='w-8 h-px bg-white/15 mx-auto' />
              <h3 className='text-xs tracking-[0.32em] uppercase text-white/50 font-light'>
                Stay in the loop
              </h3>
              <p className='text-sm text-white/40 font-light leading-relaxed max-w-sm mx-auto'>
                New arrivals, exclusive offers &amp; editorial moments —
                delivered quietly.
              </p>
              <form
                onSubmit={handleSubscribe}
                className='flex items-end gap-4 max-w-sm mx-auto pt-2'>
                <input
                  type='email'
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder='your@email.com'
                  required
                  className='flex-1 bg-transparent border-0 border-b border-white/10 px-0 pb-3 pt-1 text-sm text-white/80 placeholder:text-white/20 font-light tracking-wide focus:outline-none focus:border-white/40 transition-colors duration-500'
                />
                <button
                  type='submit'
                  className='pb-3 text-white/30 hover:text-white/70 transition-colors duration-500'
                  aria-label='Subscribe'>
                  <ArrowRight className='w-[18px] h-[18px]' strokeWidth={1.2} />
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
            <FooterLogo textClassName='inline-block text-xl md:text-2xl font-extralight tracking-[0.18em] text-white/90 uppercase hover:text-white transition-colors duration-500' />
            <div className='w-8 h-px bg-white/10' />
            <p className='text-xs text-white/35 font-light leading-relaxed max-w-[260px]'>
              {effectiveDescription}
            </p>
            <div className='flex items-center gap-5 pt-2'>
              {SOCIAL_LINKS.map((social) => (
                <a
                  key={social.id}
                  href={social.url}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='text-white/25 hover:text-white/60 transition-colors duration-500'
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
              <h4 className='text-[10px] tracking-[0.32em] uppercase text-white/40 font-normal mb-6'>
                {column.title}
              </h4>
              <ul className='space-y-4'>
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className='text-sm text-white/45 hover:text-white/80 font-light tracking-wide transition-colors duration-500'>
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
      <div className='border-t border-white/[0.06]'>
        <div className='mx-auto max-w-6xl px-6 md:px-12 lg:px-10 py-6 flex flex-col md:flex-row items-center justify-between gap-4'>
          <p className='text-[10px] text-white/20 font-light tracking-[0.08em]'>
            &copy; {new Date().getFullYear()} {effectiveCopyright}
          </p>
          <div className='flex items-center gap-6'>
            <Link
              href='#'
              className='text-[10px] text-white/20 hover:text-white/40 font-light tracking-[0.08em] transition-colors duration-500'>
              Terms
            </Link>
            <Link
              href='#'
              className='text-[10px] text-white/20 hover:text-white/40 font-light tracking-[0.08em] transition-colors duration-500'>
              Privacy
            </Link>
            <Link
              href='#'
              className='text-[10px] text-white/20 hover:text-white/40 font-light tracking-[0.08em] transition-colors duration-500'>
              Cookies
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
