import type React from "react";
import { useState, useRef, useCallback, useEffect } from "react";
import { VariantSelector } from "#root/components/shop/VariantSelector";
import { Button } from "#root/components/ui/button";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "#root/components/ui/accordion";
import type {
  ProductPageProduct,
  ProductImage,
} from "./ProductPageModernSplit";
import type { FeaturedProduct } from "../home/HomeFeaturedProducts";
import type { CategoryProductGroup } from "#root/pages/featured/products/@productId/+Page";
import { showCartToast, flyToCart } from "#root/components/ui/cart-toast";
import {
  ShoppingCart,
  Heart,
  Star,
  StarHalf,
  Plus,
  Minus,
  Share2,
  Facebook,
  Twitter,
  Link as LinkIcon,
  Mail,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Eye,
} from "lucide-react";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { useCart } from "#root/lib/context/CartContext";
import { useTracking } from "#root/frontend/contexts/TrackingContext";
import { trackAddToCartEvent } from "#root/frontend/tracking/add-to-cart-event";
import { useLayoutSettings } from "#root/frontend/contexts/LayoutSettingsContext";
import { Link } from "#root/components/utils/Link";
import { getProductUrl } from "#root/lib/utils/route-helpers";
import { STORE_CURRENCY } from "#root/shared/config/branding";
import { trpc } from "#root/shared/trpc/client";
import { toast } from "sonner";
import { useWishlist } from "#root/lib/hooks/useWishlist";
import { cn } from "#root/lib/utils";
import { getStoreOwnerId } from "#root/shared/config/store";
import type { HomepageContent } from "#root/shared/types/homepage-content";
import { navigate } from "vike/client/router";

/* ═══════════════════════════════════════════════════════════════════
   Props
   ═══════════════════════════════════════════════════════════════════ */

export interface ProductPageMinimalProps {
  product?: ProductPageProduct;
  relatedProducts?: FeaturedProduct[];
  categoryGroups?: CategoryProductGroup[];
  allProducts?: FeaturedProduct[];
  showWishlist?: boolean;
  showSocialShare?: boolean;
  isLoading?: boolean;
  onAddToCart?: (
    product: ProductPageProduct,
    selectedOptions?: Record<string, string>,
  ) => void;
  onAddToWishlist?: (product: ProductPageProduct) => void;
  onImageClick?: (imageUrl: string, index: number) => void;
  className?: string;
}

/* ═══════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════ */

export function ProductPageMinimal({
  product,
  relatedProducts,
  categoryGroups,
  allProducts,
  showWishlist = true,
  isLoading = false,
  onAddToCart,
  onAddToWishlist,
  onImageClick,
  className = "",
}: ProductPageMinimalProps) {
  const { toggle: toggleWishlist, isWishlisted } = useWishlist();
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [selectedAddOns, setSelectedAddOns] = useState<Set<string>>(new Set());
  const [selectedVariants, setSelectedVariants] = useState<
    Record<string, string>
  >({});
  const mainImageRef = useRef<HTMLImageElement>(null);
  const addToCartBtnRef = useRef<HTMLButtonElement>(null);
  const { t, locale } = useMinimalI18n();
  const [pageContent, setPageContent] = useState<{
    shippingText?: string;
    shippingTextAr?: string;
    returnsText?: string;
    returnsTextAr?: string;
    faqs?: Array<{ question: string; questionAr?: string; answer: string; answerAr?: string }>;
  } | null>(null);

  useEffect(() => {
    trpc.settings.getProductPageContent
      .query()
      .then((res) => {
        if (res.success) setPageContent(res.result);
      })
      .catch(() => {
        /* fall back to defaults below */
      });
  }, []);
  const isAr = locale === "ar";
  // Admin-authored policy copy, locale-aware. Empty string when nothing has
  // been published — the matching accordion item is then not rendered at all
  // rather than falling back to an invented promise.
  const shippingCopy = (
    isAr
      ? pageContent?.shippingTextAr || pageContent?.shippingText
      : pageContent?.shippingText
  )?.trim();
  const returnsCopy = (
    isAr
      ? pageContent?.returnsTextAr || pageContent?.returnsText
      : pageContent?.returnsText
  )?.trim();
  const layoutSettings = useLayoutSettings();
  const { addItem, items: cartItems } = useCart();
  const { trackEvent } = useTracking();

  /* ── CMS carousel title ── */
  const [carouselTitle, setCarouselTitle] = useState("");
  /** Strikethrough map: variantName → values that should show line-through */
  const [strikethroughMap, setStrikethroughMap] = useState<Record<string, string[]>>({});

  /* ── Sticky Add to Cart bar: shows once the main Add to Cart button scrolls out of view ── */
  const [showStickyCart, setShowStickyCart] = useState(false);
  useEffect(() => {
    const btn = addToCartBtnRef.current;
    if (!btn) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setShowStickyCart(!entry.isIntersecting);
      },
      { threshold: 0 },
    );
    observer.observe(btn);
    return () => observer.disconnect();
  }, [product?.id]);
  const cartQtyForProduct =
    cartItems.find((i) => i.id === product?.id)?.quantity ?? 0;

  useEffect(() => {
    const merchantId = getStoreOwnerId();
    trpc.homepage.getContent
      .query({ merchantId, templateId: "landing-minimal" })
      .then((res) => {
        if (res.success && res.result) {
          const c = res.result as HomepageContent;
          const title = isAr
            ? (c.productCarouselTitleAr || c.productCarouselTitle || "")
            : (c.productCarouselTitle || "");
          setCarouselTitle(title);
        }
      })
      .catch(() => {});
  }, [isAr]);

  /* ── Fetch variant presets for auto-select defaults + strikethrough ── */
  useEffect(() => {
    if (!product?.variants?.length) return;
    trpc.settings.getVariantPresets
      .query()
      .then((res) => {
        if (!res.success || !Array.isArray(res.result)) return;
        const presets = res.result as unknown as Array<{
          id: string;
          name: string;
          values: string[];
          defaultValue?: string;
          strikethroughValues?: string[];
        }>;

        // Build strikethrough map from presets
        const stMap: Record<string, string[]> = {};
        for (const preset of presets) {
          if (preset.strikethroughValues?.length) {
            stMap[preset.name] = preset.strikethroughValues;
          }
        }

        // Apply product-level overrides — remove values the admin has explicitly
        // un-strikethrough'd on this specific product
        for (const variant of product.variants || []) {
          const currentValues = stMap[variant.name];
          if (!currentValues) continue;
          const overriddenValues = variant.values
            .filter((v) => v.enabledOverride === true)
            .map((v) => v.value);
          if (overriddenValues.length > 0) {
            const filtered = currentValues.filter(
              (sv) => !overriddenValues.includes(sv),
            );
            if (filtered.length === 0) {
              delete stMap[variant.name];
            } else {
              stMap[variant.name] = filtered;
            }
          }
        }

        setStrikethroughMap(stMap);

        // Auto-select default values (only if not already selected)
        setSelectedVariants((prev) => {
          const updated = { ...prev };
          for (const variant of product.variants || []) {
            if (!updated[variant.name]) {
              const preset = presets.find(
                (p) => p.name.toLowerCase() === variant.name.toLowerCase(),
              );
              const valueStrings = variant.values.map((v) => v.value);
              if (preset?.defaultValue && valueStrings.includes(preset.defaultValue)) {
                updated[variant.name] = preset.defaultValue;
              }
            }
          }
          return updated;
        });
      })
      .catch(() => {});
  }, [product?.variants]);

  /* ── "Style It With" products ──
     Strictly the products the admin hand-picked for this product. When the
     admin hasn't picked any, the section is hidden — no placeholder copy and
     no automatic category suggestions standing in for a real pick.
     `bestLayeredWith` is the legacy field name kept for schema compatibility;
     the customer-facing label is "Style It With". */
  const styleItWithProducts: FeaturedProduct[] = product?.bestLayeredWith ?? [];

  const toggleAddOn = useCallback((productId: string) => {
    setSelectedAddOns((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }, []);

  /* ── Loading skeleton ── */
  if (isLoading || !product) {
    return (
      <div className={`min-h-screen bg-zeli-bg ${className}`}>
        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'>
          <div className='flex gap-2 mb-8'>
            <div className='h-4 w-12 bg-zeli-surface animate-pulse' />
            <div className='h-4 w-4 bg-zeli-surface animate-pulse' />
            <div className='h-4 w-12 bg-zeli-surface animate-pulse' />
            <div className='h-4 w-4 bg-zeli-surface animate-pulse' />
            <div className='h-4 w-32 bg-zeli-surface animate-pulse' />
          </div>
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-12'>
            <div className='aspect-square bg-zeli-surface animate-pulse' />
            <div className='space-y-6 pt-4'>
              <div className='h-8 w-3/4 bg-zeli-surface animate-pulse' />
              <div className='h-6 w-1/4 bg-zeli-surface animate-pulse' />
              <div className='h-4 w-full bg-zeli-surface animate-pulse' />
              <div className='h-4 w-5/6 bg-zeli-surface animate-pulse' />
              <div className='h-12 w-full bg-zeli-surface animate-pulse mt-8' />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const wishlisted = isWishlisted(product.id);
  const maxQty = Math.min(product.stock || 99, 99);
  const incrementQty = () => setQuantity((q) => Math.min(q + 1, maxQty));
  const decrementQty = () => setQuantity((q) => Math.max(q - 1, 1));

  const images = product.images || [
    { url: product.imageUrl || "", isPrimary: true },
  ];
  const hasDiscount =
    product.discountPrice &&
    typeof product.discountPrice === "number" &&
    product.discountPrice < product.price;

  const allVariantsSelected =
    !product.variants?.length ||
    product.variants.every((v) => selectedVariants[v.name]);

  // Compute display price including selected variant modifiers
  const displayPrice = (() => {
    const base = hasDiscount ? (product.discountPrice as number) : product.price;
    const modifierSum = (product.variants ?? []).reduce((sum, variant) => {
      const selectedValue = selectedVariants[variant.name];
      if (!selectedValue) return sum;
      const option = variant.values.find((v) => v.value === selectedValue);
      return sum + (option?.priceModifier ?? 0);
    }, 0);
    return base + modifierSum;
  })();

  const addProductToCart = (): boolean => {
    if (!product?.available) return false;

    const success = addItem(
      {
        id: product.id,
        name: product.name,
        price: displayPrice,
        stock: product.stock,
        imageUrl: product.imageUrl,
        categoryName: product.categoryName ?? undefined,
        available: product.available,
      },
      quantity,
      selectedVariants,
    );

    if (success) {
      trackAddToCartEvent(trackEvent, {
        id: product.id,
        name: product.name,
        price: displayPrice,
        quantity,
        categoryName: product.categoryName,
      });
    }

    // Also add selected add-on products from inline carousels
    if (selectedAddOns.size > 0) {
      const allCategoryProducts = [
        ...styleItWithProducts,
        ...(categoryGroups?.flatMap((g) => g.products) ?? []),
      ];
      for (const addOnId of selectedAddOns) {
        const addOn = allCategoryProducts.find((p) => p.id === addOnId);
        if (addOn) {
          const addOnPrice =
            addOn.discountPrice != null &&
            Number(addOn.discountPrice) < addOn.price
              ? Number(addOn.discountPrice)
              : addOn.price;
          const addOnSuccess = addItem(
            {
              id: addOn.id,
              name: addOn.name,
              price: addOnPrice,
              stock: addOn.stock || 99,
              imageUrl: addOn.imageUrl,
              categoryName: addOn.categoryName || undefined,
              available: (addOn.stock || 0) > 0,
            },
            1,
            {},
          );
          if (addOnSuccess) {
            trackAddToCartEvent(trackEvent, {
              id: addOn.id,
              name: addOn.name,
              price: addOnPrice,
              categoryName: addOn.categoryName,
            });
          }
        }
      }
      setSelectedAddOns(new Set());
    }

    showCartToast({
      name: product.name,
      price: displayPrice,
      imageUrl: product.imageUrl || "",
    });

    return true;
  };

  const handleAddToCart = () => {
    if (!product?.available) return;

    flyToCart(
      addToCartBtnRef.current,
      images[selectedImage]?.url || product.imageUrl || "",
    );

    addProductToCart();
  };

  const handleBuyNow = () => {
    if (!product?.available || !allVariantsSelected) return;

    const success = addProductToCart();
    if (success) {
      navigate("/checkout");
    }
  };

  const handleImageClick = (index: number) => {
    setSelectedImage(index);
    if (onImageClick) {
      onImageClick(images[index]?.url || "", index);
    }
  };

  // Bottom carousel: use allProducts or fall back to relatedProducts
  const bottomCarouselProducts = (
    allProducts && allProducts.length > 0 ? allProducts : relatedProducts || []
  ).filter((p) => p.id !== product.id);

  return (
    <div className={`product-page-minimal bg-zeli-bg ${className}`}>
      {/* ═══════════════════════════════════════════════
          BREADCRUMB
          ═══════════════════════════════════════════════ */}
      <div className='border-b border-zeli-line py-4 px-4 sm:px-6 lg:px-8'>
        <div className='max-w-7xl mx-auto'>
          <nav className='text-sm text-zeli-ink-muted font-light'>
            <a href='/' className='hover:text-zeli-ink'>
              {t("product.home")}
            </a>
            <span className='mx-2 text-zeli-ink-subtle'>&gt;</span>
            {product.categoryName && (
              <>
                <a href='/shop' className='hover:text-zeli-ink'>
                  {product.categoryName}
                </a>
                <span className='mx-2 text-zeli-ink-subtle'>&gt;</span>
              </>
            )}
            <a href='/shop' className='hover:text-zeli-ink'>
              {t("product.shop")}
            </a>
            <span className='mx-2 text-zeli-ink-subtle'>&gt;</span>
            <span className='text-zeli-ink'>{product.name}</span>
          </nav>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          MAIN CONTENT — Two-column split on desktop
          ═══════════════════════════════════════════════ */}
      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12'>
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12'>
          {/* ── COLUMN 1: Image Gallery ── */}
          <div className='flex gap-3'>
            {/* Vertical thumbnails strip (desktop) */}
            {images.length > 1 && (
              <div className='hidden sm:flex flex-col gap-2 w-20 flex-shrink-0'>
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleImageClick(idx)}
                    className={`aspect-square overflow-hidden border-2 transition-all ${
                      idx === selectedImage
                        ? "border-zeli-ink opacity-100"
                        : "border-transparent opacity-50 hover:opacity-80"
                    }`}>
                    <img
                      src={img.url}
                      alt={`${product.name} view ${idx + 1}`}
                      className='w-full h-full object-cover'
                      loading='lazy'
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Main large image */}
            <div className='flex-1'>
              <div className='overflow-hidden bg-zeli-surface relative'>
                {product.available && (
                  <span className='absolute top-3 start-3 z-10 bg-zeli-accent text-zeli-ink-inverse text-xs font-medium px-3 py-1'>
                    {t("new") || "New"}
                  </span>
                )}
                <img
                  ref={mainImageRef}
                  src={images[selectedImage]?.url || product.imageUrl}
                  alt={product.name}
                  className='w-full h-auto object-contain'
                />
              </div>

              {/* Mobile thumbnails (horizontal) */}
              {images.length > 1 && (
                <div className='flex sm:hidden gap-2 mt-3 overflow-x-auto'>
                  {images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleImageClick(idx)}
                      className={`w-16 h-16 flex-shrink-0 overflow-hidden border-2 transition-all ${
                        idx === selectedImage
                          ? "border-zeli-ink opacity-100"
                          : "border-transparent opacity-50 hover:opacity-80"
                      }`}>
                      <img
                        src={img.url}
                        alt={`View ${idx + 1}`}
                        className='w-full h-full object-cover'
                        loading='lazy'
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── COLUMN 2: Product Info + Inline Carousels ── */}
          <div className='space-y-3'>
            {/* Product Name + Share/Wishlist on same row */}
            <div className='flex items-start gap-2'>
              <h1 className='flex-1 text-xl lg:text-2xl font-medium text-zeli-ink leading-tight'>
                {product.name}
              </h1>
              <div className='flex items-center gap-1.5 flex-shrink-0 pt-0.5'>
                <button
                  onClick={() => setShowShareMenu(!showShareMenu)}
                  className='w-7 h-7 flex items-center justify-center border border-zeli-line hover:border-zeli-ink transition-colors'
                  aria-label={t("product.share")}>
                  <Share2 className='w-3 h-3 text-zeli-ink-secondary' />
                </button>
                {showWishlist && (
                  <button
                    type='button'
                    onClick={() => toggleWishlist(product.id)}
                    className={cn(
                      "w-9 h-9 flex items-center justify-center rounded-full shadow-md transition-colors",
                      wishlisted
                        ? "bg-zeli-blush-soft text-zeli-sale hover:bg-zeli-blush"
                        : "bg-zeli-surface-raised text-zeli-ink-secondary hover:bg-zeli-surface",
                    )}
                    aria-label={
                      wishlisted ? t("removed_from_wishlist") : t("added_to_wishlist")
                    }>
                    <Heart
                      className={cn("w-4 h-4", wishlisted && "fill-current")}
                    />
                  </button>
                )}
              </div>
            </div>

            {/* Share menu dropdown */}
            {showShareMenu && (
              <div className='flex items-center gap-2 pb-1'>
                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}`}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='w-7 h-7 flex items-center justify-center border border-zeli-line hover:border-zeli-ink hover:bg-zeli-accent-hover hover:text-zeli-ink-inverse transition-colors'
                  aria-label='Share on Facebook'>
                  <Facebook className='w-3 h-3' />
                </a>
                <a
                  href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}&text=${encodeURIComponent(product.name)}`}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='w-7 h-7 flex items-center justify-center border border-zeli-line hover:border-zeli-ink hover:bg-zeli-accent-hover hover:text-zeli-ink-inverse transition-colors'
                  aria-label='Share on Twitter'>
                  <Twitter className='w-3 h-3' />
                </a>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(product.name + " " + (typeof window !== "undefined" ? window.location.href : ""))}`}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='w-7 h-7 flex items-center justify-center border border-zeli-line hover:border-zeli-ink hover:bg-zeli-accent-hover hover:text-zeli-ink-inverse transition-colors'
                  aria-label='Share on WhatsApp'>
                  <svg
                    className='w-3 h-3'
                    viewBox='0 0 24 24'
                    fill='currentColor'>
                    <path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z' />
                  </svg>
                </a>
                <button
                  onClick={() => {
                    if (typeof navigator !== "undefined")
                      navigator.clipboard.writeText(window.location.href);
                  }}
                  className='w-7 h-7 flex items-center justify-center border border-zeli-line hover:border-zeli-ink hover:bg-zeli-accent-hover hover:text-zeli-ink-inverse transition-colors'
                  aria-label='Copy link'>
                  <LinkIcon className='w-3 h-3' />
                </button>
              </div>
            )}

            {/* Star Rating — clickable, scrolls to reviews & opens form */}
            <button
              type='button'
              className='cursor-pointer hover:opacity-80 transition-opacity'
              onClick={() => {
                document.getElementById("product-reviews-section")?.scrollIntoView({ behavior: "smooth" });
                setTimeout(() => window.dispatchEvent(new CustomEvent("open-review-form")), 400);
              }}
            >
              <MinimalStarRating
                rating={product.rating ?? 0}
                count={product.reviewCount}
              />
            </button>

            {/* Price */}
            <div>
              {hasDiscount ? (
                <div className='flex items-baseline gap-2'>
                  <span className='text-lg font-semibold text-zeli-ink'>
                    {(product.discountPrice as number).toFixed(2)}{" "}
                    {STORE_CURRENCY}
                  </span>
                  <span className='text-sm text-zeli-ink-muted line-through'>
                    {product.price.toFixed(2)} {STORE_CURRENCY}
                  </span>
                </div>
              ) : (
                <span className='text-lg font-semibold text-zeli-ink'>
                  {product.price.toFixed(2)} {STORE_CURRENCY}
                </span>
              )}
              {/* <p className='text-[10px] text-zeli-ink-muted mt-0.5'>
                {t("price_includes_tax")}
              </p> */}
            </div>

            {/* Stock status */}
            {product.available ? (
              <p className='text-sm text-zeli-success font-bold flex items-center gap-1'>
                <Check className='w-4 h-4' />
                {t("in_stock")}
              </p>
            ) : (
              <p className='text-sm text-zeli-sale font-bold'>
                {t("out_of_stock")}
              </p>
            )}

            {/* ── Promo text line (CMS-driven) ── */}
            {/* {(() => {
              const promoText =
                isAr && layoutSettings.header.promoTextAr
                  ? layoutSettings.header.promoTextAr
                  : layoutSettings.header.promoText;
              return promoText ? (
                <p className='text-xs font-medium'>{promoText}</p>
              ) : null;
            })()} */}

            {/* Variant Selector + Quantity stepper + Add to Cart + Buy Now */}
            <div className='pt-2 border-t border-zeli-line space-y-3'>
              {/* Variant Selector */}
              {product.variants && product.variants.length > 0 && (
                <VariantSelector
                  variants={product.variants}
                  selectedVariants={selectedVariants}
                  onVariantChange={(name, value) =>
                    setSelectedVariants((prev) => ({ ...prev, [name]: value }))
                  }
                  strikethroughMap={strikethroughMap}
                />
              )}

              {/* Quantity stepper + Add to Cart, side by side */}
              <div className='flex items-stretch gap-2'>
                {product.available && (
                  <div className='flex items-center border border-zeli-line-strong rounded-md shrink-0 overflow-hidden'>
                    <button
                      onClick={decrementQty}
                      disabled={quantity <= 1}
                      className='w-9 h-11 flex items-center justify-center hover:bg-zeli-surface disabled:opacity-30 transition-colors'
                      aria-label='Decrease quantity'>
                      <Minus className='w-3.5 h-3.5' />
                    </button>
                    <span className='w-8 h-11 flex items-center justify-center text-sm font-medium tabular-nums'>
                      {quantity}
                    </span>
                    <button
                      onClick={incrementQty}
                      disabled={quantity >= maxQty}
                      className='w-9 h-11 flex items-center justify-center hover:bg-zeli-surface disabled:opacity-30 transition-colors'
                      aria-label='Increase quantity'>
                      <Plus className='w-3.5 h-3.5' />
                    </button>
                  </div>
                )}
                <Button
                  ref={addToCartBtnRef}
                  size='lg'
                  variant='outline'
                  className='flex-1 border-zeli-ink text-zeli-ink hover:bg-zeli-surface rounded-md h-11 py-0 text-sm font-medium shadow-none transition-all gap-2'
                  onClick={handleAddToCart}
                  disabled={!product.available || !allVariantsSelected}
                  data-add-to-cart='true'>
                  <ShoppingCart className='w-4 h-4' />
                  {product.available ? t("add_to_cart") : t("out_of_stock")}
                </Button>
              </div>

              {/* Buy Now — skips the cart, goes straight to checkout */}
              {product.available && (
                <Button
                  size='lg'
                  className='w-full bg-zeli-accent hover:bg-zeli-accent-hover text-zeli-ink-inverse rounded-md py-4 text-sm font-semibold shadow-none hover:shadow-lg transition-all'
                  onClick={handleBuyNow}
                  disabled={!allVariantsSelected}
                  data-buy-now='true'>
                  {t("buy_now")}
                </Button>
              )}
            </div>

            {/* ── Product info accordion: About / Shipping / Returns / FAQs / Details / Style It With ── */}
            <Accordion type='single' collapsible defaultValue='about' className='pt-2 border-t border-zeli-line'>
              {(() => {
                // Legacy `fragranceInfo` may still exist on records carried
                // over from the previous fragrance storefront. ZELI does not
                // render any of it — the generic description is the source of
                // truth for this section.
                const hasAbout = Boolean(product.description);

                return (
                  <>
                    {hasAbout && (
                      <AccordionItem value='about'>
                        <AccordionTrigger className='text-base font-bold'>{isAr ? "عن المنتج" : "About"}</AccordionTrigger>
                        <AccordionContent>
                          <div className='bg-zeli-surface p-4 space-y-3'>
                            {product.description && (
                              <ColoredDescription
                                text={product.description}
                                className='text-sm text-zeli-ink font-medium leading-relaxed whitespace-pre-line'
                              />
                            )}
                            {product.longDescription && (
                              <ExpandableText text={product.longDescription} />
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )}

                    {/* Shipping / Returns — admin-authored only. These two
                        items used to fall back to "Free shipping with 2+
                        items." and "Free exchanges for all orders."
                        (and their Arabic equivalents) whenever the CMS was
                        empty, i.e. on a store that had never set a policy.
                        Each item now renders only when real copy exists. */}
                    {shippingCopy && (
                      <AccordionItem value='shipping'>
                        <AccordionTrigger className='text-base font-bold'>{isAr ? "الشحن" : "Shipping"}</AccordionTrigger>
                        <AccordionContent>
                          <p className='text-sm text-zeli-ink-secondary font-medium whitespace-pre-line'>
                            {shippingCopy}
                          </p>
                        </AccordionContent>
                      </AccordionItem>
                    )}

                    {returnsCopy && (
                      <AccordionItem value='returns'>
                        <AccordionTrigger className='text-base font-bold'>{isAr ? "الإرجاع" : "Returns"}</AccordionTrigger>
                        <AccordionContent>
                          <p className='text-sm text-zeli-ink-secondary font-medium whitespace-pre-line'>
                            {returnsCopy}
                          </p>
                        </AccordionContent>
                      </AccordionItem>
                    )}

                    {(pageContent?.faqs?.length ?? 0) > 0 && (
                    <AccordionItem value='faqs'>
                      <AccordionTrigger className='text-base font-bold'>{isAr ? "الأسئلة الشائعة" : "FAQs"}</AccordionTrigger>
                      <AccordionContent>
                        <div className='space-y-3'>
                          {(pageContent?.faqs ?? []).map((faq, idx) => (
                            <div key={idx}>
                              <p className='text-sm font-bold text-zeli-ink'>
                                {isAr ? faq.questionAr || faq.question : faq.question}
                              </p>
                              <p className='text-sm text-zeli-ink-secondary font-medium mt-0.5 whitespace-pre-line'>
                                {isAr ? faq.answerAr || faq.answer : faq.answer}
                              </p>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                    )}

                    {product.specifications && product.specifications.length > 0 && (
                      <AccordionItem value='details'>
                        <AccordionTrigger className='text-base font-bold'>{isAr ? "التفاصيل" : "Details"}</AccordionTrigger>
                        <AccordionContent>
                          <div className='space-y-1'>
                            {product.specifications.map((spec, idx) => (
                              <div
                                key={idx}
                                className='flex justify-between items-baseline py-1 border-b border-zeli-line last:border-0'>
                                <span className='text-sm font-semibold text-zeli-ink-secondary'>{spec.label}</span>
                                <span className='text-sm text-zeli-ink font-bold'>{spec.value}</span>
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )}

                    {/* Renders only when the admin has hand-picked real
                        products to pair with. It used to render
                        unconditionally and, with nothing to show, told the
                        shopper to "Stay tuned for our recommended layering
                        combination.." — an empty section promising future
                        content, sitting inside the product information a
                        buyer is reading to decide. */}
                    {styleItWithProducts.length > 0 && (
                      <AccordionItem value='style-it-with'>
                        <AccordionTrigger className='text-base font-bold'>
                          {isAr ? "نسقيه مع" : "Style It With"}
                        </AccordionTrigger>
                        <AccordionContent>
                          <InlineCategoryCarousel
                            title={
                              carouselTitle ||
                              (isAr ? "منتجات أخرى" : "More Products")
                            }
                            products={styleItWithProducts}
                            currentProductId={product.id}
                            selectedIds={selectedAddOns}
                            onToggle={toggleAddOn}
                          />
                        </AccordionContent>
                      </AccordionItem>
                    )}
                  </>
                );
              })()}
            </Accordion>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          STICKY ADD TO CART BAR
          Appears once the main Add to Cart button scrolls out of view.
          ═══════════════════════════════════════════════ */}
      {product.available && (
        <div
          style={{
            // `bottom-15` is 3.75rem; the fixed mobile bottom nav is h-16
            // (4rem) plus the safe-area inset, so the bar's lower edge — and
            // its "Add to cart" button with it — sat underneath the nav.
            bottom: "calc(4rem + env(safe-area-inset-bottom))",
            zIndex: "var(--zeli-z-sticky)",
          }}
          className={cn(
            "fixed inset-x-0 border-t border-zeli-line bg-zeli-surface-raised shadow-[0_-2px_10px_rgba(36,29,25,0.06)] transition-transform duration-300 lg:bottom-0",
            showStickyCart ? "translate-y-0" : "translate-y-full",
          )}>
          <div className='max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-2.5 flex items-center gap-2 sm:gap-3'>
            <img
              src={images[selectedImage]?.url || product.imageUrl || ""}
              alt={product.name}
              className='hidden sm:block w-10 h-10 object-cover rounded-sm flex-shrink-0'
            />
            <div className='min-w-0 flex-1'>
              <p className='hidden sm:block text-xs font-medium text-zeli-ink truncate'>
                {product.name}
              </p>
              <div className='flex items-center gap-2'>
                <p className='text-xs sm:text-xs font-semibold sm:font-normal text-zeli-ink sm:text-zeli-ink-secondary whitespace-nowrap'>
                  {displayPrice.toFixed(2)} {STORE_CURRENCY}
                </p>
                {cartQtyForProduct > 0 && (
                  <span className='hidden sm:inline text-[10px] text-zeli-success font-medium'>
                    {isAr ? `${cartQtyForProduct} في السلة` : `${cartQtyForProduct} in cart`}
                  </span>
                )}
              </div>
            </div>
            <Button
              size='sm'
              variant='outline'
              className='border-zeli-ink text-zeli-ink hover:bg-zeli-surface rounded-md px-2.5 sm:px-4 text-xs font-medium shrink-0 gap-0 sm:gap-1.5'
              onClick={handleAddToCart}
              disabled={!allVariantsSelected}
              aria-label={t("add_to_cart")}>
              <ShoppingCart className='w-3.5 h-3.5' />
              <span className='hidden sm:inline'>{t("add_to_cart")}</span>
            </Button>
            <Button
              size='sm'
              className='bg-zeli-accent hover:bg-zeli-accent-hover text-zeli-ink-inverse rounded-md px-2.5 sm:px-4 text-xs font-semibold shrink-0 whitespace-nowrap'
              onClick={handleBuyNow}
              disabled={!allVariantsSelected}>
              {t("buy_now")}
            </Button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════
          REVIEWS SECTION
          ═══════════════════════════════════════════════ */}
      <ProductReviewsSection productId={product.id} />

      {/* ═══════════════════════════════════════════════
          BOTTOM SECTION — "Products you may like" Carousel
          Full-width, separate section
          ═══════════════════════════════════════════════ */}
      {bottomCarouselProducts.length > 0 && (
        <BottomProductsCarousel
          products={bottomCarouselProducts}
          title={t("product.you_may_also_like")}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Product Reviews Section — form + list
   ═══════════════════════════════════════════════════════════════════ */

function ProductReviewsSection({ productId }: { productId: string }) {
  const { t, locale } = useMinimalI18n();
  const isAr = locale === "ar";
  const [reviews, setReviews] = useState<
    {
      id: string;
      userName: string;
      rating: number;
      comment: string;
      createdAt: string;
      imageUrl?: string | null;
    }[]
  >([]);
  const [avgRating, setAvgRating] = useState(0);
  const [totalReviews, setTotalReviews] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formRating, setFormRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [formComment, setFormComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formImagePreview, setFormImagePreview] = useState<string | null>(null);
  const [formImageId, setFormImageId] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFormImagePreview(URL.createObjectURL(selected));
    setUploadingImage(true);
    try {
      const buffer = new Uint8Array(await selected.arrayBuffer());
      const res = await trpc.product.uploadReviewImage.mutate({
        file: { name: selected.name, type: selected.type, buffer },
      });
      if (res.success && res.result) {
        setFormImageId(res.result.id);
      } else {
        toast.error(
          "error" in res && res.error
            ? res.error
            : isAr
              ? "فشل رفع الصورة"
              : "Failed to upload image",
        );
        setFormImagePreview(null);
      }
    } catch {
      toast.error(isAr ? "فشل رفع الصورة" : "Failed to upload image");
      setFormImagePreview(null);
    } finally {
      setUploadingImage(false);
    }
  };

  const fetchReviews = useCallback(() => {
    trpc.product.getReviews
      .query({ productId })
      .then((res) => {
        if (res.success && res.result) {
          setReviews(res.result.reviews as any);
          setAvgRating(res.result.averageRating);
          setTotalReviews(res.result.totalReviews);
        }
      })
      .catch(() => {});
  }, [productId]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  /* Listen for star-click scroll event from the top of the page */
  useEffect(() => {
    const handler = () => setShowForm(true);
    window.addEventListener("open-review-form", handler);
    return () => window.removeEventListener("open-review-form", handler);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || formRating === 0 || !formComment.trim()) {
      toast.error(isAr ? "يرجى تعبئة جميع الحقول" : "Please fill in all fields");
      return;
    }
    setSubmitting(true);
    try {
      const res = await trpc.product.createReview.mutate({
        productId,
        userName: formName.trim(),
        rating: formRating,
        comment: formComment.trim(),
        imageId: formImageId ?? undefined,
      });
      if (res.success) {
        toast.success(
          isAr
            ? "شكراً لتقييمك! سيظهر بعد مراجعته"
            : "Thank you for your review! It'll appear once reviewed.",
        );
        setFormName("");
        setFormRating(0);
        setFormComment("");
        setFormImagePreview(null);
        setFormImageId(null);
        setShowForm(false);
        fetchReviews();
      }
    } catch {
      toast.error(isAr ? "حدث خطأ" : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div id='product-reviews-section' className='max-w-screen-xl mx-auto px-4 sm:px-6 py-12 border-t border-zeli-line'>
      {/* Header */}
      <div className='flex items-center justify-between mb-8'>
        <div>
          <h2 className='text-xl font-medium text-zeli-ink'>
            {isAr ? "التقييمات" : "Reviews"}
          </h2>
          <div className='flex items-center gap-2 mt-1'>
            <MinimalStarRating rating={avgRating} />
            <span className='text-sm text-zeli-ink-muted'>
              {avgRating.toFixed(1)} ({totalReviews})
            </span>
          </div>
        </div>
        <Button
          variant='outline'
          size='sm'
          className='rounded-none border-zeli-ink text-zeli-ink hover:bg-zeli-accent-hover hover:text-zeli-ink-inverse transition-colors'
          onClick={() => setShowForm(!showForm)}>
          {showForm
            ? (isAr ? "إلغاء" : "Cancel")
            : (isAr ? "أضف تقييم" : "Write a Review")}
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className='mb-10 space-y-4 max-w-lg'>
          <div>
            <label className='block text-sm text-zeli-ink-secondary mb-1'>
              {isAr ? "الاسم" : "Your Name"}
            </label>
            <input
              type='text'
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              maxLength={50}
              className='w-full px-3 py-2 text-sm border border-zeli-line outline-none focus:border-zeli-ink transition-colors'
              placeholder={isAr ? "أدخل اسمك" : "Enter your name"}
            />
          </div>
          <div>
            <label className='block text-sm text-zeli-ink-secondary mb-1'>
              {isAr ? "التقييم" : "Rating"}
            </label>
            <div className='flex gap-1'>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type='button'
                  onClick={() => setFormRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className='p-0.5 transition-transform hover:scale-110'>
                  <Star
                    className={`w-6 h-6 ${
                      star <= (hoverRating || formRating)
                        ? "fill-current text-zeli-ink"
                        : "text-zeli-ink-subtle"
                    } transition-colors`}
                  />
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className='block text-sm text-zeli-ink-secondary mb-1'>
              {isAr ? "التعليق" : "Comment"}
            </label>
            <textarea
              value={formComment}
              onChange={(e) => setFormComment(e.target.value)}
              maxLength={500}
              rows={3}
              className='w-full px-3 py-2 text-sm border border-zeli-line outline-none focus:border-zeli-ink transition-colors resize-none'
              placeholder={isAr ? "شاركنا رأيك..." : "Share your thoughts..."}
            />
          </div>
          <div>
            <label className='block text-sm text-zeli-ink-secondary mb-1'>
              {isAr ? "صورة (اختياري)" : "Photo (optional)"}
            </label>
            {formImagePreview ? (
              <div className='relative w-20 h-20'>
                <img
                  src={formImagePreview}
                  alt=''
                  className='w-20 h-20 object-cover border border-zeli-line'
                />
                {uploadingImage && (
                  <div className='absolute inset-0 bg-zeli-bg/70 flex items-center justify-center'>
                    <span className='text-[10px] text-zeli-ink-secondary'>
                      {isAr ? "جاري الرفع..." : "Uploading..."}
                    </span>
                  </div>
                )}
                <button
                  type='button'
                  onClick={() => {
                    setFormImagePreview(null);
                    setFormImageId(null);
                  }}
                  className='absolute -top-2 -end-2 w-5 h-5 bg-zeli-accent text-zeli-ink-inverse rounded-full flex items-center justify-center'
                  aria-label='Remove image'>
                  <X className='w-3 h-3' />
                </button>
              </div>
            ) : (
              <input
                type='file'
                accept='image/jpeg,image/png,image/webp'
                onChange={handleImageSelect}
                className='text-xs text-zeli-ink-secondary'
              />
            )}
          </div>
          <Button
            type='submit'
            disabled={submitting || uploadingImage}
            className='bg-zeli-accent hover:bg-zeli-accent-hover text-zeli-ink-inverse rounded-none px-8 py-2'>
            {submitting
              ? (isAr ? "جاري الإرسال..." : "Submitting...")
              : (isAr ? "إرسال التقييم" : "Submit Review")}
          </Button>
        </form>
      )}

      {/* Review list */}
      {reviews.length === 0 ? (
        <p className='text-sm text-zeli-ink-muted'>
          {isAr ? "لا توجد تقييمات بعد. كن أول من يقيّم!" : "No reviews yet. Be the first to review!"}
        </p>
      ) : (
        <div className='space-y-6'>
          {reviews.map((review) => (
            <div key={review.id} className='border-b border-zeli-line pb-5'>
              <div className='flex items-center justify-between mb-1'>
                <span className='text-sm font-medium text-zeli-ink'>{review.userName}</span>
                <span className='text-xs text-zeli-ink-muted'>
                  {new Date(review.createdAt).toLocaleDateString(isAr ? "ar-EG" : "en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              <MinimalStarRating rating={review.rating} />
              <p className='text-sm text-zeli-ink-secondary mt-2 leading-relaxed'>{review.comment}</p>
              {review.imageUrl && (
                <img
                  src={review.imageUrl}
                  alt=''
                  className='mt-3 w-20 h-20 object-cover border border-zeli-line'
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Inline Category Carousel (matchperfumes style)
   Compact cards inside the info column
   ═══════════════════════════════════════════════════════════════════ */

function InlineCategoryCarousel({
  title,
  products,
  currentProductId,
  selectedIds,
  onToggle,
}: {
  title: string;
  products: FeaturedProduct[];
  currentProductId: string;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [checkScroll, products]);

  const scroll = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction === "right" ? 200 : -200,
      behavior: "smooth",
    });
  };

  const filteredProducts = products.filter((p) => p.id !== currentProductId);
  if (filteredProducts.length === 0) return null;

  return (
    <div>
      <p className='text-sm font-semibold text-zeli-ink mb-3'>{title}</p>
      <div className='relative group/carousel'>
        <button
          onClick={() => scroll("left")}
          disabled={!canScrollLeft}
          className='absolute -start-2 top-1/2 -translate-y-1/2 z-10 hidden md:flex w-7 h-7 items-center justify-center bg-zeli-surface-raised border border-zeli-line shadow-sm hover:border-zeli-ink disabled:opacity-0 transition-all'
          aria-label='Scroll left'>
          <ChevronLeft className='w-3.5 h-3.5' />
        </button>
        <button
          onClick={() => scroll("right")}
          disabled={!canScrollRight}
          className='absolute -end-2 top-1/2 -translate-y-1/2 z-10 hidden md:flex w-7 h-7 items-center justify-center bg-zeli-surface-raised border border-zeli-line shadow-sm hover:border-zeli-ink disabled:opacity-0 transition-all'
          aria-label='Scroll right'>
          <ChevronRight className='w-3.5 h-3.5' />
        </button>

        <div
          ref={scrollRef}
          className='flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-1'>
          {filteredProducts.map((p) => (
            <InlineProductCard
              key={p.id}
              product={p}
              isSelected={selectedIds.has(p.id)}
              onToggle={() => onToggle(p.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Small inline card for category carousels ── */

function InlineProductCard({
  product,
  isSelected,
  onToggle,
}: {
  product: FeaturedProduct;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const imageUrl = resolveImageUrl(product);
  const hasDiscount =
    product.discountPrice !== undefined &&
    product.discountPrice !== null &&
    Number(product.discountPrice) < product.price;
  const displayPrice = hasDiscount
    ? Number(product.discountPrice)
    : product.price;
  const productUrl = getProductUrl(product);

  return (
    <div
      role='button'
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
      className={`flex-none w-[130px] snap-start border transition-colors bg-zeli-surface-raised p-2 cursor-pointer ${isSelected ? "border-zeli-success ring-1 ring-zeli-success" : "border-zeli-line hover:border-zeli-line-strong"}`}>
      {/* Checkbox */}
      <div
        className={`w-5 h-5 mb-1.5 flex items-center justify-center border-2 transition-all ${isSelected ? "bg-zeli-success border-zeli-success text-zeli-ink-inverse" : "border-zeli-line-strong bg-zeli-surface-raised"}`}
        aria-hidden='true'>
        {isSelected && <Check className='w-3 h-3' />}
      </div>
      <div className='group/card'>
        <div className='aspect-square bg-zeli-surface overflow-hidden mb-2'>
          <img
            src={imageUrl}
            alt={product.name}
            className='w-full h-full object-cover transition-transform duration-300 group-hover/card:scale-105'
            loading='lazy'
          />
        </div>
        <h4 className='text-xs font-medium text-zeli-ink line-clamp-1'>
          {product.name}
        </h4>
        <div className='flex items-center gap-1.5 mt-0.5'>
          {hasDiscount && (
            <span className='text-[10px] text-zeli-ink-muted line-through'>
              {product.price} {STORE_CURRENCY}
            </span>
          )}
          <span
            className={`text-xs font-semibold ${hasDiscount ? "text-zeli-sale" : "text-zeli-ink"}`}>
            {displayPrice} {STORE_CURRENCY}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Bottom Full-Width "Products you may like" Carousel
   Large cards with hover overlays
   ═══════════════════════════════════════════════════════════════════ */

function BottomProductsCarousel({
  products,
  title,
}: {
  products: FeaturedProduct[];
  title: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const { t } = useMinimalI18n();
  const { addItem } = useCart();
  const { trackEvent } = useTracking();

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [checkScroll, products]);

  const scroll = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const card = el.querySelector("[data-bottom-card]");
    const cardWidth = card?.clientWidth ?? 280;
    const gap = 24;
    el.scrollBy({
      left:
        direction === "right" ? (cardWidth + gap) * 2 : -(cardWidth + gap) * 2,
      behavior: "smooth",
    });
  };

  if (products.length === 0) return null;

  return (
    <div className='bg-zeli-surface/50 py-16'>
      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
        <div className='text-center mb-8'>
          <h2 className='text-2xl font-medium text-zeli-ink'>{title}</h2>
          <div className='h-[2px] w-24 bg-zeli-accent mt-2 mx-auto' />
        </div>

        <div className='relative'>
          <button
            onClick={() => scroll("left")}
            disabled={!canScrollLeft}
            className='absolute -left-4 top-1/2 -translate-y-1/2 z-10 hidden md:flex w-10 h-10 items-center justify-center bg-zeli-surface-raised border border-zeli-line shadow-sm text-zeli-ink-secondary hover:text-zeli-ink hover:border-zeli-ink disabled:opacity-0 transition-all rounded-full'
            aria-label='Previous'>
            <ChevronLeft className='w-5 h-5' />
          </button>
          <button
            onClick={() => scroll("right")}
            disabled={!canScrollRight}
            className='absolute -right-4 top-1/2 -translate-y-1/2 z-10 hidden md:flex w-10 h-10 items-center justify-center bg-zeli-surface-raised border border-zeli-line shadow-sm text-zeli-ink-secondary hover:text-zeli-ink hover:border-zeli-ink disabled:opacity-0 transition-all rounded-full'
            aria-label='Next'>
            <ChevronRight className='w-5 h-5' />
          </button>

          {/* Same centred-flex-scroller trap as the homepage category rail:
              `justify-center` on the overflowing element makes the leading
              cards unreachable. Centre the track, not the scroller. */}
          <div
            ref={scrollRef}
            className='overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2'>
            <div className='flex w-max mx-auto gap-6'>
            {products.map((product) => (
              <BottomProductCard
                key={product.id}
                product={product}
                onAddToCart={() => {
                  if (!product.available) return;
                  const price = product.discountPrice
                    ? Number(product.discountPrice)
                    : product.price;
                  const success = addItem(
                    {
                      id: product.id,
                      name: product.name,
                      price,
                      imageUrl: resolveImageUrl(product),
                      stock: product.stock,
                      categoryName: product.categoryName ?? undefined,
                      available: product.available,
                    },
                    1,
                    {},
                  );
                  if (success) {
                    trackAddToCartEvent(trackEvent, {
                      id: product.id,
                      name: product.name,
                      price,
                      categoryName: product.categoryName,
                    });
                  }
                  showCartToast({
                    name: product.name,
                    price,
                    imageUrl: resolveImageUrl(product),
                  });
                }}
              />
            ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Large card for bottom carousel ── */

function BottomProductCard({
  product,
  onAddToCart,
}: {
  product: FeaturedProduct;
  onAddToCart: () => void;
}) {
  const { t } = useMinimalI18n();
  const { toggle, isWishlisted } = useWishlist();
  const imageUrl = resolveImageUrl(product);
  const hasDiscount =
    product.discountPrice !== undefined &&
    product.discountPrice !== null &&
    Number(product.discountPrice) < product.price;
  const displayPrice = hasDiscount
    ? Number(product.discountPrice)
    : product.price;
  const productUrl = getProductUrl(product);
  const wishlisted = isWishlisted(product.id);

  return (
    <div
      data-bottom-card
      className='flex-none w-[240px] sm:w-[260px] snap-start group/bcard'>
      <div className='relative aspect-square bg-zeli-surface overflow-hidden'>
        <Link href={productUrl}>
          <img
            src={imageUrl}
            alt={product.name}
            className='w-full h-full object-cover transition-transform duration-500 group-hover/bcard:scale-105'
            loading='lazy'
          />
        </Link>
        <div className='absolute bottom-3 start-3 flex gap-2 opacity-0 group-hover/bcard:opacity-100 transition-opacity duration-300'>
          <button
            type='button'
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggle(product.id);
            }}
            className={cn(
              "w-9 h-9 flex items-center justify-center rounded-full shadow-md transition-colors",
              wishlisted
                ? "bg-zeli-blush-soft text-zeli-sale hover:bg-zeli-blush"
                : "bg-zeli-surface-raised text-zeli-ink-secondary hover:bg-zeli-surface",
            )}
            aria-label={
              wishlisted ? t("removed_from_wishlist") : t("added_to_wishlist")
            }>
            <Heart className={cn("w-4 h-4", wishlisted && "fill-current")} />
          </button>
          <Link
            href={productUrl}
            className='w-9 h-9 flex items-center justify-center bg-zeli-surface-raised rounded-full shadow-md hover:bg-zeli-accent-hover hover:text-zeli-ink-inverse transition-colors'
            aria-label='View'>
            <Eye className='w-4 h-4' />
          </Link>
        </div>
        {product.available && !hasDiscount && (
          <span className='absolute top-3 start-3 bg-zeli-accent text-zeli-ink-inverse text-[10px] font-semibold px-2 py-0.5'>
            {t("new") || "New"}
          </span>
        )}
        {hasDiscount && (
          <span className='absolute top-3 start-3 bg-zeli-sale text-zeli-ink-inverse text-[10px] font-semibold px-2 py-0.5'>
            {t("sale") || "Sale"}
          </span>
        )}
      </div>

      <div className='pt-3 text-center'>
        <Link href={productUrl}>
          <h3 className='text-sm font-medium text-zeli-ink line-clamp-1 hover:text-zeli-ink-secondary transition-colors'>
            {product.name}
          </h3>
        </Link>
        <div className='flex items-center justify-center gap-2 mt-1'>
          {hasDiscount && (
            <span className='text-xs text-zeli-ink-subtle line-through'>
              {product.price} {STORE_CURRENCY}
            </span>
          )}
          <span
            className={`text-sm font-semibold ${hasDiscount ? "text-zeli-sale" : "text-zeli-ink"}`}>
            {displayPrice} {STORE_CURRENCY}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.preventDefault();
            onAddToCart();
          }}
          disabled={!product.available}
          data-add-to-cart='true'
          className='mt-3 w-full py-2.5 border border-zeli-ink text-zeli-ink text-xs font-medium uppercase tracking-wider hover:bg-zeli-accent-hover hover:text-zeli-ink-inverse transition-colors disabled:border-zeli-line-strong disabled:text-zeli-ink-subtle disabled:cursor-not-allowed disabled:hover:bg-transparent'>
          {product.available ? t("add_to_cart") : t("out_of_stock")}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Expandable Text (Read more / Read less)
   ═══════════════════════════════════════════════════════════════════ */

function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useMinimalI18n();

  return (
    <div className='mt-2'>
      <div
        className={`text-sm text-zeli-ink-secondary leading-relaxed whitespace-pre-line ${!expanded ? "line-clamp-3" : ""}`}>
        {text}
      </div>
      <button
        onClick={() => setExpanded(!expanded)}
        className='text-sm text-zeli-ink underline underline-offset-2 mt-1 hover:text-zeli-ink transition-colors'>
        {expanded
          ? t("read_less") || "Read less"
          : t("read_more") || "Read more"}
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Utility: Resolve image URL from a product
   ═══════════════════════════════════════════════════════════════════ */

function resolveImageUrl(product: FeaturedProduct): string {
  if (product.images && product.images.length > 0) {
    const primary = product.images.find((img) => img.isPrimary);
    const url = (primary || product.images[0])?.url;
    if (!url) return "/assets/placeholder-product.png";
    if (url.startsWith("http") || url.startsWith("/")) return url;
    return `/uploads/${url}`;
  }
  if (!product.imageUrl) return "/assets/placeholder-product.png";
  if (product.imageUrl.startsWith("http") || product.imageUrl.startsWith("/"))
    return product.imageUrl;
  return `/uploads/${product.imageUrl}`;
}

ProductPageMinimal.displayName = "ProductPageMinimal";

/* ═══════════════════════════════════════════════════════════════════
   Colored Description Parser
   Syntax: [color:#hex]colored text[/color]
   ═══════════════════════════════════════════════════════════════════ */

const COLOR_REGEX = /\[color:(#[0-9a-fA-F]{3,8})\]([\s\S]*?)\[\/color\]/g;

function ColoredDescription({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;
  const regex = new RegExp(COLOR_REGEX.source, "g");

  while ((match = regex.exec(text)) !== null) {
    // Plain text before this match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    // Colored span — only allow valid hex colors
    const color = match[1]!;
    const content = match[2]!;
    parts.push(
      <span key={keyIdx++} style={{ color }}>
        {content}
      </span>,
    );
    lastIndex = match.index + match[0].length;
  }
  // Remaining plain text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <p className={className}>{parts}</p>;
}

/* ═══════════════════════════════════════════════════════════════════
   Star Rating Component (Minimal template)
   ═══════════════════════════════════════════════════════════════════ */

function MinimalStarRating({
  rating,
  count,
}: {
  rating: number;
  count?: number;
}) {
  const stars: React.ReactNode[] = [];
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.25;

  for (let i = 0; i < full; i++)
    stars.push(
      <Star
        key={`f${i}`}
        className='h-4 w-4 fill-current text-zeli-ink'
      />,
    );
  if (half)
    stars.push(
      <StarHalf key='h' className='h-4 w-4 fill-current text-zeli-ink' />,
    );
  for (let i = 0; i < 5 - Math.ceil(rating); i++)
    stars.push(<Star key={`e${i}`} className='h-4 w-4 text-zeli-ink-subtle' />);

  return (
    <div className='flex items-center gap-2'>
      <div className='flex gap-0.5'>{stars}</div>
      {count !== undefined && (
        <span className='text-xs text-zeli-ink-muted'>
          {rating.toFixed(1)} ({count})
        </span>
      )}
    </div>
  );
}
