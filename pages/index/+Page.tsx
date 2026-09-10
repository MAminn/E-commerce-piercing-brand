import React, { useState, useEffect, useRef } from "react";
import { trpc } from "#root/shared/trpc/client";
import { getStoreOwnerId } from "#root/shared/config/store";
import { getTemplateComponent } from "#root/components/template-system";
import { useTemplate } from "#root/frontend/contexts/TemplateContext";
import type { LandingTemplateModernProps } from "#root/components/template-system";
import type { HomepageContent } from "#root/shared/types/homepage-content";
import type { CategoryStripItem } from "#root/components/shop/CategoryStrip";
import type { NewArrivalProduct } from "#root/components/shop/NewArrivals";
import { useData } from "vike-react/useData";
import type { Data } from "./+data";

export { Page };

interface FeaturedProduct {
  id: string;
  slug?: string | null;
  name: string;
  price: number;
  discountPrice?: number | string | null;
  stock: number;
  imageUrl?: string;
  images?: { url: string; isPrimary?: boolean }[];
  categoryName: string;
  available: boolean;
  categories?: { id: string; name: string }[];
}

function Page() {
  // SSR-provided CMS content — no flash of defaults
  const ssrData = useData<Data>();

  const [featuredProducts, setFeaturedProducts] = useState<FeaturedProduct[]>(
    [],
  );
  const [discountedProducts, setDiscountedProducts] = useState<FeaturedProduct[]>(
    [],
  );
  const [homepageContent, setHomepageContent] = useState<HomepageContent>(
    ssrData.homepageContent,
  );
  const [categories, setCategories] = useState<CategoryStripItem[]>([]);
  const [newArrivals, setNewArrivals] = useState<NewArrivalProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [newArrivalsLoading, setNewArrivalsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { getTemplateId, isLoading: isTemplateLoading } = useTemplate();

  // Resolve the active landing template ID early so we can use it for content fetching
  const activeLandingTemplateId = getTemplateId("landing") ?? "landing-modern";

  // Track which template ID the CMS content was fetched for.
  // Starts with the SSR template so we skip the redundant initial fetch.
  const lastFetchedTemplateRef = useRef(ssrData.ssrTemplateId);

  // ───────────────────────────────────────────────────
  // Fetch featured products (always client-side — dynamic data)
  // ───────────────────────────────────────────────────
  useEffect(() => {
    const fetchProducts = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const searchParams: Record<string, any> = {
          limit: 8,
          includeOutOfStock: false,
        };
        // Use manually selected product IDs from CMS if configured
        const featuredIds = homepageContent.featuredProducts?.productIds;
        if (featuredIds && featuredIds.length > 0) {
          searchParams.productIds = featuredIds;
        }
        const productsResult = await trpc.product.search.query(searchParams);

        if (productsResult.success && productsResult.result) {
          setFeaturedProducts(
            productsResult.result.items.map((item) => ({
              id: item.id,
              slug: item.slug,
              name: item.name,
              price: Number(item.price),
              discountPrice: item.discountPrice
                ? Number(item.discountPrice)
                : null,
              stock: item.stock,
              imageUrl: item.imageUrl
                ? item.imageUrl.startsWith("http")
                  ? item.imageUrl
                  : `/uploads/${item.imageUrl}`
                : undefined,
              images: item.images,
              categoryName: item.categoryName || "",
              categories: item.categories,
              available: item.stock > 0,
            })),
          );
        }
      } catch (err) {
        setError("Error loading homepage data");
        console.error("Error loading homepage data:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProducts();
  }, [homepageContent.featuredProducts?.productIds]);

  // ───────────────────────────────────────────────────
  // Re-fetch CMS content only when the active template changes
  // client-side (e.g. admin switches template). SSR already
  // provided the initial content so we skip the first fetch.
  // ───────────────────────────────────────────────────
  useEffect(() => {
    // Skip if the active template matches what SSR (or our last fetch) provided
    if (activeLandingTemplateId === lastFetchedTemplateRef.current) return;

    let cancelled = false;
    const merchantId = getStoreOwnerId();

    trpc.homepage.getContent
      .query({ merchantId, templateId: activeLandingTemplateId })
      .then((contentResult) => {
        if (cancelled) return;
        if (contentResult.success && contentResult.result) {
          setHomepageContent(contentResult.result);
        }
        lastFetchedTemplateRef.current = activeLandingTemplateId;
      })
      .catch((err) => {
        if (!cancelled) console.warn("Using default homepage content:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [activeLandingTemplateId]);

  // Fetch categories separately (parallel loading)
  useEffect(() => {
    const fetchCategories = async () => {
      setCategoriesLoading(true);
      try {
        const categoriesResult = await trpc.category.view.query();

        if (categoriesResult.success && categoriesResult.result) {
          const mappedCategories: CategoryStripItem[] = categoriesResult.result
            .filter((cat: any) => !cat.deleted && cat.showOnLanding !== false)
            .slice(0, 8) // Limit to 8 categories for the strip
            .map((cat: any) => ({
              id: cat.id,
              name: cat.name,
              slug: cat.slug,
              imageUrl: cat.filename || null,
            }));

          setCategories(mappedCategories);
        }
      } catch (err) {
        console.error("Error loading categories:", err);
        // Continue without categories
      } finally {
        setCategoriesLoading(false);
      }
    };

    fetchCategories();
  }, []);

  // Fetch new arrivals (newest products, parallel loading)
  useEffect(() => {
    const fetchNewArrivals = async () => {
      setNewArrivalsLoading(true);
      try {
        const searchParams: Record<string, any> = {
          limit: 8,
          sortBy: "newest" as const,
          includeOutOfStock: true,
        };
        // Use manually selected product IDs from CMS if configured
        const newArrivalIds = homepageContent.newArrivals?.productIds;
        if (newArrivalIds && newArrivalIds.length > 0) {
          searchParams.productIds = newArrivalIds;
        }
        const result = await trpc.product.search.query(searchParams);

        if (result.success && result.result) {
          setNewArrivals(
            result.result.items.map((item) => ({
              id: item.id,
              slug: item.slug,
              name: item.name,
              price: Number(item.price),
              discountPrice: item.discountPrice
                ? Number(item.discountPrice)
                : null,
              stock: item.stock,
              imageUrl: item.imageUrl
                ? item.imageUrl.startsWith("http")
                  ? item.imageUrl
                  : `/uploads/${item.imageUrl}`
                : undefined,
              images: item.images,
              categoryName: item.categoryName || null,
              available: item.stock > 0,
            })),
          );
        }
      } catch (err) {
        console.error("Error loading new arrivals:", err);
      } finally {
        setNewArrivalsLoading(false);
      }
    };

    fetchNewArrivals();
  }, [homepageContent.newArrivals?.productIds]);

  // Fetch discounted products (products with discountPrice < price)
  useEffect(() => {
    const fetchDiscounted = async () => {
      try {
        const searchParams: Record<string, any> = {
          limit: 8,
          discountedOnly: true,
          includeOutOfStock: false,
        };
        // Use manually selected product IDs from CMS if configured
        const discountedIds = homepageContent.discountedProducts?.productIds;
        if (discountedIds && discountedIds.length > 0) {
          searchParams.productIds = discountedIds;
        }
        const result = await trpc.product.search.query(searchParams);

        if (result.success && result.result) {
          setDiscountedProducts(
            result.result.items.map((item) => ({
              id: item.id,
              slug: item.slug,
              name: item.name,
              price: Number(item.price),
              discountPrice: item.discountPrice
                ? Number(item.discountPrice)
                : null,
              stock: item.stock,
              imageUrl: item.imageUrl
                ? item.imageUrl.startsWith("http")
                  ? item.imageUrl
                  : `/uploads/${item.imageUrl}`
                : undefined,
              images: item.images,
              categoryName: item.categoryName || "",
              categories: item.categories,
              available: item.stock > 0,
            })),
          );
        }
      } catch (err) {
        console.error("Error loading discounted products:", err);
      }
    };

    fetchDiscounted();
  }, [homepageContent.discountedProducts?.productIds]);

  // Get the selected landing template
  const templateEntry = getTemplateComponent("landing", activeLandingTemplateId);

  // Wait for template selection to resolve from DB before rendering
  // This prevents flickering between the default and active template
  if (isTemplateLoading) {
    return null;
  }

  if (!templateEntry) {
    return <div>Error: Landing page template not found.</div>;
  }

  const Template = templateEntry.component;

  // Prepare props for LandingTemplateModern
  const templateProps: LandingTemplateModernProps = {
    content: homepageContent,
    featuredProducts,
    discountedProducts,
    categories,
    categoriesLoading,
    newArrivals,
    newArrivalsLoading,
    onCtaClick: (link: string) => {
      window.location.href = link;
    },
  };

  return <Template {...templateProps} />;
}
