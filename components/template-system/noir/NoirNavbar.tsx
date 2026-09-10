import { useContext, useState } from "react";
import { Menu, Search, ShoppingBag, User, X } from "lucide-react";
import { Link } from "#root/components/utils/Link";
import { AuthContext } from "#root/context/AuthContext.js";
import { useCart } from "#root/lib/context/CartContext";
import { useLayoutSettings } from "#root/frontend/contexts/LayoutSettingsContext";
import { HeaderLogo } from "#root/components/globals/HeaderLogo";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { cn } from "#root/lib/utils";
import { NOIR_DISPLAY_FONT_CLASSES } from "./noir-tokens";

/**
 * NoirNavbar — Noir (Demo 5) navigation.
 *
 * Black bg, hairline white/10 bottom border, uppercase tracked links
 * (tracking gated for Arabic), red hovers, sticky top. Logo resolves
 * from the same CMS layout-settings source the global navbar uses
 * (HeaderLogo). Nav links come from layoutSettings.header.navigationLinks
 * with a Home + Shop fallback. Cart count reuses useCart().totalItems
 * (same source as the existing navbars) rendered in accent red.
 *
 * Sits BELOW the NoirAnnouncementBar inside NoirChrome.
 */
export function NoirNavbar() {
  const { session } = useContext(AuthContext);
  const { totalItems } = useCart();
  const layoutSettings = useLayoutSettings();
  const { locale } = useMinimalI18n();
  const isAr = locale === "ar";
  const track = isAr ? "" : "tracking-[0.2em]";
  const [mobileOpen, setMobileOpen] = useState(false);

  // CMS nav links with Home + Shop fallback
  const cmsLinks = layoutSettings.header.navigationLinks;
  const navLinks =
    cmsLinks && cmsLinks.length > 0
      ? cmsLinks.map((l) => ({
          href: l.url,
          label: isAr && l.labelAr ? l.labelAr : l.label,
        }))
      : [
          { href: "/", label: isAr ? "الرئيسية" : "Home" },
          { href: "/shop", label: isAr ? "تسوق" : "Shop" },
        ];

  const linkClasses = cn(
    "text-[11px] uppercase text-white/80 hover:text-[#E8112D] transition-colors duration-300",
    track,
    NOIR_DISPLAY_FONT_CLASSES,
  );

  return (
    <header className='sticky top-0 z-40 bg-black border-b border-white/10'>
      <div className='mx-auto max-w-7xl px-4 md:px-8'>
        <div className='grid grid-cols-[auto_1fr_auto] md:grid-cols-3 items-center h-16 gap-4'>
          {/* ─── Start: mobile menu toggle + logo ─── */}
          <div className='flex items-center gap-3'>
            <button
              type='button'
              className='md:hidden p-1 text-white/80 hover:text-[#E8112D] transition-colors duration-300'
              aria-label={isAr ? "القائمة" : "Menu"}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((v) => !v)}>
              {mobileOpen ? (
                <X size={20} strokeWidth={1.5} />
              ) : (
                <Menu size={20} strokeWidth={1.5} />
              )}
            </button>
            <HeaderLogo
              variant='desktop'
              textClassName={cn(
                "inline-block text-xl md:text-2xl font-semibold uppercase !text-white hover:!text-[#E8112D] transition-colors duration-300",
                isAr ? "" : "tracking-[0.3em]",
                NOIR_DISPLAY_FONT_CLASSES,
              )}
            />
          </div>

          {/* ─── Center: nav links (desktop) ─── */}
          <nav className='hidden md:flex items-center justify-center gap-10'>
            {navLinks.map((link) => (
              <Link
                key={link.href + link.label}
                href={link.href}
                className={linkClasses}>
                {link.label}
              </Link>
            ))}
          </nav>

          {/* ─── End: search / account / cart ─── */}
          <div className='flex items-center justify-end gap-4'>
            <Link
              href='/search'
              className='p-1 text-white/80 hover:text-[#E8112D] transition-colors duration-300'
              aria-label={isAr ? "بحث" : "Search"}>
              <Search size={18} strokeWidth={1.5} />
            </Link>
            <Link
              href={session ? "/account" : "/login"}
              className='p-1 text-white/80 hover:text-[#E8112D] transition-colors duration-300'
              aria-label={
                session
                  ? isAr
                    ? "حسابي"
                    : "Account"
                  : isAr
                    ? "تسجيل الدخول"
                    : "Sign in"
              }>
              <User size={18} strokeWidth={1.5} />
            </Link>
            <Link
              href='/cart'
              className='relative p-1 text-white/80 hover:text-[#E8112D] transition-colors duration-300'
              aria-label={isAr ? "عربة التسوق" : "Shopping bag"}>
              <ShoppingBag size={18} strokeWidth={1.5} />
              {totalItems > 0 && (
                <span className='absolute -top-1 -end-1.5 inline-flex items-center justify-center min-w-4 h-4 px-0.5 text-[9px] font-semibold leading-none rounded-full bg-[#E8112D] text-white'>
                  {totalItems}
                </span>
              )}
            </Link>
          </div>
        </div>
      </div>

      {/* ─── Mobile menu panel ─── */}
      {mobileOpen && (
        <nav className='md:hidden border-t border-white/10 bg-black px-4 py-4 flex flex-col gap-4'>
          {navLinks.map((link) => (
            <Link
              key={link.href + link.label}
              href={link.href}
              className={linkClasses}
              onClick={() => setMobileOpen(false)}>
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
