import { usePageContext } from "vike-react/usePageContext";
import { useEffect, useState } from "react";

/**
 * Hook to extract product ID from the URL path
 * Works with different route formats
 */
export function useProductId(): {
  productId: string | null;
  isLoading: boolean;
  error: string | null;
} {
  const ctx = usePageContext();
  const [productId, setProductId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      // First check route params - handles both legacy :productId and new @productId formats
      if (ctx.routeParams?.productId) {
        setProductId(decodeURIComponent(ctx.routeParams.productId));
        setIsLoading(false);
        return;
      }

      // Otherwise extract from URL path
      const urlParts = ctx.urlPathname.split("/");
      // The last part of /shop/[id] should be the ID
      if (urlParts.length >= 3 && urlParts[1] === "shop") {
        const idFromUrl = urlParts[urlParts.length - 1];
        if (
          idFromUrl &&
          idFromUrl !== "[productId]" &&
          idFromUrl !== "@productId"
        ) {
          setProductId(decodeURIComponent(idFromUrl));
          setIsLoading(false);
          return;
        }
      }

      // If we get here, we couldn't find the ID
      setError("Could not extract product ID from URL");
      setIsLoading(false);
    } catch (err) {
      setError(
        `Error parsing product ID: ${err instanceof Error ? err.message : String(err)}`,
      );
      setIsLoading(false);
    }
  }, [ctx.urlPathname, ctx.routeParams]);

  return { productId, isLoading, error };
}
