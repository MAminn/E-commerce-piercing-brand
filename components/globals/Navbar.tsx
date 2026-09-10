import type React from "react";
import { useContext, useEffect, useState, useRef } from "react";
import { Button } from "#root/components/ui/button";
import {
  Menu,
  ShoppingCart,
  Globe,
  User,
  Search,
  X,
  Package,
  Heart,
  Settings,
  LogOut,
  LayoutDashboard,
} from "lucide-react";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SheetFooter,
} from "#root/components/ui/sheet";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuTrigger,
  NavigationMenuContent,
} from "#root/components/ui/navigation-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#root/components/ui/dropdown-menu";
import { Link } from "#root/components/utils/Link";
import { AuthContext } from "#root/context/AuthContext.js";
import { useCart } from "#root/lib/context/CartContext";
import { trpc } from "#root/shared/trpc/client";
import { toast } from "sonner";
import { isSingleShopMode } from "#root/shared/config/app";
import { STORE_NAME } from "#root/shared/config/branding";
import { useNavbarMode } from "./NavbarContext";
import { useLayoutSettings } from "#root/frontend/contexts/LayoutSettingsContext";
import { navigate } from "vike/client/router";
import { HeaderLogo } from "#root/components/globals/HeaderLogo";

interface NavbarProps {
  lang: string;
  sheetDescription?: string;
}

const Navbar: React.FC<NavbarProps> = ({
  lang = "en",
  sheetDescription = "Navigation menu",
}: NavbarProps) => {
  const mode = useNavbarMode();
  const isSolid = mode === "solid";
  const layoutSettings = useLayoutSettings();

  const [isSheetOpen, setIsSheetOpen] = useState<boolean>(false);
  const [isScrolled, setIsScrolled] = useState<boolean>(isSolid);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [subcategories, setSubcategories] = useState<
    {
      id: string;
      name: string;
      slug: string;
      filename: string | null;
      type: string;
    }[]
  >([]);

  useEffect(() => {
    trpc.category.view.query().then((res) => {
      if (!res.success) {
        toast.error(res.error);
        return;
      }

      setSubcategories(res.result as any);
    });
  }, []);

  // Scroll detection hook (only matters in overlay mode).
  // We stay transparent while the hero is in view and only flip to solid
  // once ~80% of the viewport (≈ hero height) has been scrolled past.
  useEffect(() => {
    if (isSolid) {
      setIsScrolled(true);
      return;
    }

    const computeThreshold = () =>
      typeof window !== "undefined" ? window.innerHeight * 0.8 : 0;
    let threshold = computeThreshold();

    const update = () => {
      if (typeof window === "undefined") return;
      setIsScrolled(window.scrollY > threshold);
    };

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

  const { totalItems } = useCart();

  const handleCloseSheet = () => setIsSheetOpen(false);

  const handleSearchSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setIsSearchOpen(false);
      setSearchQuery("");
      handleCloseSheet();
    }
  };

  const { session, logout } = useContext(AuthContext);

  // Unified pill-style nav item classes
  const getNavItemClasses = (isScrolled: boolean) => {
    const baseClasses =
      "px-4 py-2 rounded-full text-xs font-light uppercase tracking-wider transition-all duration-[240ms] ease-in-out";
    const scrolledClasses =
      "!text-black hover:!text-stone-700 hover:bg-stone-100";
    const transparentClasses =
      "!text-white hover:!text-white/80 hover:bg-white/10";

    return `${baseClasses} ${isScrolled ? scrolledClasses : transparentClasses}`;
  };

  const logLinks = [
    { label: "Login", to: "/login" },
    { label: "Register", to: "/register" },
  ];

  // Build navigation links from CMS settings, with static fallback
  const cmsNavLinks = layoutSettings.header.navigationLinks;
  const baseNavLinks =
    cmsNavLinks.length > 0
      ? cmsNavLinks.map((l) => ({ label: l.label, to: l.url }))
      : [{ label: "Collection", to: "/shop" }];

  // Single-shop template: No vendor registration
  const enNavLinks = baseNavLinks;

  const links = enNavLinks;

  const announcementEnabled = layoutSettings.header.announcementBarEnabled;
  const announcementText = layoutSettings.header.announcementBarText;

  return (
    // Banner + nav are flow siblings. Positioning (fixed top-0) is owned by
    // the parent GlobalNavbarChrome wrapper so the navbar can never overlap
    // the banner — no matter how many lines the banner text wraps to.
    <>
      {/* Announcement bar */}
      {announcementEnabled && announcementText && (
        <div className='w-full bg-black text-white text-xs sm:text-sm'>
          <div className='max-w-7xl mx-auto px-4 py-2 sm:py-2.5 flex items-center justify-center gap-2 text-center leading-tight tracking-wider'>
            {announcementText}
          </div>
        </div>
      )}
      <nav
        className={`w-full py-4 lg:py-6 transition-all duration-[240ms] ease-in-out ${
          isSolid || isScrolled
            ? "bg-white/95 backdrop-blur-sm border-b border-black/[0.08]"
            : "bg-transparent border-b border-transparent"
        }`}>
        <div className='px-6 lg:px-8 grid grid-cols-3 items-center min-h-16 max-w-7xl mx-auto'>
          {/* Left: Primary Navigation */}
          <div className='flex items-center gap-6 justify-start'>
            {/* Mobile menu */}
            <div className='lg:hidden'>
              <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant='ghost'
                    size='icon'
                    className={`transition-colors duration-[240ms] ease-in-out ${
                      isScrolled
                        ? "!text-black hover:bg-stone-100"
                        : "!text-white hover:bg-white/10"
                    }`}>
                    <Menu size={22} />
                  </Button>
                </SheetTrigger>
                <SheetContent side='left' className='w-64 bg-stone-50 p-0'>
                  <div className='flex flex-col h-full'>
                    {/* Logo at the top */}
                    <div className='p-6 border-b border-stone-200 w-full flex justify-center'>
                      <HeaderLogo
                        variant='mobile'
                        onClick={handleCloseSheet}
                        textClassName='text-2xl font-light tracking-wide text-stone-900'
                      />
                    </div>

                    {/* Main navigation links */}
                    <div className='p-6 flex-1'>
                      {/* Mobile search */}
                      <form onSubmit={handleSearchSubmit} className='mb-6'>
                        <div className='relative'>
                          <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400' />
                          <input
                            type='text'
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder='Search products...'
                            className='w-full pl-9 pr-4 py-2.5 text-sm rounded-lg border border-stone-200 bg-white text-stone-900 placeholder-stone-400 outline-none focus:border-stone-400'
                          />
                        </div>
                      </form>

                      <div className='flex flex-col gap-5 mb-8'>
                        {links.map((link) => (
                          <Link
                            key={link.to}
                            href={link.to}
                            className='text-base font-light text-stone-800 hover:text-stone-600 transition-colors'
                            onClick={handleCloseSheet}>
                            {link.label}
                          </Link>
                        ))}
                      </div>

                      {/* Auth links if logged in */}
                      {session && (
                        <div className='border-t border-stone-200 pt-5 mb-6 space-y-4'>
                          <Link
                            href='/account'
                            className='flex items-center gap-2.5 text-sm text-stone-700 hover:text-stone-900'
                            onClick={handleCloseSheet}>
                            <User className='w-4 h-4' /> My Account
                          </Link>
                          <Link
                            href='/account?tab=orders'
                            className='flex items-center gap-2.5 text-sm text-stone-700 hover:text-stone-900'
                            onClick={handleCloseSheet}>
                            <Package className='w-4 h-4' /> Orders
                          </Link>
                          <Link
                            href='/account?tab=wishlist'
                            className='flex items-center gap-2.5 text-sm text-stone-700 hover:text-stone-900'
                            onClick={handleCloseSheet}>
                            <Heart className='w-4 h-4' /> Wishlist
                          </Link>
                          {(session.role === "admin" || session.role === "superadmin") && (
                            <Link
                              href='/dashboard'
                              className='flex items-center gap-2.5 text-sm text-stone-700 hover:text-stone-900'
                              onClick={handleCloseSheet}>
                              <LayoutDashboard className='w-4 h-4' /> Dashboard
                            </Link>
                          )}
                          <button
                            onClick={() => {
                              logout();
                              handleCloseSheet();
                            }}
                            className='flex items-center gap-2.5 text-sm text-red-600 hover:text-red-700'
                            type='button'>
                            <LogOut className='w-4 h-4' /> Logout
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Footer section with company name */}
                    <div className='mt-auto border-t border-stone-200 p-6'>
                      <p className='text-xs text-stone-400 tracking-wide'>
                        {STORE_NAME}
                      </p>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            {/* Desktop navigation */}
            <div className='hidden lg:flex gap-2'>
              <NavigationMenu>
                <NavigationMenuList>
                  {links.map((link) => (
                    <NavigationMenuItem key={link.to}>
                      <NavigationMenuLink asChild>
                        <Link
                          href={link.to}
                          className={getNavItemClasses(isScrolled)}>
                          {link.label}
                        </Link>
                      </NavigationMenuLink>
                    </NavigationMenuItem>
                  ))}
                </NavigationMenuList>
              </NavigationMenu>
            </div>
          </div>

          {/* Center: Logo */}
          <div className='flex justify-center'>
            <HeaderLogo
              variant='desktop'
              textClassName={`text-2xl lg:text-3xl font-light tracking-[0.08em] transition-colors duration-[240ms] ease-in-out ${
                isScrolled
                  ? "!text-black hover:!text-stone-700"
                  : "!text-white hover:!text-white/80"
              }`}
            />
          </div>

          {/* Right: User Actions */}
          <div className='flex items-center gap-3 justify-end'>
            {/* Desktop: Auth Links or Profile Dropdown */}
            <div className='hidden lg:flex items-center gap-2'>
              {!session ? (
                logLinks.map((link) => (
                  <Link
                    key={link.to}
                    href={link.to}
                    className={getNavItemClasses(isScrolled)}>
                    {link.label}
                  </Link>
                ))
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type='button'
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-medium text-sm transition-all duration-[240ms] ${isScrolled ? "bg-stone-900 text-white hover:bg-stone-700" : "bg-white text-black hover:bg-white/90"}`}
                      aria-label='Account menu'>
                      {session.name ? (
                        session.name.charAt(0).toUpperCase()
                      ) : (
                        <User size={16} />
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
                        <User className='w-4 h-4 text-stone-500' />
                        My Account
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link
                        href='/account?tab=orders'
                        className='flex items-center gap-2.5 cursor-pointer'>
                        <Package className='w-4 h-4 text-stone-500' />
                        Orders
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link
                        href='/account?tab=wishlist'
                        className='flex items-center gap-2.5 cursor-pointer'>
                        <Heart className='w-4 h-4 text-stone-500' />
                        Wishlist
                      </Link>
                    </DropdownMenuItem>
                    {(session.role === "admin" || session.role === "superadmin") && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                          <Link
                            href='/dashboard'
                            className='flex items-center gap-2.5 cursor-pointer'>
                            <LayoutDashboard className='w-4 h-4 text-stone-500' />
                            Dashboard
                          </Link>
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={logout}
                      className='flex items-center gap-2.5 cursor-pointer text-red-600 focus:text-red-600'>
                      <LogOut className='w-4 h-4' />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {/* Cart button */}
            <Button
              variant='ghost'
              size='icon'
              className={`transition-all duration-[240ms] ease-in-out ${
                isScrolled
                  ? "!text-black hover:!text-stone-700 hover:bg-stone-100"
                  : "!text-white hover:!text-white/80 hover:bg-white/10"
              }`}
              asChild>
              <Link href='/cart' className='relative'>
                <ShoppingCart size={20} />
                {totalItems > 0 && (
                  <span
                    className={`absolute top-0 right-0 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-medium leading-none transform translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-[240ms] ease-in-out ${
                      isScrolled
                        ? "!bg-black !text-white"
                        : "!bg-white !text-black"
                    }`}>
                    {totalItems}
                  </span>
                )}
              </Link>
            </Button>

            {/* Mobile: User icon */}
            {!session ? (
              <Button
                variant='ghost'
                size='icon'
                className={`lg:hidden transition-all duration-[240ms] ease-in-out ${
                  isScrolled
                    ? "!text-black hover:!text-stone-700 hover:bg-stone-100"
                    : "!text-white hover:!text-white/80 hover:bg-white/10"
                }`}
                asChild>
                <Link href='/login'>
                  <User size={20} />
                </Link>
              </Button>
            ) : (
              <Link
                href='/account'
                className={`lg:hidden w-8 h-8 rounded-full flex items-center justify-center font-medium text-sm transition-all ${isScrolled ? "bg-stone-900 text-white" : "bg-white text-black"}`}>
                {session.name ? (
                  session.name.charAt(0).toUpperCase()
                ) : (
                  <User size={14} />
                )}
              </Link>
            )}
          </div>
        </div>
      </nav>
    </>
  );
};

export default Navbar;
