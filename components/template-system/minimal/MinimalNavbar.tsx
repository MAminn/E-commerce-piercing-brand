import { useContext, useState, useRef, useEffect, useId } from "react";
import { Search, User, X, Menu, ChevronDown } from "lucide-react";
import { usePageContext } from "vike-react/usePageContext";
import { Link } from "#root/components/utils/Link";
import { AuthContext } from "#root/context/AuthContext";
import { useCart } from "#root/lib/context/CartContext";
import { useLayoutSettings } from "#root/frontend/contexts/LayoutSettingsContext";
import { BRAND_WORDMARK } from "#root/shared/config/branding";
import { Marquee } from "#root/components/ui/marquee";
import { navigate } from "vike/client/router";
import { trpc } from "#root/shared/trpc/client";
import { getProductUrl } from "#root/lib/utils/route-helpers";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { isUsableHref } from "#root/shared/config/storefront";
import { Sheet, SheetContent, SheetTitle } from "#root/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#root/components/ui/dropdown-menu";
import { visibleToShoppers } from "#root/shared/categories/tree";
import { ICON_PROPS, IconButton, buttonClass } from "#root/components/storefront/Button";
import { Price } from "#root/components/storefront/Price";
import { cn } from "#root/lib/utils";
import { AnnouncementBar } from "#root/components/storefront/promo/PromoLayer";

interface NavLinkItem {
  id: string;
  label: string;
  to: string;
  isDropdown: boolean;
  categoryIds: string[];
}

interface LiveResults {
  products: {
    id: string;
    slug?: string | null;
    name: string;
    price: number;
    /** Present only when the product is genuinely discounted. */
    discountPrice?: number | null;
    imageUrl?: string;
  }[];
  categories: { id: string; name: string; slug?: string }[];
}

const EMPTY_RESULTS: LiveResults = { products: [], categories: [] };

/**
 * A nav link is the current page when its path matches and it names the same
 * listing section (`/shop` vs `/shop?section=newarrivals`).
 */
function isCurrentLink(to: string, pathname: string, search: Record<string, string>): boolean {
  const [path = "", query = ""] = to.split("?");
  const normalize = (p: string) => p.replace(/\/+$/, "") || "/";
  if (normalize(path) !== normalize(pathname)) return false;
  const section = new URLSearchParams(query).get("section");
  return (section ?? null) === (search.section ?? null);
}

/**
 * Percé navbar — Object Index.
 *
 * A solid stone bar with one hairline, on every route (no transparent
 * state). 56px on phones, 64px from 1024px.
 *
 *   desktop  wordmark · primary links ·············· search · account · Bag (N)
 *   mobile   menu ·········· wordmark ·········· search · Bag (N)
 *
 * The mobile menu is a full-height sheet from the start edge carrying the
 * links, Offers, Wishlist, Account, Orders, language and sign-out — every
 * destination the old bottom nav had. Logical properties throughout, so the
 * whole bar mirrors under RTL.
 */
export function MinimalNavbar() {
  const layoutSettings = useLayoutSettings();
  const { session, logout } = useContext(AuthContext);
  const { totalItems } = useCart();
  const { t, locale, toggleLocale, dir } = useMinimalI18n();
  const { urlPathname, urlParsed } = usePageContext();
  const currentSearch = (urlParsed?.search ?? {}) as Record<string, string>;

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchPanelRef = useRef<HTMLDivElement>(null);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const searchPanelId = useId();
  const [categories, setCategories] = useState<{ id: string; name: string; slug?: string }[]>([]);

  const [liveResults, setLiveResults] = useState<LiveResults>(EMPTY_RESULTS);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    trpc.category.view.query().then((res) => {
      if (res.success && res.result) {
        setCategories(visibleToShoppers(res.result).map((c: { id: string; name: string; slug?: string }) => ({ id: c.id, name: c.name, slug: c.slug })));
      }
    }).catch(() => {});
  }, []);

  // Bundles & Stacks becomes a nav destination on its own once at least one
  // campaign is live — no CMS step needed, and nothing to click into while
  // the store has no bundles. A merchant who adds their own /bundles link in
  // Layout Settings (custom label, position) takes precedence.
  const [hasLiveBundles, setHasLiveBundles] = useState(false);
  useEffect(() => {
    trpc.bundle.listLive
      .query({ limit: 1 })
      .then((res) => setHasLiveBundles(!!(res.success && res.result && res.result.length > 0)))
      .catch(() => {});
  }, []);

  // Live search with debounce
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setLiveResults(EMPTY_RESULTS);
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
              // The dropdown used to print `p.price` unconditionally, so a
              // discounted product was quoted at its pre-discount price here
              // and at its real price on every card and on its own page.
              discountPrice:
                p.discountPrice != null && Number(p.discountPrice) < Number(p.price)
                  ? Number(p.discountPrice)
                  : null,
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

  const closeSearch = (restoreFocus = false) => {
    setIsSearchOpen(false);
    setSearchQuery("");
    setLiveResults(EMPTY_RESULTS);
    if (restoreFocus) searchToggleRef.current?.focus();
  };

  // Close the search panel on an outside click or Escape.
  useEffect(() => {
    if (!isSearchOpen) return;
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (searchPanelRef.current?.contains(target)) return;
      if (searchToggleRef.current?.contains(target)) return;
      closeSearch();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSearch(true);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: closeSearch only touches setters and refs
  }, [isSearchOpen]);

  useEffect(() => {
    if (isSearchOpen) searchInputRef.current?.focus();
  }, [isSearchOpen]);

  const handleSearchSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      closeSearch();
      setIsSheetOpen(false);
    }
  };

  // Navigation must only ever point at destinations that exist. A CMS link
  // left at "#" (or blank) rendered as a real nav item that did nothing —
  // the same trap the footers had. Dropdown parents are exempt: they open a
  // category menu rather than navigating themselves.
  const cmsNavLinks = layoutSettings.header.navigationLinks.filter(
    (l) => l.isDropdown || isUsableHref(l.url),
  );
  const baseLinks: NavLinkItem[] =
    cmsNavLinks.length > 0
      ? cmsNavLinks.map((l) => ({
          id: l.id,
          label: locale === "ar" && l.labelAr ? l.labelAr : l.label,
          to: l.url,
          isDropdown: l.isDropdown ?? false,
          categoryIds: l.categoryIds ?? [],
        }))
      : [{ id: "default-shop", label: "Shop", to: "/shop", isDropdown: false, categoryIds: [] }];
  const cmsLinksToBundles = baseLinks.some((l) => l.to.split("?")[0]?.replace(/\/$/, "") === "/bundles");
  const links: NavLinkItem[] =
    hasLiveBundles && !cmsLinksToBundles
      ? [...baseLinks, { id: "auto-bundles", label: t("nav.bundles"), to: "/bundles", isDropdown: false, categoryIds: [] }]
      : baseLinks;

  const handleCloseSheet = () => setIsSheetOpen(false);

  const marqueeEnabled = layoutSettings.header.marqueeEnabled;
  const marqueeText = locale === "ar" && layoutSettings.header.marqueeTextAr
    ? layoutSettings.header.marqueeTextAr
    : layoutSettings.header.marqueeText;
  const marqueeBackgroundColor = layoutSettings.header.marqueeBackgroundColor;
  const marqueeTextColor = layoutSettings.header.marqueeTextColor;

  const isAdmin = session?.role === "admin" || session?.role === "superadmin";
  const bagLabel =
    totalItems === 1
      ? t("nav.bag_count_one")
      : t("nav.bag_count").replace("{count}", String(totalItems));

  const navLinkClass = (active: boolean) =>
    cn(
      "inline-flex min-h-11 items-center t-label transition-colors",
      active
        ? "text-ink underline decoration-1 underline-offset-[6px]"
        : "text-ink-2 hover:text-ink",
    );

  return (
    <>
      {/* ── Promotional announcement (shared/config/promo-layer, off) ── */}
      <AnnouncementBar />

      {/* ── Scrolling Marquee (CMS, off unless an admin enables it) ── */}
      {marqueeEnabled && marqueeText && (
        <Marquee
          key={marqueeText}
          text={marqueeText}
          repeat={14}
          duration={240}
          className='bg-ink text-bg'
          style={{
            ...(marqueeBackgroundColor
              ? { backgroundColor: marqueeBackgroundColor }
              : {}),
            ...(marqueeTextColor ? { color: marqueeTextColor } : {}),
          }}
        />
      )}

      <nav aria-label='Main' className='perce-nav relative w-full'>
        <div className='perce-container'>
          <div className='relative flex h-14 items-center lg:h-16'>
            {/* ── Mobile: menu (start) ── */}
            <div className='-ms-3 flex items-center lg:hidden'>
              <IconButton
                aria-label={t("nav.menu")}
                aria-expanded={isSheetOpen}
                aria-haspopup='dialog'
                onClick={() => setIsSheetOpen(true)}>
                <Menu {...ICON_PROPS} />
              </IconButton>
            </div>

            {/* ── Wordmark: centred on phones, at the start from 1024px ── */}
            <div className='absolute inset-x-0 mx-auto flex w-max items-center lg:static lg:mx-0'>
              <Wordmark className='text-[1.375rem] lg:text-2xl' />
            </div>

            {/* ── Desktop: primary links beside the wordmark ── */}
            <ul className='ms-8 hidden items-center gap-6 lg:flex'>
              {links.map((link) => {
                if (link.isDropdown && link.categoryIds.length > 0) {
                  // Desktop: hover/focus dropdown listing the categories.
                  // (The mobile menu renders these flattened — see below.)
                  const dropdownCats = categories.filter((c) => link.categoryIds.includes(c.id));
                  if (dropdownCats.length === 0) return null;
                  return (
                    <li key={link.id} className='group relative'>
                      <button
                        type='button'
                        aria-haspopup='true'
                        className={cn(navLinkClass(false), "gap-1")}>
                        {link.label}
                        <ChevronDown aria-hidden size={16} strokeWidth={1.5} />
                      </button>
                      <div className='invisible absolute start-0 top-full z-50 pt-2 opacity-0 transition-opacity duration-[var(--perce-duration-fast)] group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100'>
                        <ul className='min-w-[200px] border border-line bg-surface py-2'>
                          {dropdownCats.map((cat) => (
                            <li key={cat.id}>
                              <Link
                                href={`/shop?category=${cat.slug || cat.id}`}
                                className='flex min-h-11 items-center whitespace-nowrap px-4 t-small text-ink transition-colors hover:bg-surface-2'>
                                {cat.name}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </li>
                  );
                }
                const active = isCurrentLink(link.to, urlPathname, currentSearch);
                return (
                  <li key={link.id}>
                    <a
                      href={link.to}
                      aria-current={active ? "page" : undefined}
                      className={navLinkClass(active)}>
                      {link.label}
                    </a>
                  </li>
                );
              })}
            </ul>

            {/* ── End: search · account (desktop) · Bag (N) ── */}
            <div className='-me-3 ms-auto flex items-center'>
              <IconButton
                ref={searchToggleRef}
                aria-label={isSearchOpen ? t("nav.close_search") : t("nav.search_label")}
                aria-expanded={isSearchOpen}
                aria-controls={searchPanelId}
                onClick={() => (isSearchOpen ? closeSearch() : setIsSearchOpen(true))}>
                {isSearchOpen ? <X {...ICON_PROPS} /> : <Search {...ICON_PROPS} />}
              </IconButton>

              <div className='hidden lg:block'>
                {!session ? (
                  <a
                    href='/login'
                    aria-label={t("nav.sign_in")}
                    className={buttonClass({ variant: "icon", size: "md" })}>
                    <User {...ICON_PROPS} />
                  </a>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <IconButton aria-label={t("nav.account_menu")}>
                        <User {...ICON_PROPS} />
                      </IconButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align='end'
                      style={{ zIndex: "var(--perce-z-overlay)" }}
                      className='w-56 rounded-none border-line bg-surface p-0 shadow-none'>
                      <div className='border-b border-line px-4 py-3'>
                        <p className='truncate t-label text-ink'>{session.name || t("nav.account")}</p>
                        <p className='truncate t-small text-ink-2'>{session.email}</p>
                      </div>
                      <DropdownMenuItem asChild className='min-h-11 rounded-none px-4 t-small text-ink focus:bg-surface-2'>
                        <a href='/account'>{t("nav.account")}</a>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild className='min-h-11 rounded-none px-4 t-small text-ink focus:bg-surface-2'>
                        <a href='/account?tab=orders'>{t("nav.orders")}</a>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild className='min-h-11 rounded-none px-4 t-small text-ink focus:bg-surface-2'>
                        <a href='/account?tab=wishlist'>{t("nav.wishlist")}</a>
                      </DropdownMenuItem>
                      {isAdmin && (
                        <>
                          <DropdownMenuSeparator className='m-0 bg-line' />
                          <DropdownMenuItem asChild className='min-h-11 rounded-none px-4 t-small text-ink focus:bg-surface-2'>
                            <a href='/dashboard'>{t("nav.dashboard")}</a>
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator className='m-0 bg-line' />
                      <DropdownMenuItem
                        onClick={() => logout()}
                        className='min-h-11 rounded-none px-4 t-small text-ink focus:bg-surface-2'>
                        {t("nav.logout")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              <a
                href='/cart'
                aria-label={bagLabel}
                aria-current={urlPathname === "/cart" ? "page" : undefined}
                data-testid='nav-bag'
                className='inline-flex min-h-11 min-w-11 items-center justify-center gap-1 px-3 t-label text-ink transition-colors hover:text-ink-2'>
                {t("nav.bag")}
                <span aria-hidden='true' className='tabular-nums' data-testid='nav-bag-count'>
                  ({totalItems})
                </span>
              </a>
            </div>
          </div>
        </div>

        {/* ── Search panel: drops below the bar, never shifts the page ── */}
        {isSearchOpen && (
          <div
            id={searchPanelId}
            ref={searchPanelRef}
            className='absolute inset-x-0 top-full border-b border-line bg-surface'>
            <div className='perce-container py-4'>
              <form role='search' onSubmit={handleSearchSubmit}>
                <label htmlFor={`${searchPanelId}-input`} className='sr-only'>
                  {t("nav.search_label")}
                </label>
                <div className='relative'>
                  <Search
                    aria-hidden
                    size={20}
                    strokeWidth={1.5}
                    className='pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-2'
                  />
                  <input
                    ref={searchInputRef}
                    id={`${searchPanelId}-input`}
                    type='search'
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t("nav.search")}
                    autoComplete='off'
                    className='h-12 w-full border border-line-input bg-surface pe-3 ps-11 t-body text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none'
                  />
                </div>
              </form>
              <SearchResults
                query={searchQuery}
                isSearching={isSearching}
                results={liveResults}
                onPick={() => closeSearch()}
                onViewAll={() => handleSearchSubmit()}
              />
            </div>
          </div>
        )}
      </nav>

      {/* ── Mobile menu: full-height sheet from the start edge ── */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent
          side={dir === "rtl" ? "right" : "left"}
          dir={dir}
          aria-describedby={undefined}
          className='w-[min(22rem,88vw)] gap-0 border-line bg-surface p-0 shadow-none sm:max-w-none [&>button:last-child]:hidden'>
          <SheetTitle className='sr-only'>{t("nav.menu")}</SheetTitle>
          <div className='flex h-full flex-col'>
            <div className='flex h-14 items-center justify-between border-b border-line px-4'>
              <Wordmark className='text-[1.375rem]' onClick={handleCloseSheet} />
              <IconButton aria-label={t("nav.close_menu")} onClick={handleCloseSheet} className='-me-3'>
                <X {...ICON_PROPS} />
              </IconButton>
            </div>

            <div className='flex-1 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]'>
              <ul className='py-2'>
                {links.flatMap((link) => {
                  if (link.isDropdown && link.categoryIds.length > 0) {
                    // Flattened: each category renders as its own top-level link.
                    const dropdownCats = categories.filter((c) => link.categoryIds.includes(c.id));
                    return dropdownCats.map((cat) => (
                      <li key={cat.id} className='border-b border-line'>
                        <Link
                          href={`/shop?category=${cat.slug || cat.id}`}
                          className='flex min-h-13 items-center t-h3 text-ink'
                          onClick={handleCloseSheet}>
                          {cat.name}
                        </Link>
                      </li>
                    ));
                  }
                  const active = isCurrentLink(link.to, urlPathname, currentSearch);
                  return [
                    <li key={link.id} className='border-b border-line'>
                      <a
                        href={link.to}
                        aria-current={active ? "page" : undefined}
                        onClick={handleCloseSheet}
                        className={cn(
                          "flex min-h-13 items-center t-h3 text-ink",
                          active && "underline decoration-1 underline-offset-[6px]",
                        )}>
                        {link.label}
                      </a>
                    </li>,
                  ];
                })}
              </ul>

              {/* Everything the old bottom nav carried (Offers, Wishlist,
                  Account) plus orders, language and sign-out. */}
              <ul className='pt-4'>
                {[
                  { key: "offers", href: "/offers", label: t("nav.offers") },
                  { key: "wishlist", href: "/account?tab=wishlist", label: t("nav.wishlist") },
                  session
                    ? { key: "account", href: "/account", label: t("nav.account") }
                    : { key: "login", href: "/login", label: t("nav.sign_in") },
                  ...(session ? [{ key: "orders", href: "/account?tab=orders", label: t("nav.orders") }] : []),
                  ...(isAdmin ? [{ key: "dashboard", href: "/dashboard", label: t("nav.dashboard") }] : []),
                ].map((item) => (
                  <li key={item.key}>
                    <a
                      href={item.href}
                      onClick={handleCloseSheet}
                      aria-current={
                        item.href.split("?")[0] === urlPathname && !item.href.includes("?") ? "page" : undefined
                      }
                      className='flex min-h-11 items-center t-body text-ink-2 transition-colors hover:text-ink'>
                      {item.label}
                    </a>
                  </li>
                ))}
                <li>
                  <button
                    type='button'
                    lang={locale === "en" ? "ar" : "en"}
                    onClick={() => toggleLocale()}
                    className='flex min-h-11 w-full items-center t-body text-ink-2 transition-colors hover:text-ink'>
                    {t("nav.language")}
                  </button>
                </li>
                {session && (
                  <li>
                    <button
                      type='button'
                      onClick={() => {
                        logout();
                        handleCloseSheet();
                      }}
                      className='flex min-h-11 w-full items-center t-body text-ink-2 transition-colors hover:text-ink'>
                      {t("nav.logout")}
                    </button>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * The locked header mark: the lowercase "percé" wordmark in ink on stone,
 * always. It deliberately does NOT render the CMS header logo image — an
 * asset made for the old dark header can vanish on the stone bar. The stored
 * logo settings are untouched (other shells and emails still read them).
 */
function Wordmark({ className, onClick }: { className?: string; onClick?: () => void }) {
  return (
    <a
      href='/'
      onClick={onClick}
      data-testid='header-wordmark'
      className={cn("perce-wordmark inline-flex min-h-11 items-center text-ink", className)}>
      {BRAND_WORDMARK}
    </a>
  );
}

function SearchResults({
  query,
  isSearching,
  results,
  onPick,
  onViewAll,
}: {
  query: string;
  isSearching: boolean;
  results: LiveResults;
  onPick: () => void;
  onViewAll: () => void;
}) {
  const { t, locale } = useMinimalI18n();
  if (query.trim().length < 2) return null;
  const empty = results.products.length === 0 && results.categories.length === 0;

  return (
    <div className='mt-4 max-h-[min(60vh,28rem)] overflow-y-auto' aria-live='polite' aria-busy={isSearching || undefined}>
      {isSearching ? (
        <p className='py-4 t-small text-ink-2'>…</p>
      ) : (
        <>
          {results.categories.length > 0 && (
            <div className='border-b border-line pb-3'>
              <p className='mb-1 t-micro text-ink-2'>{t("nav.search_categories")}</p>
              <ul>
                {results.categories.map((cat) => (
                  <li key={cat.id}>
                    <a
                      href={`/shop?category=${cat.slug || cat.id}`}
                      onClick={onPick}
                      className='flex min-h-11 items-center t-small text-ink hover:text-ink-2'>
                      {cat.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {results.products.length > 0 && (
            <div className='pt-3'>
              <p className='mb-1 t-micro text-ink-2'>{t("nav.search_products")}</p>
              <ul>
                {results.products.map((p) => (
                  <li key={p.id}>
                    <a
                      href={getProductUrl(p)}
                      onClick={onPick}
                      className='flex items-center gap-3 py-2 transition-colors hover:bg-surface-2'>
                      <span className='block h-12 w-10 shrink-0 bg-surface-2'>
                        {p.imageUrl && (
                          <img src={p.imageUrl} alt='' className='h-full w-full object-cover' loading='lazy' decoding='async' />
                        )}
                      </span>
                      <span className='min-w-0 flex-1'>
                        <span className='block truncate t-small text-ink'>{p.name}</span>
                        <Price
                          amount={p.discountPrice ?? p.price}
                          compareAt={p.discountPrice != null ? p.price : null}
                          locale={locale}
                          size='line'
                        />
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {empty && <p className='py-4 t-small text-ink-2'>{t("nav.search_no_results")}</p>}
          <div className='mt-2 border-t border-line pt-2'>
            <button
              type='button'
              onClick={onViewAll}
              className={buttonClass({ variant: "text", size: "sm" })}>
              {t("nav.search_view_all")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
