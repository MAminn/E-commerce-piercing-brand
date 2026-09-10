import React, { useState, useMemo, memo } from "react";
import { Button } from "#root/components/ui/button";
import { VariantSelector } from "#root/components/shop/VariantSelector";
import { Skeleton } from "#root/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogClose,
} from "#root/components/ui/dialog";
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
import { getProductUrl } from "#root/lib/utils/route-helpers";
import {
  Heart,
  ChevronLeft,
  ChevronRight,
  Share2,
  Minus,
  Plus,
  X,
  Truck,
  Shield,
  RotateCcw,
} from "lucide-react";
import { EditorialChrome } from "../editorial/EditorialChrome";
import { Reveal } from "../motion/Reveal";
import { StaggerContainer, StaggerItem } from "../motion/Stagger";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface ProductPageEditorialProps {
  product?: ProductPageProduct;
  relatedProducts?: FeaturedProduct[];
  showWishlist?: boolean;
  showSocialShare?: boolean;
  onAddToCart?: (
    product: ProductPageProduct,
    selectedOptions?: Record<string, string>,
  ) => void;
  onAddToWishlist?: (product: ProductPageProduct) => void;
  onImageClick?: (imageUrl: string, index: number) => void;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Default Product                                                   */
/* ------------------------------------------------------------------ */

const DEFAULT_PRODUCT: ProductPageProduct = {
  id: "editorial-1",
  name: "Wool-Blend Oversized Coat",
  price: 4500,
  discountPrice: 3600,
  stock: 12,
  available: true,
  imageUrl:
    "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=800",
  images: [
    {
      url: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=800",
      isPrimary: true,
    },
    {
      url: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=800",
    },
    {
      url: "https://images.unsplash.com/photo-1539533113208-f6df8cc8b543?w=800",
    },
  ],
  description: "A timeless oversized coat crafted from premium wool blend.",
  longDescription:
    "Layer with intention. This oversized silhouette in a luxe wool-cashmere blend falls to mid-calf length. Dropped shoulders, notched lapels, and a single-button closure create an effortlessly elegant line. Fully lined in cupro for smooth layering over knitwear and tailoring alike.",
  rating: 4.8,
  reviewCount: 42,
  sku: "OC-WB-2024",
  brand: "House Edit",
  specifications: [
    { label: "Fabric", value: "70% Wool, 20% Polyamide, 10% Cashmere" },
    { label: "Lining", value: "100% Cupro" },
    { label: "Length", value: "120 cm" },
    { label: "Care", value: "Dry clean only" },
  ],
  features: [
    {
      icon: "package",
      title: "Complimentary Shipping",
      description: "Free express delivery on all orders",
    },
    {
      icon: "shield",
      title: "Secure Payment",
      description: "100% secure checkout",
    },
  ],
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function safePrice(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? Number.parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

function formatPrice(v: number): string {
  return `EGP ${v.toFixed(2)}`;
}

/* ------------------------------------------------------------------ */
/*  Related Product Tile (reuses editorial aesthetic)                  */
/* ------------------------------------------------------------------ */

const RelatedTile = memo(function RelatedTile({
  product,
}: {
  product: FeaturedProduct;
}) {
  const primary = product.images?.find((i) => i.isPrimary);
  const img = primary?.url || product.images?.[0]?.url || product.imageUrl;
  const discount = safePrice(product.discountPrice);
  const hasDiscount = discount != null && discount < product.price;

  return (
    <a
      href={getProductUrl(product)}
      className='group block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-stone-900/25 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-50'>
      <div className='relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-stone-200'>
        {img ? (
          <img
            src={img}
            alt={product.name}
            loading='lazy'
            decoding='async'
            className='absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]'
          />
        ) : (
          <div className='absolute inset-0 flex items-center justify-center'>
            <span className='text-xs tracking-[0.28em] uppercase text-stone-400'>
              No image
            </span>
          </div>
        )}
      </div>
      <div className='mt-3'>
        {product.categoryName && (
          <p className='text-[10px] tracking-[0.28em] uppercase text-stone-500'>
            {product.categoryName}
          </p>
        )}
        <p className='mt-1 text-sm font-medium text-stone-900 line-clamp-1'>
          {product.name}
        </p>
        <div className='mt-1 flex items-center gap-2 text-sm'>
          {hasDiscount ? (
            <>
              <span className='font-medium text-stone-900'>
                {formatPrice(discount)}
              </span>
              <span className='text-stone-500 line-through'>
                {formatPrice(product.price)}
              </span>
            </>
          ) : (
            <span className='text-stone-700'>{formatPrice(product.price)}</span>
          )}
        </div>
      </div>
    </a>
  );
});

/* ------------------------------------------------------------------ */
/*  Main Component                                                    */
/* ------------------------------------------------------------------ */

export function ProductPageEditorial({
  product = DEFAULT_PRODUCT,
  relatedProducts,
  showWishlist = true,
  showSocialShare = false,
  onAddToCart,
  onAddToWishlist,
  onImageClick,
  className = "",
}: ProductPageEditorialProps) {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);

  const images: ProductImage[] = useMemo(() => {
    if (product.images && product.images.length > 0) return product.images;
    if (product.imageUrl) return [{ url: product.imageUrl, isPrimary: true }];
    return [];
  }, [product.images, product.imageUrl]);

  const currentImage = images[selectedImageIndex] ?? images[0];

  const hasDiscount =
    product.discountPrice != null &&
    typeof product.discountPrice === "number" &&
    product.discountPrice < product.price;

  const isSoldOut = !product.available || product.stock <= 0;

  const [selectedVariants, setSelectedVariants] = useState<
    Record<string, string>
  >({});

  const allVariantsSelected =
    !product.variants?.length ||
    product.variants.every((v) => selectedVariants[v.name]);

  const handleAddToCart = () => {
    if (onAddToCart && !isSoldOut) {
      onAddToCart(product, selectedVariants);
    }
  };

  const handleImageNav = (dir: -1 | 1) => {
    setSelectedImageIndex((prev) => {
      const next = prev + dir;
      if (next < 0) return images.length - 1;
      if (next >= images.length) return 0;
      return next;
    });
  };

  return (
    <EditorialChrome>
      <div
        className={`product-page-editorial bg-stone-50 min-h-screen ${className}`}>
        {/* ============================================================ */}
        {/*  12-COLUMN GRID LAYOUT                                       */}
        {/* ============================================================ */}
        <div className='mx-auto max-w-7xl px-4 pt-6 pb-16 sm:px-6 lg:px-10'>
          {/* Breadcrumb-style label */}
          <div className='mb-6'>
            <p className='text-xs tracking-[0.28em] uppercase text-stone-500'>
              {product.brand || "Shop"} / {product.categoryName || "Collection"}
            </p>
          </div>

          <div className='grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10'>
            {/* -------------------------------------------------------- */}
            {/*  Thumbnails — col-span-1 on desktop                      */}
            {/* -------------------------------------------------------- */}
            {images.length > 1 && (
              <StaggerContainer className='hidden lg:flex lg:col-span-1 lg:flex-col lg:gap-2 lg:pt-1'>
                {images.map((img, idx) => (
                  <StaggerItem key={idx}>
                    <button
                      type='button'
                      onClick={() => setSelectedImageIndex(idx)}
                      className={`relative aspect-square w-full overflow-hidden rounded-lg border-2 transition-colors ${
                        idx === selectedImageIndex
                          ? "border-stone-900"
                          : "border-transparent hover:border-stone-300"
                      }`}>
                      <img
                        src={img.url}
                        alt={`View ${idx + 1}`}
                        className='absolute inset-0 h-full w-full object-cover'
                      />
                    </button>
                  </StaggerItem>
                ))}
              </StaggerContainer>
            )}

            {/* -------------------------------------------------------- */}
            {/*  Main Image — col-span-7                                 */}
            {/* -------------------------------------------------------- */}
            <Reveal
              variant='fadeIn'
              className={`relative ${images.length > 1 ? "lg:col-span-7" : "lg:col-span-8"}`}>
              <div className='group relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-stone-200'>
                {currentImage?.url ? (
                  <img
                    src={currentImage.url}
                    alt={product.name}
                    className='absolute inset-0 h-full w-full cursor-zoom-in object-cover transition-transform duration-500 ease-out group-hover:scale-[1.02]'
                    onClick={() => setLightboxOpen(true)}
                  />
                ) : (
                  <div className='absolute inset-0 flex items-center justify-center'>
                    <span className='text-xs tracking-[0.28em] uppercase text-stone-400'>
                      No image
                    </span>
                  </div>
                )}

                {/* Image nav arrows */}
                {images.length > 1 && (
                  <>
                    <button
                      type='button'
                      onClick={() => handleImageNav(-1)}
                      className='absolute start-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-stone-700 shadow-sm backdrop-blur-sm hover:bg-white transition-colors'
                      aria-label='Previous image'>
                      <ChevronLeft className='h-4 w-4' />
                    </button>
                    <button
                      type='button'
                      onClick={() => handleImageNav(1)}
                      className='absolute end-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-stone-700 shadow-sm backdrop-blur-sm hover:bg-white transition-colors'
                      aria-label='Next image'>
                      <ChevronRight className='h-4 w-4' />
                    </button>
                  </>
                )}

                {/* Sale / Sold out badge */}
                {isSoldOut ? (
                  <span className='absolute top-4 start-4 text-[10px] tracking-[0.28em] uppercase text-stone-600 bg-white/80 backdrop-blur-sm px-3 py-1.5 rounded-full'>
                    Sold Out
                  </span>
                ) : hasDiscount ? (
                  <span className='absolute top-4 start-4 text-[10px] tracking-[0.28em] uppercase text-stone-900 bg-white/80 backdrop-blur-sm px-3 py-1.5 rounded-full'>
                    Sale
                  </span>
                ) : null}
              </div>

              {/* Mobile thumbnail strip */}
              {images.length > 1 && (
                <div className='mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden'>
                  {images.map((img, idx) => (
                    <button
                      key={idx}
                      type='button'
                      onClick={() => setSelectedImageIndex(idx)}
                      className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                        idx === selectedImageIndex
                          ? "border-stone-900"
                          : "border-transparent"
                      }`}>
                      <img
                        src={img.url}
                        alt={`View ${idx + 1}`}
                        className='absolute inset-0 h-full w-full object-cover'
                      />
                    </button>
                  ))}
                </div>
              )}
            </Reveal>

            {/* -------------------------------------------------------- */}
            {/*  Buy Box — col-span-4, sticky                            */}
            {/* -------------------------------------------------------- */}
            <Reveal variant='fadeUp' delay={0.15} className='lg:col-span-4'>
              <div className='lg:sticky lg:top-24'>
                {/* Brand */}
                {product.brand && (
                  <p className='text-[10px] tracking-[0.32em] uppercase text-stone-500'>
                    {product.brand}
                  </p>
                )}

                {/* Name */}
                <h1 className='mt-2 text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl leading-tight'>
                  {product.name}
                </h1>

                {/* Price */}
                <div className='mt-4 flex items-baseline gap-3'>
                  {hasDiscount ? (
                    <>
                      <span className='text-xl font-semibold text-stone-900'>
                        {formatPrice(Number(product.discountPrice))}
                      </span>
                      <span className='text-sm text-stone-500 line-through'>
                        {formatPrice(Number(product.price))}
                      </span>
                    </>
                  ) : (
                    <span className='text-xl font-semibold text-stone-900'>
                      {formatPrice(Number(product.price))}
                    </span>
                  )}
                </div>

                {/* Short description */}
                {product.description && (
                  <p className='mt-4 text-sm text-stone-600 leading-relaxed'>
                    {product.description}
                  </p>
                )}

                {/* Divider */}
                <div className='mt-6 h-px w-full bg-stone-900/10' />

                {/* Quantity selector */}
                <div className='mt-6'>
                  <p className='text-xs tracking-[0.2em] uppercase text-stone-500 mb-3'>
                    Quantity
                  </p>
                  <div className='inline-flex items-center rounded-full border border-stone-200 bg-white'>
                    <button
                      type='button'
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className='flex h-10 w-10 items-center justify-center text-stone-600 hover:text-stone-900 transition-colors'
                      aria-label='Decrease quantity'>
                      <Minus className='h-3.5 w-3.5' />
                    </button>
                    <span className='w-10 text-center text-sm font-medium text-stone-900'>
                      {quantity}
                    </span>
                    <button
                      type='button'
                      onClick={() =>
                        setQuantity((q) => Math.min(product.stock || 99, q + 1))
                      }
                      className='flex h-10 w-10 items-center justify-center text-stone-600 hover:text-stone-900 transition-colors'
                      aria-label='Increase quantity'>
                      <Plus className='h-3.5 w-3.5' />
                    </button>
                  </div>
                </div>

                {/* Variant Selector */}
                {product.variants && product.variants.length > 0 && (
                  <VariantSelector
                    variants={product.variants}
                    selectedVariants={selectedVariants}
                    onVariantChange={(name, value) =>
                      setSelectedVariants((prev) => ({
                        ...prev,
                        [name]: value,
                      }))
                    }
                    className='mt-6'
                  />
                )}

                {/* Add to bag + Wishlist */}
                <div className='mt-6 flex items-center gap-3'>
                  <Button
                    size='lg'
                    className='flex-1 rounded-full py-6 text-sm tracking-wide'
                    disabled={isSoldOut || !allVariantsSelected}
                    onClick={handleAddToCart}>
                    {isSoldOut ? "Sold Out" : "Add to Bag"}
                  </Button>
                  {showWishlist && (
                    <button
                      type='button'
                      onClick={() => onAddToWishlist?.(product)}
                      className='flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 hover:text-stone-900 hover:border-stone-300 transition-colors'
                      aria-label='Add to wishlist'>
                      <Heart className='h-4.5 w-4.5' />
                    </button>
                  )}
                </div>

                {/* Value props row */}
                <div className='mt-6 grid grid-cols-3 gap-3'>
                  <div className='flex flex-col items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-2 py-3 text-center'>
                    <Truck className='h-4 w-4 text-stone-500' />
                    <span className='text-[10px] tracking-wide text-stone-600'>
                      Free Ship
                    </span>
                  </div>
                  <div className='flex flex-col items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-2 py-3 text-center'>
                    <Shield className='h-4 w-4 text-stone-500' />
                    <span className='text-[10px] tracking-wide text-stone-600'>
                      Secure Pay
                    </span>
                  </div>
                  <div className='flex flex-col items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-2 py-3 text-center'>
                    <RotateCcw className='h-4 w-4 text-stone-500' />
                    <span className='text-[10px] tracking-wide text-stone-600'>
                      Easy Return
                    </span>
                  </div>
                </div>

                {/* Accordion (Specs / Long Description) */}
                <div className='mt-6'>
                  <Accordion type='multiple' defaultValue={["description"]}>
                    {product.longDescription && (
                      <AccordionItem value='description'>
                        <AccordionTrigger className='text-sm font-medium text-stone-900 hover:no-underline'>
                          Description
                        </AccordionTrigger>
                        <AccordionContent className='text-sm text-stone-600 leading-relaxed'>
                          {product.longDescription}
                        </AccordionContent>
                      </AccordionItem>
                    )}
                    {product.specifications &&
                      product.specifications.length > 0 && (
                        <AccordionItem value='specifications'>
                          <AccordionTrigger className='text-sm font-medium text-stone-900 hover:no-underline'>
                            Specifications
                          </AccordionTrigger>
                          <AccordionContent>
                            <dl className='space-y-2'>
                              {product.specifications.map((spec, idx) => (
                                <div key={idx} className='flex justify-between'>
                                  <dt className='text-sm text-stone-500'>
                                    {spec.label}
                                  </dt>
                                  <dd className='text-sm text-stone-900'>
                                    {spec.value}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          </AccordionContent>
                        </AccordionItem>
                      )}
                    <AccordionItem value='shipping'>
                      <AccordionTrigger className='text-sm font-medium text-stone-900 hover:no-underline'>
                        Shipping &amp; Returns
                      </AccordionTrigger>
                      <AccordionContent className='text-sm text-stone-600 leading-relaxed'>
                        Complimentary standard shipping on orders over EGP
                        1,000. Express shipping available at checkout. Returns
                        accepted within 14 days of delivery.
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              </div>
            </Reveal>
          </div>
        </div>

        {/* ============================================================ */}
        {/*  MOBILE STICKY ADD-TO-BAG BAR                                */}
        {/* ============================================================ */}
        <div className='fixed inset-x-0 bottom-0 z-50 border-t border-stone-200 bg-white/95 backdrop-blur-sm p-3 lg:hidden'>
          <div className='flex items-center gap-3'>
            <div className='flex-1 min-w-0'>
              <p className='text-sm font-medium text-stone-900 truncate'>
                {product.name}
              </p>
              <p className='text-sm text-stone-700'>
                {hasDiscount
                  ? formatPrice(Number(product.discountPrice))
                  : formatPrice(Number(product.price))}
              </p>
            </div>
            <Button
              className='rounded-full px-6 py-5 text-sm tracking-wide'
              disabled={isSoldOut || !allVariantsSelected}
              onClick={handleAddToCart}>
              {isSoldOut ? "Sold Out" : "Add to Bag"}
            </Button>
          </div>
        </div>

        {/* ============================================================ */}
        {/*  COMPLETE THE LOOK                                           */}
        {/* ============================================================ */}
        {relatedProducts && relatedProducts.length > 0 && (
          <section className='bg-stone-50 pb-20 lg:pb-24'>
            <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-10'>
              <div className='mb-10 h-px w-full bg-stone-900/10' />
              <Reveal variant='fadeUp'>
                <p className='text-xs tracking-[0.32em] uppercase text-stone-500'>
                  Complete the Look
                </p>
                <h2 className='mt-3 text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl'>
                  You May Also Like
                </h2>
              </Reveal>
              <StaggerContainer className='mt-8 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4'>
                {relatedProducts.slice(0, 4).map((rp) => (
                  <StaggerItem key={rp.id}>
                    <RelatedTile product={rp} />
                  </StaggerItem>
                ))}
              </StaggerContainer>
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/*  LIGHTBOX                                                    */}
        {/* ============================================================ */}
        <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
          <DialogContent className='max-w-4xl bg-stone-950 border-none p-0'>
            <DialogTitle className='sr-only'>Product Image</DialogTitle>
            <div className='relative flex h-[80vh] items-center justify-center'>
              {currentImage?.url && (
                <img
                  src={currentImage.url}
                  alt={product.name}
                  className='max-h-full max-w-full object-contain'
                />
              )}

              {images.length > 1 && (
                <>
                  <button
                    type='button'
                    onClick={() => handleImageNav(-1)}
                    className='absolute start-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors'
                    aria-label='Previous image'>
                    <ChevronLeft className='h-5 w-5' />
                  </button>
                  <button
                    type='button'
                    onClick={() => handleImageNav(1)}
                    className='absolute end-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors'
                    aria-label='Next image'>
                    <ChevronRight className='h-5 w-5' />
                  </button>
                </>
              )}

              <div className='absolute bottom-4 start-1/2 -translate-x-1/2 text-xs text-white/50 tracking-[0.2em]'>
                {selectedImageIndex + 1} / {images.length}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </EditorialChrome>
  );
}

ProductPageEditorial.displayName = "ProductPageEditorial";
