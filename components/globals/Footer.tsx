import { useState, type FC } from "react";
import { Link } from "#root/components/utils/Link";
import { ArrowRight } from "lucide-react";
import { STORE_NAME } from "#root/shared/config/branding";
import { useLayoutSettings } from "#root/frontend/contexts/LayoutSettingsContext";
import type { SocialPlatform } from "#root/shared/types/layout-settings";
import { FooterLogo } from "#root/components/globals/FooterLogo";

// ─── Social Icons ────────────────────────────────────────────────────────────

const FacebookIcon = () => (
  <svg
    xmlns='http://www.w3.org/2000/svg'
    width='20'
    height='20'
    viewBox='0 0 24 24'
    fill='none'
    stroke='currentColor'
    strokeWidth='1.2'
    strokeLinecap='round'
    strokeLinejoin='round'
    aria-labelledby='facebook-title'>
    <title id='facebook-title'>Facebook</title>
    <path d='M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z' />
  </svg>
);

const InstagramIcon = () => (
  <svg
    xmlns='http://www.w3.org/2000/svg'
    width='20'
    height='20'
    viewBox='0 0 24 24'
    fill='none'
    stroke='currentColor'
    strokeWidth='1.2'
    strokeLinecap='round'
    strokeLinejoin='round'
    aria-labelledby='instagram-title'>
    <title id='instagram-title'>Instagram</title>
    <rect x='2' y='2' width='20' height='20' rx='5' ry='5' />
    <path d='M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z' />
    <line x1='17.5' y1='6.5' x2='17.51' y2='6.5' />
  </svg>
);

const TikTokIcon = () => (
  <svg
    xmlns='http://www.w3.org/2000/svg'
    width='20'
    height='20'
    viewBox='0 0 24 24'
    fill='none'
    stroke='currentColor'
    strokeWidth='1.2'
    strokeLinecap='round'
    strokeLinejoin='round'
    aria-labelledby='tiktok-title'>
    <title id='tiktok-title'>TikTok</title>
    <path d='M9 12a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' />
    <path d='M15 8c0 5 4 8 5 8' />
    <path d='M9 16v8' />
    <path d='M15 20V4c0-2 2-3 4-3' />
  </svg>
);

// ─── Social icon map by platform ─────────────────────────────────────────────

const TwitterIcon = () => (
  <svg
    xmlns='http://www.w3.org/2000/svg'
    width='20'
    height='20'
    viewBox='0 0 24 24'
    fill='none'
    stroke='currentColor'
    strokeWidth='1.2'
    strokeLinecap='round'
    strokeLinejoin='round'
    aria-labelledby='twitter-title'>
    <title id='twitter-title'>Twitter</title>
    <path d='M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z' />
  </svg>
);

const YouTubeIcon = () => (
  <svg
    xmlns='http://www.w3.org/2000/svg'
    width='20'
    height='20'
    viewBox='0 0 24 24'
    fill='none'
    stroke='currentColor'
    strokeWidth='1.2'
    strokeLinecap='round'
    strokeLinejoin='round'
    aria-labelledby='youtube-title'>
    <title id='youtube-title'>YouTube</title>
    <path d='M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17' />
    <path d='m10 15 5-3-5-3z' />
  </svg>
);

const PinterestIcon = () => (
  <svg
    xmlns='http://www.w3.org/2000/svg'
    width='20'
    height='20'
    viewBox='0 0 24 24'
    fill='none'
    stroke='currentColor'
    strokeWidth='1.2'
    strokeLinecap='round'
    strokeLinejoin='round'
    aria-labelledby='pinterest-title'>
    <title id='pinterest-title'>Pinterest</title>
    <line x1='12' y1='17' x2='12' y2='22' />
    <path d='M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z' />
  </svg>
);

const LinkedInIcon = () => (
  <svg
    xmlns='http://www.w3.org/2000/svg'
    width='20'
    height='20'
    viewBox='0 0 24 24'
    fill='none'
    stroke='currentColor'
    strokeWidth='1.2'
    strokeLinecap='round'
    strokeLinejoin='round'
    aria-labelledby='linkedin-title'>
    <title id='linkedin-title'>LinkedIn</title>
    <path d='M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z' />
    <rect width='4' height='12' x='2' y='9' />
    <circle cx='4' cy='4' r='2' />
  </svg>
);

const socialIconMap: Record<SocialPlatform, FC> = {
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  tiktok: TikTokIcon,
  twitter: TwitterIcon,
  youtube: YouTubeIcon,
  pinterest: PinterestIcon,
  linkedin: LinkedInIcon,
};

// ─── Default Data ────────────────────────────────────────────────────────────

const defaultSocialLinks = [
  { id: "facebook", name: "Facebook", url: "#", icon: FacebookIcon },
  { id: "instagram", name: "Instagram", url: "#", icon: InstagramIcon },
  { id: "tiktok", name: "TikTok", url: "#", icon: TikTokIcon },
];

const defaultFooterLinks = [
  {
    id: "shop",
    title: "Shop",
    links: [
      { id: "all-products", name: "All Products", url: "/shop" },
      { id: "new-arrivals", name: "New Arrivals", url: "/shop" },
    ],
  },
  {
    id: "help",
    title: "Help",
    links: [
      { id: "contact", name: "Contact Us", url: "#" },
      { id: "faq", name: "FAQ", url: "#faq" },
      { id: "shipping", name: "Shipping & Returns", url: "#" },
      { id: "privacy", name: "Privacy Policy", url: "#" },
    ],
  },
];

// ─── Props ───────────────────────────────────────────────────────────────────

interface FooterProps {
  brandName?: string;
  description?: string;
  socialLinks?: Array<{
    id: string;
    name: string;
    url: string;
    icon: FC;
  }>;
  footerLinks?: Array<{
    id: string;
    title: string;
    links: Array<{ id: string; name: string; url: string }>;
  }>;
  showNewsletter?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const Footer: FC<FooterProps> = ({
  brandName,
  description,
  socialLinks,
  footerLinks,
  showNewsletter,
}) => {
  const layoutSettings = useLayoutSettings();
  const [email, setEmail] = useState("");

  // CMS values take precedence, then props, then defaults
  const effectiveBrandName = brandName ?? STORE_NAME;
  const effectiveDescription = description ?? layoutSettings.footer.description;
  const effectiveShowNewsletter =
    showNewsletter ?? layoutSettings.footer.showNewsletter;
  const effectiveCopyright =
    layoutSettings.footer.copyright || effectiveBrandName;

  // Build social links from CMS if no prop override
  const effectiveSocialLinks =
    socialLinks ??
    layoutSettings.footer.socialLinks.map((sl) => ({
      id: sl.id,
      name: sl.platform.charAt(0).toUpperCase() + sl.platform.slice(1),
      url: sl.url,
      icon: socialIconMap[sl.platform] ?? FacebookIcon,
    }));

  // Build footer link groups from CMS if no prop override
  const effectiveFooterLinks =
    footerLinks ??
    layoutSettings.footer.footerLinkGroups.map((g) => ({
      id: g.id,
      title: g.title,
      links: g.links.map((l) => ({ id: l.id, name: l.label, url: l.url })),
    }));

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    alert(`Thank you for subscribing with ${email}!`);
    setEmail("");
  };

  return (
    <footer className='bg-[#0F100E] text-[#A19887] selection:bg-[#8F7666]/20'>
      {/* ── Newsletter block — full-width, centered, editorial ── */}
      {effectiveShowNewsletter && (
        <div data-footer-newsletter className='border-b border-[#1E1B17]'>
          <div className='container mx-auto px-6 md:px-12 lg:px-20 py-20 md:py-24'>
            <div className='max-w-xl mx-auto text-center space-y-8'>
              {/* Decorative micro-line */}
              <div className='w-8 h-px bg-[#8F7666]/40 mx-auto' />

              <h3 className='text-[#DDD8C2] text-[11px] md:text-[12px] font-light tracking-[0.28em] uppercase leading-none'>
                Stay in the loop
              </h3>
              <p className='text-[12px] md:text-[13px] text-[#6B5F52] font-light leading-[1.8] tracking-[0.02em] max-w-sm mx-auto'>
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
                  className='flex-1 bg-transparent border-0 border-b border-[#2F261B] px-0 pb-3 pt-1 text-[14px] md:text-[15px] text-[#DDD8C2] placeholder:text-[#3A3028] font-light tracking-[0.03em] focus:outline-none focus:border-[#8F7666] transition-colors duration-700'
                />
                <button
                  type='submit'
                  className='pb-3 text-[#4A3F35] hover:text-[#A19887] transition-colors duration-700'
                  aria-label='Subscribe'>
                  <ArrowRight className='w-[18px] h-[18px]' strokeWidth={1.2} />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── Main footer grid ── */}
      <div className='container mx-auto px-6 md:px-12 lg:px-20 py-16 md:py-20'>
        <div className='grid grid-cols-1 md:grid-cols-12 gap-14 md:gap-8 lg:gap-12'>
          {/* Brand column — dominant */}
          <div className='md:col-span-5 lg:col-span-5 space-y-7'>
            <FooterLogo textClassName='inline-block text-[26px] md:text-[28px] font-extralight tracking-[0.18em] text-[#DDD8C2] uppercase hover:opacity-70 transition-opacity duration-700' />

            {/* Subtle brand accent line */}
            <div className='w-10 h-px bg-[#2F261B]' />

            <p className='text-[12px] md:text-[13px] text-[#6B5F52] font-light leading-[1.9] tracking-[0.01em] max-w-[280px]'>
              {effectiveDescription}
            </p>

            {/* Social icons — larger, more spaced, opacity hover */}
            <div className='flex items-center gap-7 pt-3'>
              {effectiveSocialLinks.map((social) => (
                <a
                  key={social.id}
                  href={social.url}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='text-[#4A3F35] opacity-60 hover:opacity-100 transition-opacity duration-700'
                  aria-label={`Visit our ${social.name} page`}>
                  <social.icon />
                </a>
              ))}
            </div>
          </div>

          {/* Spacer */}
          <div className='hidden lg:block lg:col-span-1' />

          {/* Nav columns */}
          {effectiveFooterLinks.map((column) => (
            <div key={column.id} className='md:col-span-3 lg:col-span-2'>
              <h4 className='text-[9px] md:text-[10px] uppercase tracking-[0.22em] text-[#8F7666] font-normal mb-7 md:mb-8'>
                {column.title}
              </h4>
              <ul className='space-y-5'>
                {column.links.map((link) => (
                  <li key={link.id}>
                    <Link
                      href={link.url}
                      className='text-[12px] md:text-[13px] text-[#5A5048] hover:text-[#DDD8C2] font-light tracking-[0.03em] transition-colors duration-700'>
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom legal strip ── */}
      <div className='border-t border-[#1E1B17]'>
        <div className='container mx-auto px-6 md:px-12 lg:px-20 py-7 flex flex-col md:flex-row items-center justify-between gap-4'>
          <p className='text-[10px] text-[#3A3028] font-light tracking-[0.08em]'>
            &copy; {new Date().getFullYear()} {effectiveCopyright}
          </p>
          <div className='flex items-center gap-8'>
            <Link
              href='#'
              className='text-[10px] text-[#3A3028] hover:text-[#6B5F52] font-light tracking-[0.08em] transition-colors duration-700'>
              Terms
            </Link>
            <Link
              href='#'
              className='text-[10px] text-[#3A3028] hover:text-[#6B5F52] font-light tracking-[0.08em] transition-colors duration-700'>
              Privacy
            </Link>
            <Link
              href='#'
              className='text-[10px] text-[#3A3028] hover:text-[#6B5F52] font-light tracking-[0.08em] transition-colors duration-700'>
              Cookies
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
