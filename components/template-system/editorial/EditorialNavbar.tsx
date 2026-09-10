import { useContext, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Menu,
  ShoppingBag,
  User,
  Package,
  Heart,
  LogOut,
  LayoutDashboard,
  ChevronDown,
  Tag,
  Sparkles,
} from "lucide-react";
import { Link } from "#root/components/utils/Link";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
} from "#root/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#root/components/ui/dropdown-menu";
import { Button } from "#root/components/ui/button";
import { AuthContext } from "#root/context/AuthContext.js";
import { useCart } from "#root/lib/context/CartContext";
import { STORE_NAME } from "#root/shared/config/branding";
import { trpc } from "#root/shared/trpc/client";
import { EASE_OUT } from "../motion/motionPresets";
import { useLayoutSettings } from "#root/frontend/contexts/LayoutSettingsContext";
import { useNavbarMode } from "#root/components/globals/NavbarContext";
import { HeaderLogo } from "#root/components/globals/HeaderLogo";

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const DEFAULT_NAV_LINKS = [
  { label: "Shop", href: "/shop" },
  { label: "New Arrivals", href: "/shop" },
  { label: "About", href: "#" },
] as const;

const SCROLL_THRESHOLD = 16;

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

/**
 * Editorial Navbar — transparent at top, solid on scroll.
 *
 * Premium fashion-editorial header:
 * - Desktop: left nav links · center logo · right icons
 * - Mobile: hamburger → Sheet drawer with editorial links
 * - Quiet-luxury typography: 11px tracking-[0.2em] uppercase
 * - Smooth bg/text transitions via Framer Motion
 * - Clean icon-only right side (Search · Account · Bag)
 */
export function EditorialNavbar() {
  const prefersReduced = useReducedMotion() ?? false;
  const mode = useNavbarMode();
  const isSolid = mode === "solid";
  const [isScrolled, setIsScrolled] = useState(isSolid);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);
  const [categories, setCategories] = useState<
    { id: string; name: string; slug: string }[]
  >([]);

  const { session, logout } = useContext(AuthContext);
  const { totalItems } = useCart();
  const layoutSettings = useLayoutSettings();

  // Fetch categories for the mobile sheet drop-down
  useEffect(() => {
    trpc.category.view
      .query()
      .then((res) => {
        if (res.success && Array.isArray(res.result)) {
          setCategories(
            (res.result as { id: string; name: string; slug: string }[]).map(
              (c) => ({ id: c.id, name: c.name, slug: c.slug }),
            ),
          );
        }
      })
      .catch(() => {
        /* silent — sheet falls back to just Offers / New Arrivals */
      });
  }, []);

  // Build navigation links from CMS settings, with static fallback
  const cmsNavLinks = layoutSettings.header.navigationLinks;
  const NAV_LINKS =
    cmsNavLinks.length > 0
      ? cmsNavLinks.map((l) => ({ label: l.label, href: l.url }))
      : DEFAULT_NAV_LINKS;

  const announcementEnabled = layoutSettings.header.announcementBarEnabled;
  const announcementText = layoutSettings.header.announcementBarText;

  /* ---- Scroll detection ----
   * Stay transparent over the hero; only flip to solid once ~80% of the
   * viewport (≈ hero height) has been scrolled past.
   */
  useEffect(() => {
    if (isSolid) {
      setIsScrolled(true);
      return;
    }

    if (typeof window === "undefined") return;

    const computeThreshold = () => window.innerHeight * 0.8;
    let threshold = computeThreshold();

    const update = () => setIsScrolled(window.scrollY > threshold);
    update();

    const handleScroll = () => update();
    const handleResize = () => {
      threshold = computeThreshold();
      update();
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, [isSolid]);

  /* ---- Sheet ---- */
  const handleCloseSheet = () => setIsSheetOpen(false);

  /* ---- Link styles ---- */
  const linkCls = isScrolled
    ? "!text-stone-700 hover:!text-stone-950"
    : "!text-white/85 hover:!text-white";

  const iconCls = isScrolled
    ? "!text-stone-700 hover:!text-stone-950 hover:bg-transparent"
    : "!text-white/85 hover:!text-white hover:bg-transparent";

  return (
    <>
      {/* Announcement bar — refined, restrained */}
      {announcementEnabled && announcementText && (
        <div className='w-full bg-stone-900 text-white/70 text-center py-2 px-6 text-[10px] tracking-[0.28em] uppercase font-light select-none'>
          {announcementText}
        </div>
      )}
      <motion.nav
        aria-label='Editorial navigation'
        className={`w-full py-5 lg:py-7 transition-[backdrop-filter] duration-500 ${isScrolled ? "backdrop-blur-2xl" : "backdrop-blur-0"}`}
        animate={{
          backgroundColor: isScrolled
            ? "rgba(255,255,255,0.96)"
            : "rgba(255,255,255,0)",
          borderBottomColor: isScrolled ? "rgba(0,0,0,0.05)" : "rgba(0,0,0,0)",
        }}
        transition={
          prefersReduced ? { duration: 0 } : { duration: 0.5, ease: EASE_OUT }
        }
        style={{ borderBottomWidth: 1, borderBottomStyle: "solid" }}>
        <div className='px-6 lg:px-12 xl:px-16 grid grid-cols-3 items-center min-h-14 max-w-480 mx-auto'>
          {/* ─── Left: Navigation ─── */}
          <div className='flex items-center gap-10 justify-start'>
            {/* Mobile hamburger */}
            <div className='lg:hidden'>
              <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                <SheetTrigger asChild>
                  <button
                    type='button'
                    className={`p-1 transition-colors duration-300 ${iconCls}`}
                    aria-label='Open menu'>
                    <Menu size={20} strokeWidth={1.3} />
                  </button>
                </SheetTrigger>
                <SheetContent side='left' className='w-75 bg-stone-50 p-0'>
                  <div className='flex flex-col h-full'>
                    <div className='px-8 py-8 border-b border-stone-200/60 w-full flex justify-center'>
                      <HeaderLogo
                        variant='mobile'
                        onClick={handleCloseSheet}
                        textClassName='text-lg font-light tracking-[0.18em] text-stone-900 uppercase'
                      />
                    </div>

                    <div className='px-8 py-10 flex-1 overflow-y-auto'>
                      {/* Categories — collapsible drop-down */}
                      <div className='mb-2'>
                        <button
                          type='button'
                          onClick={() => setIsCategoriesOpen((prev) => !prev)}
                          aria-expanded={isCategoriesOpen}
                          className='w-full flex items-center justify-between py-3 text-[11px] tracking-[0.22em] uppercase text-stone-700 hover:text-stone-950 transition-colors font-normal'>
                          <span className='flex items-center gap-2.5'>
                            <Tag className='w-3.5 h-3.5' /> Categories
                          </span>
                          <ChevronDown
                            className={`w-3.5 h-3.5 transition-transform duration-300 ${isCategoriesOpen ? "rotate-180" : ""}`}
                          />
                        </button>
                        {isCategoriesOpen && (
                          <div className='mt-1 mb-3 pl-6 flex flex-col gap-3 border-l border-stone-200/70'>
                            {categories.length === 0 ? (
                              <span className='text-[11px] text-stone-400 tracking-wide'>
                                No categories
                              </span>
                            ) : (
                              categories.map((c) => (
                                <Link
                                  key={c.id}
                                  href={`/categories/${c.slug}`}
                                  onClick={handleCloseSheet}
                                  className='text-[11px] tracking-[0.18em] uppercase text-stone-500 hover:text-stone-900 transition-colors'>
                                  {c.name}
                                </Link>
                              ))
                            )}
                          </div>
                        )}
                      </div>

                      {/* Offers */}
                      <Link
                        href='/shop?section=offers'
                        onClick={handleCloseSheet}
                        className='flex items-center gap-2.5 py-3 text-[11px] tracking-[0.22em] uppercase text-stone-700 hover:text-stone-950 transition-colors font-normal'>
                        <Tag className='w-3.5 h-3.5' /> Offers
                      </Link>

                      {/* New Arrivals */}
                      <Link
                        href='/shop?section=newarrivals'
                        onClick={handleCloseSheet}
                        className='flex items-center gap-2.5 py-3 text-[11px] tracking-[0.22em] uppercase text-stone-700 hover:text-stone-950 transition-colors font-normal mb-6'>
                        <Sparkles className='w-3.5 h-3.5' /> New Arrivals
                      </Link>

                      {session && (
                        <div className='border-t border-stone-200/60 pt-7 mb-6 space-y-5'>
                          <Link
                            href='/account'
                            className='flex items-center gap-2.5 text-[11px] tracking-[0.2em] uppercase text-stone-500 hover:text-stone-800 transition-colors'
                            onClick={handleCloseSheet}>
                            <User className='w-3.5 h-3.5' /> My Account
                          </Link>
                          <Link
                            href='/account?tab=orders'
                            className='flex items-center gap-2.5 text-[11px] tracking-[0.2em] uppercase text-stone-500 hover:text-stone-800 transition-colors'
                            onClick={handleCloseSheet}>
                            <Package className='w-3.5 h-3.5' /> Orders
                          </Link>
                          <Link
                            href='/account?tab=wishlist'
                            className='flex items-center gap-2.5 text-[11px] tracking-[0.2em] uppercase text-stone-500 hover:text-stone-800 transition-colors'
                            onClick={handleCloseSheet}>
                            <Heart className='w-3.5 h-3.5' /> Wishlist
                          </Link>
                          {(session.role === "admin" || session.role === "superadmin") && (
                            <Link
                              href='/dashboard'
                              className='flex items-center gap-2.5 text-[11px] tracking-[0.2em] uppercase text-stone-500 hover:text-stone-800 transition-colors'
                              onClick={handleCloseSheet}>
                              <LayoutDashboard className='w-3.5 h-3.5' />{" "}
                              Dashboard
                            </Link>
                          )}
                          <button
                            onClick={() => {
                              logout();
                              handleCloseSheet();
                            }}
                            className='flex items-center gap-2.5 text-[11px] tracking-[0.2em] uppercase text-red-500 hover:text-red-700 transition-colors'
                            type='button'>
                            <LogOut className='w-3.5 h-3.5' /> Sign Out
                          </button>
                        </div>
                      )}
                    </div>

                    <SheetTitle className='sr-only'>Navigation menu</SheetTitle>
                    <div className='mt-auto border-t border-stone-200/40 px-8 py-6'>
                      <p className='text-[9px] text-stone-400 tracking-[0.22em] uppercase font-light'>
                        {STORE_NAME}
                      </p>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            {/* Desktop nav links */}
            <nav className='hidden lg:flex gap-10'>
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-[11px] tracking-[0.2em] uppercase font-normal transition-colors duration-300 ${linkCls} focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-stone-900/20 focus-visible:ring-offset-4 rounded-sm`}>
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* ─── Center: Logo ─── */}
          <div className='flex justify-center'>
            <HeaderLogo
              variant='desktop'
              textClassName={`text-[22px] lg:text-[26px] font-extralight tracking-[0.22em] uppercase transition-colors duration-400 ${isScrolled ? "!text-stone-900" : "!text-white"}`}
            />
          </div>

          {/* ─── Right: Icons (Account · Bag) ─── */}
          <div className='flex items-center gap-4 justify-end'>
            {/* Account icon — dropdown for logged-in users */}
            {session ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type='button'
                    className={`p-1 transition-colors duration-300 hidden lg:flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-medium ${isScrolled ? "bg-stone-900 text-white" : "bg-white text-stone-900"}`}
                    aria-label='Account menu'>
                    {session.name ? (
                      session.name.charAt(0).toUpperCase()
                    ) : (
                      <User size={14} />
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end' className='w-52 z-[10001]'>
                  <div className='px-3 py-2 border-b border-stone-100'>
                    <p className='text-sm font-medium text-stone-900 truncate'>
                      {session.name || "Account"}
                    </p>
                    <p className='text-xs text-stone-400 truncate'>
                      {session.email}
                    </p>
                  </div>
                  <DropdownMenuItem asChild>
                    <Link
                      href='/account'
                      className='flex items-center gap-2.5 cursor-pointer'>
                      <User className='w-4 h-4 text-stone-500' /> My Account
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link
                      href='/account?tab=orders'
                      className='flex items-center gap-2.5 cursor-pointer'>
                      <Package className='w-4 h-4 text-stone-500' /> Orders
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link
                      href='/account?tab=wishlist'
                      className='flex items-center gap-2.5 cursor-pointer'>
                      <Heart className='w-4 h-4 text-stone-500' /> Wishlist
                    </Link>
                  </DropdownMenuItem>
                  {(session.role === "admin" || session.role === "superadmin") && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link
                          href='/dashboard'
                          className='flex items-center gap-2.5 cursor-pointer'>
                          <LayoutDashboard className='w-4 h-4 text-stone-500' />{" "}
                          Dashboard
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={logout}
                    className='flex items-center gap-2.5 cursor-pointer text-red-600 focus:text-red-600'>
                    <LogOut className='w-4 h-4' /> Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link
                href='/login'
                className={`p-1 transition-colors duration-300 hidden lg:block ${iconCls}`}
                aria-label='Sign in'>
                <User size={18} strokeWidth={1.3} />
              </Link>
            )}

            {/* Cart */}
            <Link
              href='/cart'
              className={`p-1 relative transition-colors duration-300 ${iconCls}`}
              aria-label='Shopping bag'>
              <ShoppingBag size={18} strokeWidth={1.3} />
              {totalItems > 0 && (
                <span
                  className={`absolute -top-0.5 -right-1 inline-flex items-center justify-center w-4 h-4 text-[8px] font-medium leading-none rounded-full transition-colors duration-300 ${
                    isScrolled
                      ? "bg-stone-900 text-white"
                      : "bg-white text-stone-900"
                  }`}>
                  {totalItems}
                </span>
              )}
            </Link>

            {/* Mobile user icon */}
            {session ? (
              <Link
                href='/account'
                className={`p-0.5 lg:hidden flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-medium transition-colors duration-300 ${isScrolled ? "bg-stone-900 text-white" : "bg-white text-stone-900"}`}
                aria-label='Account'>
                {session.name ? (
                  session.name.charAt(0).toUpperCase()
                ) : (
                  <User size={14} />
                )}
              </Link>
            ) : (
              <Link
                href='/login'
                className={`p-1 lg:hidden transition-colors duration-300 ${iconCls}`}
                aria-label='Sign in'>
                <User size={18} strokeWidth={1.3} />
              </Link>
            )}
          </div>
        </div>
      </motion.nav>
    </>
  );
}
