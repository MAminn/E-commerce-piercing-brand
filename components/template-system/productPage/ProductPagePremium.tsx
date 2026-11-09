import type React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import { VariantSelector } from "#root/components/shop/VariantSelector";
import type {
  ProductPageProduct,
  ProductImage,
  ProductPageModernSplitProps,
} from "./ProductPageModernSplit";
import type { FeaturedProduct } from "../home/HomeFeaturedProducts";
import { Heart, X, ChevronLeft, ChevronRight } from "lucide-react";
import { showCartToast } from "#root/components/ui/cart-toast";
import { trpc } from "#root/shared/trpc/client";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { useWishlist } from "#root/lib/hooks/useWishlist";
import { formatMoney } from "#root/shared/pricing/format-money";
import { fillTemplate as fill } from "#root/components/bundles/bundle-ui";
import { cn } from "#root/lib/utils";
import { formatShippingFeeRange } from "#root/shared/config/storefront";
import { productPlacement } from "#root/shared/categories/placements";
import { useStorefrontCategories } from "#root/hooks/useStorefrontCategories";
import { IndexLine } from "#root/components/storefront/IndexLine";
import { FeaturedObject } from "#root/components/storefront/FeaturedObject";
import { ProductDecisionSummary } from "./ProductDecisionSummary";
import { STICKY_BAR_BOTTOM, STICKY_BAR_PADDING_BOTTOM, useFullyUsable } from "../minimal/sticky-bar";
import { Button, ICON_PROPS, IconButton, buttonClass } from "#root/components/storefront/Button";
import { Stepper } from "#root/components/storefront/Stepper";
import { AccordionRow } from "#root/components/storefront/AccordionRow";
import { Price } from "#root/components/storefront/Price";
import { PdpBundleLink } from "#root/components/storefront/promo/PromoLayer";
import {
  MinimalProductCard,
  type MinimalProduct,
} from "#root/components/template-system/minimal/MinimalProductCard";
import {
  resolvePurchasableLinePrice,
  resolveSelectedOptions,
  toPurchasableOptionGroups,
} from "#root/shared/products/options";
import { ProductUpsellBlock } from "#root/components/storefront/upsell/ProductUpsellBlock";
import { PostAddUpsellSheet } from "#root/components/storefront/upsell/PostAddUpsellSheet";
import { useProductUpsells } from "#root/components/storefront/upsell/useProductUpsells";
import type { ProductUpsells } from "#root/components/storefront/upsell/types";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProductPagePremiumProps {
  product?: ProductPageProduct;
  relatedProducts?: FeaturedProduct[];
  showWishlist?: boolean;
  showSocialShare?: boolean;
  /**
   * Returns `false` when the cart refused the add (stock). `void`/`true` is
   * treated as accepted, so a caller that returns nothing behaves as before.
   */
  onAddToCart?: (
    product: ProductPageProduct,
    selectedOptions?: Record<string, string>,
    quantity?: number,
  ) => void | boolean;
  onAddToWishlist?: (product: ProductPageProduct) => void;
  onImageClick?: (imageUrl: string, index: number) => void;
  isLoading?: boolean;
  className?: string;
  /**
   * Upsell recommendations from the server resolver (ported from Mach).
   * Drives the compact block under the purchase controls and the post-add
   * sheet; absent (upsells off, the shipped default) = neither.
   */
  upsells?: ProductUpsells;
}

// ─── Mock / Defaults ────────────────────────────────────────────────────────

const DEFAULT_PRODUCT: ProductPageProduct = {
  id: "product-preview-mock-1",
  name: "Lumière Diamond Pendant",
  price: 2450.0,
  discountPrice: 1960.0,
  stock: 12,
  available: true,
  imageUrl:
    "https://images.unsplash.com/photo-1515562141589-67f0d569b6fc?w=800",
  images: [
    {
      url: "https://images.unsplash.com/photo-1515562141589-67f0d569b6fc?w=800",
      isPrimary: true,
    },
    {
      url: "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800",
    },
    {
      url: "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=800",
    },
    {
      url: "https://images.unsplash.com/photo-1602751584552-8ba73aad10e1?w=800",
    },
  ],
  description:
    "A timeless pendant featuring a brilliant-cut diamond set in 18k white gold. The delicate chain complements the stone's natural radiance.",
  longDescription:
    "Handcrafted by our master jewelers, the Lumière pendant embodies refined elegance. Each stone is hand-selected for its exceptional brilliance, clarity, and fire. The 18k white gold setting is designed to maximize light entry.\n\nThe pendant hangs from an adjustable 16–18 inch cable chain with a secure lobster clasp. Every piece comes with a certificate of authenticity and is presented in our signature velvet box.",
  rating: 4.8,
  reviewCount: 47,
  sku: "LUM-DP-18WG",
  // No brand on the placeholder product: this object also renders on a live
  // product page for the instant before real data arrives, so it must not
  // claim a brand name of any kind.
  brand: undefined,
  categoryName: "Necklaces",
  specifications: [
    { label: "Metal", value: "18k White Gold" },
    { label: "Stone", value: "Natural Diamond, 0.50ct" },
    { label: "Clarity", value: "VS1" },
    { label: "Chain Length", value: '16–18" adjustable' },
    { label: "Weight", value: "3.2g" },
  ],
  features: [],
};

// ─── Fullscreen Lightbox ────────────────────────────────────────────────────

function Lightbox({
  images,
  startIndex,
  productName,
  onClose,
}: {
  images: ProductImage[];
  startIndex: number;
  productName: string;
  onClose: () => void;
}) {
  const { t } = useMinimalI18n();
  const [idx, setIdx] = useState(startIndex);
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const closeRef = useRef<HTMLButtonElement>(null);

  const prev = () => setIdx((i) => (i > 0 ? i - 1 : images.length - 1));
  const next = () => setIdx((i) => (i < images.length - 1 ? i + 1 : 0));

  // Keyboard navigation; focus starts on Close and the page stops scrolling.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") {
        prev();
        setZoomed(false);
      }
      if (e.key === "ArrowRight") {
        next();
        setZoomed(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length, onClose]);

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (zoomed) {
      setZoomed(false);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setOrigin({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
    setZoomed(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!zoomed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setOrigin({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  return (
    <div
      role='dialog'
      aria-modal='true'
      aria-label={productName}
      className='fixed inset-0 flex items-center justify-center bg-bg'
      style={{ zIndex: "calc(var(--perce-z-overlay) + 1)" }}>
      <IconButton ref={closeRef} aria-label={t("product.close_image")} onClick={onClose} className='absolute end-2 top-2 z-20'>
        <X {...ICON_PROPS} />
      </IconButton>

      {images.length > 1 && (
        <>
          <IconButton
            aria-label={t("product.previous_image")}
            onClick={() => {
              prev();
              setZoomed(false);
            }}
            className='absolute start-2 top-1/2 z-20 -translate-y-1/2'>
            <ChevronLeft {...ICON_PROPS} className='rtl:rotate-180' />
          </IconButton>
          <IconButton
            aria-label={t("product.next_image")}
            onClick={() => {
              next();
              setZoomed(false);
            }}
            className='absolute end-2 top-1/2 z-20 -translate-y-1/2'>
            <ChevronRight {...ICON_PROPS} className='rtl:rotate-180' />
          </IconButton>
        </>
      )}

      {/* Image container with zoom */}
      <div
        className={`relative max-h-[86vh] max-w-[88vw] select-none overflow-hidden ${zoomed ? "cursor-zoom-out" : "cursor-zoom-in"}`}
        onClick={handleImageClick}
        onMouseMove={handleMouseMove}>
        <img
          src={images[idx]?.url}
          alt={`${productName} — ${fill(t("product.image_position"), { current: idx + 1, total: images.length })}`}
          draggable={false}
          className='max-h-[86vh] max-w-[88vw] object-contain transition-transform duration-[var(--perce-duration)]'
          style={
            zoomed
              ? {
                  transform: "scale(2.2)",
                  transformOrigin: `${origin.x}% ${origin.y}%`,
                }
              : { transform: "scale(1)" }
          }
        />
      </div>

      {images.length > 1 && (
        <p className='absolute inset-x-0 bottom-4 text-center t-micro tabular-nums text-ink-2' aria-live='polite'>
          {idx + 1} / {images.length}
        </p>
      )}
    </div>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className='min-h-screen bg-bg pb-16 pt-4 lg:pt-6'>
      <div className='perce-container'>
        <div className='mb-4 h-5 w-48 bg-surface-2' />
        <div className='grid grid-cols-1 gap-6 md:grid-cols-12 md:gap-8 lg:gap-12'>
          <div className='md:col-span-7'>
            <div className='-mx-[var(--perce-gutter)] aspect-[4/5] animate-pulse bg-surface-2 md:mx-0' />
          </div>
          <div className='space-y-4 md:col-span-5'>
            <div className='h-8 w-3/4 animate-pulse bg-surface-2' />
            <div className='h-6 w-28 animate-pulse bg-surface-2' />
            <div className='h-px bg-line' />
            <div className='h-11 w-36 animate-pulse bg-surface-2' />
            <div className='h-13 w-full animate-pulse bg-surface-2' />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Galleries ──────────────────────────────────────────────────────────────

/** Phones: a 4:5 swipe gallery with a "1 / 5" index — no dots, no thumbnails. */
function SwipeGallery({
  images,
  productName,
  onOpen,
}: {
  images: ProductImage[];
  productName: string;
  onOpen: (index: number) => void;
}) {
  const { t } = useMinimalI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // scrollLeft is negative in RTL; the slide index is its magnitude.
    setActiveIdx(Math.round(Math.abs(el.scrollLeft) / el.clientWidth));
  }, []);

  return (
    <div className='-mx-[var(--perce-gutter)] md:hidden'>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role='region'
        aria-roledescription='carousel'
        aria-label={t("product.images_label")}
        className='flex snap-x snap-mandatory overflow-x-auto scrollbar-hide'>
        {images.map((img, i) => (
          <button
            key={`${img.url}-${i}`}
            type='button'
            onClick={() => onOpen(i)}
            aria-label={fill(t("product.open_image"), { current: i + 1, total: images.length })}
            className='aspect-[4/5] w-full shrink-0 snap-center bg-surface-2'>
            <img
              src={img.url}
              alt={i === 0 ? productName : ""}
              className='h-full w-full object-cover'
              loading={i === 0 ? "eager" : "lazy"}
              fetchPriority={i === 0 ? "high" : "auto"}
              decoding={i === 0 ? "sync" : "async"}
            />
          </button>
        ))}
      </div>
      {images.length > 1 && (
        <p className='px-[var(--perce-gutter)] pt-2 text-end t-micro tabular-nums text-ink-2'>
          <span aria-hidden='true'>
            {activeIdx + 1} / {images.length}
          </span>
          <span className='sr-only' aria-live='polite'>
            {fill(t("product.image_position"), { current: activeIdx + 1, total: images.length })}
          </span>
        </p>
      )}
    </div>
  );
}

/** From 768px: every photo, 4:5, the first full width and the rest two-up. */
function DesktopGallery({
  images,
  productName,
  onOpen,
}: {
  images: ProductImage[];
  productName: string;
  onOpen: (index: number) => void;
}) {
  const { t } = useMinimalI18n();
  return (
    <div className='hidden grid-cols-2 gap-2 md:grid'>
      {images.map((img, i) => (
        <button
          key={`${img.url}-${i}`}
          type='button'
          onClick={() => onOpen(i)}
          aria-label={fill(t("product.open_image"), { current: i + 1, total: images.length })}
          className={cn("aspect-[4/5] cursor-zoom-in bg-surface-2", i === 0 && "col-span-2")}>
          <img
            src={img.url}
            alt={i === 0 ? productName : ""}
            draggable={false}
            className='h-full w-full object-cover'
            loading={i === 0 ? "eager" : "lazy"}
            decoding='async'
          />
          {i === 0 && <span className='sr-only'>{t("product.click_to_expand")}</span>}
        </button>
      ))}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

/**
 * Product page — Object Index (template id `product-perce`).
 *
 * From 768px: the photographs take 7/12; the information index takes 5/12 and
 * stays in view while they scroll. Phones: a 4:5 swipe gallery, then the
 * index. The index reads, in order: name → price → product facts → options →
 * quantity → Add to bag → service facts → information rows (Description,
 * Specifications, Shipping & returns, Care). Related pieces use the same
 * product card as the listing.
 *
 * Standalone purchase is always available here, whether or not the product
 * also belongs to a Pick Your Set campaign.
 */
export function ProductPagePremium({
  product = DEFAULT_PRODUCT,
  relatedProducts,
  showWishlist = true,
  onAddToCart,
  onAddToWishlist,
  onImageClick,
  isLoading = false,
  className = "",
  upsells,
}: ProductPagePremiumProps) {
  const { t, locale } = useMinimalI18n();
  const upsell = useProductUpsells(upsells);
  const { categories: categoryRows } = useStorefrontCategories();
  const { toggle: toggleWishlist, isWishlisted } = useWishlist();
  // ── Image state
  const images: ProductImage[] = product.images?.length
    ? product.images
    : product.imageUrl
      ? [{ url: product.imageUrl, isPrimary: true }]
      : [];

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);

  // ── Admin-authored shipping/returns copy (Dashboard > Settings).
  // Both stay empty strings until an admin publishes real policy text; the
  // Shipping & Returns row is omitted entirely while they are.
  const [shippingText, setShippingText] = useState("");
  const [returnsText, setReturnsText] = useState("");

  useEffect(() => {
    let cancelled = false;
    trpc.settings.getProductPageContent
      .query()
      .then((res) => {
        if (cancelled || !res.success || !res.result) return;
        const isAr = locale === "ar";
        setShippingText(
          ((isAr && res.result.shippingTextAr) || res.result.shippingText)?.trim() ?? "",
        );
        setReturnsText(
          ((isAr && res.result.returnsTextAr) || res.result.returnsText)?.trim() ?? "",
        );
      })
      .catch(() => {
        // No policy copy available — the section simply stays hidden rather
        // than falling back to a promise nobody agreed to.
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  // ── Sticky Add to bag (below 768px): shown whenever the main button
  // cannot actually be tapped — below the fold, cut off, or scrolled away —
  // and hidden while it is fully usable, so there is always exactly one
  // usable Add to bag and never two at once.
  const addToBagRef = useRef<HTMLButtonElement>(null);
  // Re-observe when the button remounts (skeleton → product, product → product).
  const showSticky = !useFullyUsable(addToBagRef, [product.id, isLoading]);

  // ── Price computation
  const hasDiscount =
    product.discountPrice != null &&
    typeof product.discountPrice === "number" &&
    product.discountPrice < product.price;

  const displayPrice = hasDiscount
    ? Number(product.discountPrice)
    : product.price;
  const moneyLocale = locale === "ar" ? "ar" : "en";

  const [selectedVariants, setSelectedVariants] = useState<
    Record<string, string>
  >({});

  const allVariantsSelected =
    !product.variants?.length ||
    product.variants.every((v) => selectedVariants[v.name]);

  const inStock = product.available && product.stock > 0;
  const canAdd = inStock && allVariantsSelected;
  const wishlisted = isWishlisted(product.id);

  // ── Handlers
  const handleAddToCart = () => {
    if (!canAdd) return;
    // IMPORTANT: invoke parent first so the Meta Pixel `AddToCart` event
    // fires upstream BEFORE the visual toast is shown. The chosen quantity
    // travels with it — it used to be dropped, so the stepper did nothing.
    const accepted = onAddToCart?.(product, selectedVariants, quantity) !== false;
    const addedImage = product.imageUrl || product.images?.[0]?.url || "";

    // The cart has accepted the product. The upsell sheet is the add's
    // confirmation when it has something to offer; otherwise the usual toast
    // exactly as before. Its price line is the chosen configuration's — the
    // same helper the cart line and checkout use.
    const resolved = resolveSelectedOptions(
      toPurchasableOptionGroups(product.variants ?? []),
      selectedVariants,
    );
    const sheetOpened =
      accepted &&
      upsell.openAfterAdd({
        id: product.id,
        name: product.name,
        price: resolved.ok
          ? resolvePurchasableLinePrice(displayPrice, resolved.priceModifier)
          : displayPrice,
        quantity,
        imageUrl: addedImage,
        selectedOptions: selectedVariants,
      });
    if (!sheetOpened) {
      showCartToast({
        name: product.name,
        price: displayPrice,
        imageUrl: addedImage,
      });
    }
  };
  const handleWishlist = () => {
    toggleWishlist(product.id);
    onAddToWishlist?.(product);
  };
  const openImage = (index: number) => {
    setSelectedIdx(index);
    setLightboxOpen(true);
    onImageClick?.(images[index]?.url ?? "", index);
  };

  if (isLoading) return <Skeleton />;

  const longCopy = product.longDescription?.trim();
  const shortCopy = product.description?.trim();
  const related: MinimalProduct[] = (relatedProducts ?? []).slice(0, 4).map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    price: p.price,
    discountPrice: p.discountPrice,
    stock: p.stock,
    imageUrl: p.imageUrl,
    images: p.images,
    available: p.available,
    categoryName: p.categoryName,
    categories: p.categories,
    requiresOptions: p.requiresOptions,
    catalogueNo: p.catalogueNo ?? null,
  }));

  return (
    <div className={`product-page-premium bg-bg ${className}`}>
      {/* ── Breadcrumb ── */}
      <div className='perce-container pb-4 pt-4 lg:pt-6'>
        <nav aria-label='Breadcrumb'>
          <ol className='flex items-center gap-2 overflow-x-auto whitespace-nowrap t-small text-ink-2 scrollbar-hide'>
            <li>
              <a href='/' className='perce-underline-hover hover:text-ink'>
                {t("product.home")}
              </a>
            </li>
            <li aria-hidden='true'>/</li>
            <li>
              <a href='/shop' className='perce-underline-hover hover:text-ink'>
                {t("product.shop")}
              </a>
            </li>
            {product.categoryName && (
              <>
                <li aria-hidden='true'>/</li>
                <li aria-current='page' className='truncate text-ink'>
                  {product.categoryName}
                </li>
              </>
            )}
          </ol>
        </nav>
      </div>

      {/* ────────────────── Product ────────────────── */}
      <section className='pb-16 lg:pb-24'>
        <div className='perce-container'>
          <div className='grid grid-cols-1 items-start gap-6 md:grid-cols-12 md:gap-8 lg:gap-12'>
            {/* ── Photographs (7/12) ── */}
            <div className='md:col-span-7'>
              {images.length > 0 ? (
                <>
                  <SwipeGallery images={images} productName={product.name} onOpen={openImage} />
                  <DesktopGallery images={images} productName={product.name} onOpen={openImage} />
                </>
              ) : (
                <div className='-mx-[var(--perce-gutter)] aspect-[4/5] bg-surface-2 md:mx-0' />
              )}
            </div>

            {/* ── Information index (5/12), sticky from 1024px ── */}
            <div className='flex flex-col md:sticky md:top-[calc(var(--perce-header-offset)+2rem)] md:col-span-5'>
              {/* 0. The full index line — catalogue number, measures and
                  placement, each only when the product has it. Name and
                  price are the h1 and the price row right below. */}
              <IndexLine
                variant='full'
                className='mb-3'
                product={{
                  name: product.name,
                  catalogueNo: product.catalogueNo,
                  placement: productPlacement(product, categoryRows),
                }}
              />

              {/* 1. Name */}
              <h1 className='t-pdp-title text-ink'>{product.name}</h1>

              {/* Rating — real reviews only, as data. */}
              {product.rating !== undefined && product.rating > 0 && (
                <p className='mt-2 t-small tabular-nums text-ink-2'>
                  {product.rating.toFixed(1)} / 5
                  {product.reviewCount !== undefined && ` (${product.reviewCount})`}
                </p>
              )}

              {/* 2. Price + availability */}
              <div className='mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1' style={{ fontFamily: "var(--font-price)" }}>
                <Price amount={displayPrice} locale={moneyLocale} size='pdp' />
                <p className='t-small text-ink-2'>{inStock ? t("in_stock") : t("out_of_stock")}</p>
              </div>

              {/* No shipping teaser here: shipping is priced per governorate
                  at checkout and there is no global free-shipping threshold.
                  Shipping policy copy lives in the admin-authored Shipping &
                  Returns row below. */}

              {/* Product facts — real data only. No Category row: the
                  breadcrumb already places the piece. */}
              <ProductDecisionSummary product={product} showCategory={false} className='mt-6 border-y border-line py-4' />

              {/* 3. Options */}
              {product.variants && product.variants.length > 0 && (
                <VariantSelector
                  variants={product.variants}
                  selectedVariants={selectedVariants}
                  onVariantChange={(name, value) =>
                    setSelectedVariants((prev) => ({ ...prev, [name]: value }))
                  }
                  className='mt-6'
                />
              )}

              {/* 4–5. Quantity, then Add to bag (+ wishlist, secondary).
                  Phones: one row, the stepper stretched to the button's
                  height. From 768px: the stepper sits above the button row.
                  The stepper's group label names it, so no visible label. */}
              <div className='mt-6 flex items-stretch gap-2 md:flex-col md:gap-4'>
                <Stepper
                  value={quantity}
                  onDecrement={() => setQuantity(Math.max(1, quantity - 1))}
                  onIncrement={() => setQuantity(Math.min(product.stock, quantity + 1))}
                  canDecrement={quantity > 1 && inStock}
                  canIncrement={quantity < product.stock && inStock}
                  label={t("product.quantity")}
                  decrementLabel={t("product.decrease")}
                  incrementLabel={t("product.increase")}
                  className='shrink-0 md:self-start'
                />

                <div className='flex min-w-0 flex-1 items-stretch gap-2'>
                  <Button
                    ref={addToBagRef}
                    variant='primary'
                    size='lg'
                    onClick={handleAddToCart}
                    disabled={!canAdd}
                    data-add-to-cart='true'
                    className='min-w-0 flex-1'>
                    {inStock ? t("product.add_to_bag") : t("out_of_stock")}
                  </Button>

                  {showWishlist && (
                    <IconButton
                      size='lg'
                      onClick={handleWishlist}
                      aria-pressed={wishlisted}
                      aria-label={t("product.wishlist")}
                      className='shrink-0 border border-line-input'>
                      <Heart {...ICON_PROPS} className={cn(wishlisted && "fill-current")} />
                    </IconButton>
                  )}
                </div>
              </div>

              {/* 6. Service facts — store facts only: cash on delivery is
                  always offered (shared/config/payment.ts) and the delivery
                  fee is priced per governorate (SHIPPING_FEE_RANGE_EGP). No
                  invented free shipping or return windows. */}
              <ul className='mt-4 flex flex-wrap gap-x-4 gap-y-1 t-small text-ink-2' data-testid='purchase-reassurance'>
                <li>{t("product.reassure_cod")}</li>
                <li aria-hidden='true'>·</li>
                <li>{fill(t("product.delivery_fee_range"), { range: formatShippingFeeRange(moneyLocale) })}</li>
              </ul>

              {/* Upsells (ported from Mach) — next to the decision they add
                  to. Nothing renders while upsells are off. */}
              <ProductUpsellBlock
                products={upsell.blockItems}
                heading={
                  upsells?.source === "manual"
                    ? t("upsell.heading_manual")
                    : t("upsell.heading_random")
                }
                className='mt-6'
              />

              {/* Promotional set link (shared/config/promo-layer, off) —
                  only when this product is in a live Pick Your Set pool. */}
              <PdpBundleLink productId={product.id} />

              {product.sku && (
                <p className='mt-4 t-micro tabular-nums text-ink-2'>SKU {product.sku}</p>
              )}

              {/* 7. Information rows, after the purchase decision */}
              <div className='mt-8 border-b border-line' data-testid='product-details'>
                {(shortCopy || longCopy) && (
                  <AccordionRow level={2} title={t("product.description")} defaultOpen>
                    <div className='space-y-3 whitespace-pre-line'>
                      {shortCopy && <p>{shortCopy}</p>}
                      {longCopy && longCopy !== shortCopy && <p>{longCopy}</p>}
                    </div>
                  </AccordionRow>
                )}

                {product.specifications &&
                  product.specifications.length > 0 && (
                    <AccordionRow level={2} title={t("product.specifications")}>
                      <dl className='divide-y divide-line'>
                        {product.specifications.map((spec, i) => (
                          <div key={i} className='flex justify-between gap-4 py-2 t-small'>
                            <dt className='text-ink-2'>{spec.label}</dt>
                            <dd className='text-ink'>{spec.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </AccordionRow>
                  )}

                {/* Shipping & Returns — admin-authored, never invented. It
                    renders only what an admin wrote in Dashboard > Settings >
                    Product page content, and disappears when that is empty. */}
                {(shippingText || returnsText) && (
                  <AccordionRow level={2} title={t("product.shipping_returns")}>
                    <div className='space-y-3 whitespace-pre-line'>
                      {shippingText && <p>{shippingText}</p>}
                      {returnsText && <p>{returnsText}</p>}
                    </div>
                  </AccordionRow>
                )}

                {/* Care — generic handling advice that makes no claim about
                    this store's products, materials or durability. */}
                <AccordionRow level={2} title={t("product.care_guide")}>
                  <div className='space-y-3'>
                    <p>{t("product.care_1")}</p>
                    <p>{t("product.care_2")}</p>
                  </div>
                </AccordionRow>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ────────────────── Related ────────────────── */}
      {related.length > 0 && (
        <section className='perce-section border-t border-line'>
          <div className='perce-container'>
            <div className='mb-6 flex items-baseline justify-between gap-4 lg:mb-8'>
              <h2 className='t-h2 text-ink'>{t("product.related")}</h2>
              <a href='/shop' className={buttonClass({ variant: "text", size: "sm" })}>
                {t("home.view_all_products")}
              </a>
            </div>
            {/* One related piece is a feature, not a card alone in a
                four-column grid. */}
            {related.length === 1 && related[0] ? (
              <FeaturedObject product={related[0]} headingAs='h3' />
            ) : (
              <div className='-mx-2 grid grid-cols-2 gap-x-2 gap-y-6 md:mx-0 md:grid-cols-3 md:gap-x-3 md:gap-y-10 min-[75rem]:grid-cols-4'>
                {related.map((p) => (
                  <MinimalProductCard key={p.id} product={p} />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <PostAddUpsellSheet
        open={upsell.sheet !== null}
        main={upsell.sheet?.main ?? null}
        products={upsell.sheet?.items ?? []}
        onClose={upsell.closeSheet}
      />

      {/* ────────────────── Lightbox ────────────────── */}
      {lightboxOpen && images.length > 0 && (
        <Lightbox
          images={images}
          startIndex={selectedIdx}
          productName={product.name}
          onClose={() => setLightboxOpen(false)}
        />
      )}

      {/* ── Sticky Add to bag (below 768px) ──
          Appears whenever the main button is not fully usable (see
          useFullyUsable above). A `surface` panel with a top hairline on the
          viewport's bottom edge, its content padded above the device's
          home-indicator area. */}
      {inStock && (
        <div
          style={{
            bottom: STICKY_BAR_BOTTOM,
            paddingBottom: STICKY_BAR_PADDING_BOTTOM,
            zIndex: "var(--perce-z-sticky)",
          }}
          aria-hidden={!showSticky}
          data-testid='sticky-add-to-bag'
          className={cn(
            "fixed inset-x-0 border-t border-line bg-surface px-4 pt-3 transition-transform duration-[var(--perce-duration)] md:hidden",
            showSticky ? "translate-y-0" : "pointer-events-none translate-y-[200%]",
          )}>
          <div className='flex items-center gap-3'>
            <div className='min-w-0 flex-1'>
              <p className='truncate t-small text-ink-2'>{product.name}</p>
              <p className='t-card-price text-ink'>
                {formatMoney(displayPrice, { locale: moneyLocale })}
                {quantity > 1 && <span className='ms-2 font-normal text-ink-2'>× {quantity}</span>}
              </p>
            </div>
            <Button
              variant='primary'
              size='lg'
              onClick={handleAddToCart}
              disabled={!canAdd}
              tabIndex={showSticky ? 0 : -1}
              className='shrink-0'>
              {t("product.add_to_bag")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

ProductPagePremium.displayName = "ProductPagePremium";
