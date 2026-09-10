import { Home, ShoppingBag, Heart, Tag, ShoppingCart } from "lucide-react";
import { usePageContext } from "vike-react/usePageContext";
import { Link } from "#root/components/utils/Link";
import { useCart } from "#root/lib/context/CartContext";
import { useWishlist } from "#root/lib/hooks/useWishlist";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { cn } from "#root/lib/utils";

const HIDDEN_PATHS = ["/checkout"];

/**
 * Sticky bottom nav bar for the minimal template, mobile only.
 * Order per client spec: Home - Shop - Wishlist - Offers - Cart.
 */
export function MinimalMobileBottomNav() {
  const { urlPathname } = usePageContext();
  const { t } = useMinimalI18n();
  const { totalItems, appliedOffers } = useCart();
  const { items: wishlistItems } = useWishlist();

  // At least one offer is currently active on the cart — nudge the user
  // toward the Offers tab with a pulsing dot instead of a count.
  const hasActiveOffer = appliedOffers.length > 0;

  const tabs = [
    { key: "home", label: t("nav.home"), href: "/", icon: Home },
    { key: "shop", label: t("nav.shop"), href: "/shop", icon: ShoppingBag },
    {
      key: "wishlist",
      label: t("nav.wishlist"),
      href: "/account?tab=wishlist",
      icon: Heart,
      count: wishlistItems.length,
    },
    {
      key: "offers",
      label: t("nav.offers"),
      href: "/offers",
      icon: Tag,
      dot: hasActiveOffer,
    },
    {
      key: "cart",
      label: t("nav.cart"),
      href: "/cart",
      icon: ShoppingCart,
      count: totalItems,
    },
  ];

  if (HIDDEN_PATHS.some((p) => urlPathname.startsWith(p))) return null;

  const isActive = (href: string) => {
    if (href === "/") return urlPathname === "/";
    return urlPathname.startsWith(href.split("?")[0] ?? href);
  };

  return (
    <nav
      className='lg:hidden fixed bottom-0 inset-x-0 h-16 z-[9995] bg-white border-t border-gray-200'
      aria-label='Bottom navigation'>
      <div className='grid grid-cols-5 h-full'>
        {tabs.map(({ key, label, href, icon: Icon, count, dot }) => {
          const active = isActive(href);
          return (
            <Link
              key={key}
              href={href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 h-full relative",
                active ? "text-gray-900" : "text-gray-400",
              )}>
              <span className='relative'>
                <Icon className='w-5 h-5' strokeWidth={active ? 2.25 : 1.75} />
                {typeof count === "number" && count > 0 && (
                  <span className='absolute -top-1.5 -end-2 min-w-[16px] h-4 px-1 rounded-full bg-gray-900 text-white text-[9px] font-medium flex items-center justify-center'>
                    {count > 99 ? "99+" : count}
                  </span>
                )}
                {dot && (
                  <span className='absolute -top-0.5 -end-0.5 flex h-2.5 w-2.5'>
                    <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75' />
                    <span className='relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500' />
                  </span>
                )}
              </span>
              <span className='text-[10px] font-medium tracking-wide'>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
