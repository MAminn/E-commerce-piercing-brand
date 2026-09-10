import { useContext, useState, useRef, useEffect, useCallback } from "react";
import { Search, ShoppingCart, User, X, Menu, Globe, LogOut, Loader2, Package, Heart, LayoutDashboard, ChevronDown } from "lucide-react";
import { Link } from "#root/components/utils/Link";
import { AuthContext } from "#root/context/AuthContext";
import { useCart } from "#root/lib/context/CartContext";
import { useLayoutSettings } from "#root/frontend/contexts/LayoutSettingsContext";
import { useNavbarMode } from "#root/components/globals/NavbarContext";
import { HeaderLogo } from "#root/components/globals/HeaderLogo";
import { Marquee } from "#root/components/ui/marquee";
import { navigate } from "vike/client/router";
import { trpc } from "#root/shared/trpc/client";
import { toast } from "sonner";
import { getProductUrl } from "#root/lib/utils/route-helpers";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { STORE_CURRENCY } from "#root/shared/config/branding";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
} from "#root/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#root/components/ui/dropdown-menu";

/**
 * Minimal Navbar — clean design inspired by matchperfumes.com.
 * Layout: [icons (left)]  ·  [nav links (centre-right)]  ·  [LOGO (far right)]
 * Flips naturally with RTL via the i18n dir attribute.
 */
export function MinimalNavbar() {
  const mode = useNavbarMode();
  const layoutSettings = useLayoutSettings();
  const { session, logout } = useContext(AuthContext);
  const { totalItems } = useCart();
  const { t, locale, toggleLocale, dir } = useMinimalI18n();

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [categories, setCategories] = useState<{ id: string; name: string; slug?: string }[]>([]);

  // Live search state
  const [liveResults, setLiveResults] = useState<{
    products: { id: string; slug?: string | null; name: string; price: number; imageUrl?: string }[];
    categories: { id: string; name: string; slug?: string }[];
  }>({ products: [], categories: [] });
  const [isSearching, setIsSearching] = useState(false);
  const searchDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    trpc.category.view.query().then((res) => {
      if (res.success && res.result) {
        setCategories(res.result.map((c: { id: string; name: string; slug?: string }) => ({ id: c.id, name: c.name, slug: c.slug })));
      }
    }).catch(() => {});
  }, []);

  // Live search with debounce
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setLiveResults({ products: [], categories: [] });
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const q = searchQuery.trim().toLowerCase();
        const [productRes] = await Promise.all([
          trpc.product.search.query({ search: q, limit: 5, includeOutOfStock: false }),
        ]);
        const matchedProducts = productRes.success && productRes.result
          ? productRes.result.items.map((p: any) => ({
              id: p.id,
              slug: p.slug,
              name: p.name,
              price: Number(p.price),
              imageUrl: p.imageUrl ? `/uploads/${p.imageUrl}` : p.images?.[0]?.url ? `/uploads/${p.images[0].url}` : undefined,
            }))
          : [];
        const matchedCategories = categories.filter((c) =>
          c.name.toLowerCase().includes(q),
        );
        setLiveResults({ products: matchedProducts, categories: matchedCategories });
      } catch {
        /* ignore */
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, categories]);

  // Close search dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchDropdownRef.current && !searchDropdownRef.current.contains(e.target as Node)) {
        if (isSearchOpen && !searchInputRef.current?.contains(e.target as Node)) {
          setIsSearchOpen(false);
          setSearchQuery("");
          setLiveResults({ products: [], categories: [] });
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isSearchOpen]);

  const handleSearchSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setIsSearchOpen(false);
      setSearchQuery("");
      setIsSheetOpen(false);
    }
  };

  const cmsNavLinks = layoutSettings.header.navigationLinks;
  const links =
    cmsNavLinks.length > 0
      ? cmsNavLinks.map((l) => ({
          id: l.id,
          label: locale === "ar" && l.labelAr ? l.labelAr : l.label,
          to: l.url,
          isDropdown: l.isDropdown ?? false,
          categoryIds: l.categoryIds ?? [],
        }))
      : [{ id: "default-shop", label: "Shop", to: "/shop", isDropdown: false, categoryIds: [] as string[] }];

  const handleCloseSheet = () => setIsSheetOpen(false);

  const marqueeEnabled = layoutSettings.header.marqueeEnabled;
  const marqueeText = locale === "ar" && layoutSettings.header.marqueeTextAr
    ? layoutSettings.header.marqueeTextAr
    : layoutSettings.header.marqueeText;
  const marqueeBackgroundColor = layoutSettings.header.marqueeBackgroundColor;
  const marqueeTextColor = layoutSettings.header.marqueeTextColor;

  return (
    <>
      {/* ── Scrolling Marquee ── */}
      {marqueeEnabled && marqueeText && (
        <Marquee
          key={marqueeText}
          text={marqueeText}
          repeat={14}
          duration={240}
          className='bg-white text-black'
          style={{
            ...(marqueeBackgroundColor
              ? { backgroundColor: marqueeBackgroundColor }
              : {}),
            ...(marqueeTextColor ? { color: marqueeTextColor } : {}),
          }}
        />
      )}

      <nav className='w-full bg-white border-b border-gray-200' dir={dir === "rtl" ? "ltr" : "rtl"}>
        <div className='max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8'>
          <div className='flex items-center justify-between h-16 sm:h-[72px]'>
            {/* ── Left: Action icons ── */}
            <div className='flex items-center gap-1 sm:gap-2'>
              

              {/* User / Auth */}
              {!session ? (
                <Link
                  href='/login'
                  className='p-2 text-gray-700 hover:text-black transition-colors'
                  aria-label={t("nav.login")}>
                  <User className='w-[18px] h-[18px]' />
                </Link>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className='p-1.5 w-8 h-8 rounded-full bg-gray-900 text-white text-xs font-medium flex items-center justify-center hover:bg-gray-700 transition-colors'
                      aria-label="Account menu">
                      {session.name ? session.name.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52 z-[10001]">
                    <div className="px-3 py-2 border-b border-gray-100">
                      <p className="text-sm font-medium text-gray-900 truncate">{session.name || "Account"}</p>
                      <p className="text-xs text-gray-400 truncate">{session.email}</p>
                    </div>
                    <DropdownMenuItem asChild>
                      <Link href="/account" className="flex items-center gap-2.5 cursor-pointer">
                        <User className="w-4 h-4 text-gray-500" /> My Account
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/account?tab=orders" className="flex items-center gap-2.5 cursor-pointer">
                        <Package className="w-4 h-4 text-gray-500" /> Orders
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/account?tab=wishlist" className="flex items-center gap-2.5 cursor-pointer">
                        <Heart className="w-4 h-4 text-gray-500" /> Wishlist
                      </Link>
                    </DropdownMenuItem>
                    {(session.role === "admin" || session.role === "superadmin") && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                          <Link href="/dashboard" className="flex items-center gap-2.5 cursor-pointer">
                            <LayoutDashboard className="w-4 h-4 text-gray-500" /> Dashboard
                          </Link>
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => logout()}
                      className="flex items-center gap-2.5 cursor-pointer text-red-600 focus:text-red-600">
                      <LogOut className="w-4 h-4" /> Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
                {/* Cart */}
              <Link
                href='/cart'
                className='relative p-2 text-gray-700 hover:text-black transition-colors'
                aria-label={t("nav.cart")}>
                <ShoppingCart className='w-[18px] h-[18px]' />
                {totalItems > 0 && (
                  <span className='absolute -top-0.5 -right-0.5 inline-flex items-center justify-center w-[18px] h-[18px] text-[10px] font-medium leading-none bg-red-600 text-white rounded-full'>
                    {totalItems}
                  </span>
                )}
              </Link>

              {/* Desktop Search */}
              <div className='hidden lg:block relative' ref={searchDropdownRef}>
                {isSearchOpen ? (
                  <div className='flex items-center'>
                    <form onSubmit={handleSearchSubmit} className='flex items-center'>
                      <div className='relative'>
                        <Search className='absolute start-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400' />
                        <input
                          ref={searchInputRef}
                          type='text'
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder={t("nav.search")}
                          autoFocus
                          className='w-48 ps-8 pe-8 py-1.5 text-sm border border-gray-200 outline-none focus:border-gray-900 transition-colors bg-white'
                        />
                        <button
                          type='button'
                          onClick={() => {
                            setIsSearchOpen(false);
                            setSearchQuery("");
                            setLiveResults({ products: [], categories: [] });
                          }}
                          className='absolute end-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black'>
                          <X className='w-3.5 h-3.5' />
                        </button>
                      </div>
                    </form>
                    {/* Live results dropdown */}
                    {(searchQuery.trim().length >= 2) && (
                      <div className='absolute top-full start-0 mt-1 w-72 bg-white border border-gray-200 shadow-lg z-50 max-h-80 overflow-y-auto'>
                        {isSearching ? (
                          <div className='flex items-center justify-center py-4'>
                            <Loader2 className='w-4 h-4 animate-spin text-gray-400' />
                          </div>
                        ) : (
                          <>
                            {liveResults.categories.length > 0 && (
                              <div className='px-3 py-2 border-b border-gray-100'>
                                <p className='text-[10px] uppercase tracking-wider text-gray-400 mb-1'>
                                  {locale === "ar" ? "الأقسام" : "Categories"}
                                </p>
                                {liveResults.categories.map((cat) => (
                                  <Link
                                    key={cat.id}
                                    href={`/shop?category=${cat.slug || cat.id}`}
                                    className='block py-1.5 text-sm text-gray-700 hover:text-black transition-colors'
                                    onClick={() => {
                                      setIsSearchOpen(false);
                                      setSearchQuery("");
                                      setLiveResults({ products: [], categories: [] });
                                    }}>
                                    {cat.name}
                                  </Link>
                                ))}
                              </div>
                            )}
                            {liveResults.products.length > 0 && (
                              <div className='px-3 py-2'>
                                <p className='text-[10px] uppercase tracking-wider text-gray-400 mb-1'>
                                  {locale === "ar" ? "المنتجات" : "Products"}
                                </p>
                                {liveResults.products.map((p) => (
                                  <Link
                                    key={p.id}
                                    href={getProductUrl(p)}
                                    className='flex items-center gap-3 py-2 hover:bg-gray-50 -mx-3 px-3 transition-colors'
                                    onClick={() => {
                                      setIsSearchOpen(false);
                                      setSearchQuery("");
                                      setLiveResults({ products: [], categories: [] });
                                    }}>
                                    {p.imageUrl && (
                                      <img src={p.imageUrl} alt={p.name} className='w-10 h-10 object-cover bg-gray-50' />
                                    )}
                                    <div className='flex-1 min-w-0'>
                                      <p className='text-sm text-gray-800 truncate'>{p.name}</p>
                                      <p className='text-xs text-gray-500'>{p.price.toFixed(2)} {STORE_CURRENCY}</p>
                                    </div>
                                  </Link>
                                ))}
                              </div>
                            )}
                            {liveResults.products.length === 0 && liveResults.categories.length === 0 && (
                              <p className='px-3 py-4 text-sm text-gray-400 text-center'>
                                {locale === "ar" ? "لا توجد نتائج" : "No results found"}
                              </p>
                            )}
                            {searchQuery.trim().length >= 2 && (
                              <div className='border-t border-gray-100 px-3 py-2'>
                                <button
                                  type='button'
                                  onClick={() => handleSearchSubmit()}
                                  className='text-xs text-gray-500 hover:text-black transition-colors w-full text-center'>
                                  {locale === "ar" ? "عرض جميع النتائج" : "View all results"} →
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    type='button'
                    onClick={() => {
                      setIsSearchOpen(true);
                      setTimeout(() => searchInputRef.current?.focus(), 100);
                    }}
                    className='p-2 text-gray-700 hover:text-black transition-colors'
                    aria-label={t("nav.search")}>
                    <Search className='w-[18px] h-[18px]' />
                  </button>
                )}
              </div>
              

              {/* Language toggle */}
              {/* <button
                type='button'
                onClick={toggleLocale}
                className='p-2 text-gray-700 hover:text-black transition-colors text-xs font-medium'
                aria-label='Toggle language'>
                {locale === "en" ? "AR" : "EN"}
              </button> */}
            </div>

            {/* ── Center / Right: Navigation Links (desktop) ── */}
            <div className='hidden lg:flex items-center gap-1'>
              {links.map((link) => {
                if (link.isDropdown && link.categoryIds.length > 0) {
                  // Desktop: hover dropdown listing the categories.
                  // (Mobile menu still renders these flattened — see below.)
                  const dropdownCats = categories.filter((c) => link.categoryIds.includes(c.id));
                  if (dropdownCats.length === 0) return null;
                  return (
                    <div key={link.id} className='relative group'>
                      <button
                        type='button'
                        style={{ fontFamily: "var(--font-nav, 'LaRojaTV', 'Poppins', sans-serif)" }}
                        className='px-2 xl:px-3 py-1.5 text-sm xl:text-[15px] font-semibold text-gray-800 hover:text-black transition-colors tracking-wide whitespace-nowrap flex items-center gap-1'>
                        {link.label}
                        <ChevronDown className='w-3.5 h-3.5 transition-transform duration-150 group-hover:rotate-180' />
                      </button>
                      <div className='absolute top-full start-0 pt-2 opacity-0 invisible translate-y-1 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-150 z-50'>
                        <div className='bg-white border border-gray-200 shadow-lg min-w-[200px] py-2 rounded-md'>
                          {dropdownCats.map((cat) => (
                            <Link
                              key={cat.id}
                              href={`/shop?category=${cat.slug || cat.id}`}
                              className='block px-4 py-2 text-sm font-semibold text-gray-800 tracking-wide hover:bg-gray-50 hover:text-black transition-colors whitespace-nowrap'>
                              {cat.name}
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                }
                return (
                  <Link
                    key={link.id}
                    href={link.to}
                    className='px-3 py-1.5 text-[15px] font-semibold text-gray-800 hover:text-black transition-colors tracking-wide'>
                    {link.label}
                  </Link>
                );
              })}
            </div>

            {/* ── Far Right: Logo + Mobile hamburger ── */}
            <div className='flex items-center gap-2'>
              {/* Desktop Logo */}
              <HeaderLogo
                variant='desktop'
                textClassName='text-2xl sm:text-[28px] font-normal tracking-[0.22em] text-gray-900 uppercase hover:text-gray-600 transition-colors'
              />

              {/* Mobile hamburger */}
              <div className='lg:hidden'>
                <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                  <SheetTrigger asChild>
                    <button
                      type='button'
                      className='p-2 text-gray-700 hover:text-black transition-colors'
                      aria-label={t("nav.menu")}>
                      <Menu className='w-5 h-5' />
                    </button>
                  </SheetTrigger>
                  <SheetContent side={dir === "rtl" ? "right" : "left"} className='w-72 bg-white p-0 [&>button:last-child]:hidden'>
                    <div className='flex flex-col h-full'>
                      {/* Mobile header: logo + close */}
                      <div className='p-6 border-b border-gray-100 flex items-center justify-between'>
                        <HeaderLogo
                          variant='mobile'
                          onClick={() => {
                            handleCloseSheet();
                            navigate('/');
                          }}
                          textClassName='text-xl font-normal tracking-[0.2em] text-gray-900 uppercase'
                        />
                        <button
                          type='button'
                          onClick={handleCloseSheet}
                          className='p-1 text-gray-500 hover:text-black transition-colors'
                          aria-label='Close menu'>
                          <X className='w-5 h-5' />
                        </button>
                      </div>

                      {/* Mobile search */}
                      <div className='px-5 pt-5'>
                        <form onSubmit={handleSearchSubmit}>
                          <div className='relative'>
                            <Search className='absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400' />
                            <input
                              type='text'
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              placeholder={t("nav.search")}
                              className='w-full ps-9 pe-4 py-2.5 text-sm border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 transition-colors'
                            />
                          </div>
                        </form>
                        {/* Mobile live results */}
                        {searchQuery.trim().length >= 2 && (
                          <div className='mt-2 bg-white border border-gray-200 max-h-60 overflow-y-auto'>
                            {isSearching ? (
                              <div className='flex items-center justify-center py-4'>
                                <Loader2 className='w-4 h-4 animate-spin text-gray-400' />
                              </div>
                            ) : (
                              <>
                                {liveResults.categories.length > 0 && (
                                  <div className='px-3 py-2 border-b border-gray-100'>
                                    <p className='text-[10px] uppercase tracking-wider text-gray-400 mb-1'>
                                      {locale === "ar" ? "الأقسام" : "Categories"}
                                    </p>
                                    {liveResults.categories.map((cat) => (
                                      <Link
                                        key={cat.id}
                                        href={`/shop?category=${cat.slug || cat.id}`}
                                        className='block py-1.5 text-sm text-gray-700 hover:text-black transition-colors'
                                        onClick={() => {
                                          setSearchQuery("");
                                          setLiveResults({ products: [], categories: [] });
                                          setIsSheetOpen(false);
                                        }}>
                                        {cat.name}
                                      </Link>
                                    ))}
                                  </div>
                                )}
                                {liveResults.products.length > 0 && (
                                  <div className='px-3 py-2'>
                                    <p className='text-[10px] uppercase tracking-wider text-gray-400 mb-1'>
                                      {locale === "ar" ? "المنتجات" : "Products"}
                                    </p>
                                    {liveResults.products.map((p) => (
                                      <Link
                                        key={p.id}
                                        href={getProductUrl(p)}
                                        className='flex items-center gap-3 py-2 hover:bg-gray-50 -mx-3 px-3 transition-colors'
                                        onClick={() => {
                                          setSearchQuery("");
                                          setLiveResults({ products: [], categories: [] });
                                          setIsSheetOpen(false);
                                        }}>
                                        {p.imageUrl && (
                                          <img src={p.imageUrl} alt={p.name} className='w-10 h-10 object-cover bg-gray-50' />
                                        )}
                                        <div className='flex-1 min-w-0'>
                                          <p className='text-sm text-gray-800 truncate'>{p.name}</p>
                                          <p className='text-xs text-gray-500'>{p.price.toFixed(2)} {STORE_CURRENCY}</p>
                                        </div>
                                      </Link>
                                    ))}
                                  </div>
                                )}
                                {liveResults.products.length === 0 && liveResults.categories.length === 0 && (
                                  <p className='px-3 py-4 text-sm text-gray-400 text-center'>
                                    {locale === "ar" ? "لا توجد نتائج" : "No results found"}
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Mobile nav links */}
                      <div className='flex-1 px-5 pt-6'>
                        <div className='flex flex-col gap-4'>
                          {links.map((link) => {
                            if (link.isDropdown && link.categoryIds.length > 0) {
                              // Flattened: each category renders as its own
                              // top-level link instead of an accordion.
                              const dropdownCats = categories.filter((c) => link.categoryIds.includes(c.id));
                              if (dropdownCats.length === 0) return null;
                              return dropdownCats.map((cat) => (
                                <Link
                                  key={cat.id}
                                  href={`/shop?category=${cat.slug || cat.id}`}
                                  className='text-sm font-normal text-gray-800 hover:text-black transition-colors tracking-wide'
                                  onClick={handleCloseSheet}>
                                  {cat.name}
                                </Link>
                              ));
                            }
                            return (
                              <Link
                                key={link.id}
                                href={link.to}
                                className='text-sm font-normal text-gray-800 hover:text-black transition-colors tracking-wide'
                                onClick={handleCloseSheet}>
                                {link.label}
                              </Link>
                            );
                          })}
                        </div>

                        {session && (
                          <div className='border-t border-gray-100 pt-5 mt-6 space-y-4'>
                            <Link href='/account' className='flex items-center gap-2.5 text-sm text-gray-600 hover:text-black' onClick={handleCloseSheet}>
                              <User className="w-4 h-4" /> My Account
                            </Link>
                            <Link href='/account?tab=orders' className='flex items-center gap-2.5 text-sm text-gray-600 hover:text-black' onClick={handleCloseSheet}>
                              <Package className="w-4 h-4" /> Orders
                            </Link>
                            <Link href='/account?tab=wishlist' className='flex items-center gap-2.5 text-sm text-gray-600 hover:text-black' onClick={handleCloseSheet}>
                              <Heart className="w-4 h-4" /> Wishlist
                            </Link>
                            {(session.role === "admin" || session.role === "superadmin") && (
                              <Link href='/dashboard' className='flex items-center gap-2.5 text-sm text-gray-600 hover:text-black' onClick={handleCloseSheet}>
                                <LayoutDashboard className="w-4 h-4" /> Dashboard
                              </Link>
                            )}
                          </div>
                        )}

                        {/* Language toggle — bottom of menu, just above Logout */}
                        <div className={session ? "mt-4 space-y-4" : "border-t border-gray-100 pt-5 mt-6"}>
                          <button
                            type='button'
                            onClick={() => {
                              toggleLocale();
                            }}
                            className='flex items-center gap-2 text-sm text-gray-600 hover:text-black transition-colors'>
                            <Globe className='w-4 h-4' />
                            {locale === "en" ? "العربية" : "English"}
                          </button>

                          {session && (
                            <button
                              onClick={() => { logout(); handleCloseSheet(); }}
                              className='flex items-center gap-2.5 text-sm text-red-600 hover:text-red-700'
                              type='button'>
                              <LogOut className="w-4 h-4" /> Logout
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}
