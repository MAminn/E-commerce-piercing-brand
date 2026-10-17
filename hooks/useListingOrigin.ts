import { type MouseEvent, useCallback, useEffect, useState } from "react";
import { usePageContext } from "vike-react/usePageContext";
import {
  type ListingOrigin,
  canReturnWithBack,
  resolveListingOrigin,
} from "#root/lib/listing-origin";

/**
 * The listing a product page was opened from (see lib/listing-origin.ts),
 * for its "Shop" breadcrumb. Resolved after mount — sessionStorage and
 * history.state do not exist on the server — so the server-rendered
 * breadcrumb is the plain /shop one and hydration matches.
 *
 * `linkProps` go on the crumb: a real href to the listing URL; when Back
 * lands exactly there, a plain click goes Back instead (restoring the
 * listing's scroll position too). `data-vike="false"` keeps Vike's router
 * from also navigating on that click.
 */
export function useListingOrigin() {
  const pageContext = usePageContext();
  const previousUrl =
    (pageContext as { previousPageContext?: { urlOriginal?: string } | null })
      .previousPageContext?.urlOriginal ?? null;
  const [origin, setOrigin] = useState<ListingOrigin | null>(null);
  const [backable, setBackable] = useState(false);

  // Re-resolved per product page: moving to another product (a related
  // piece) is a new history entry with its own origin.
  // biome-ignore lint/correctness/useExhaustiveDependencies: urlPathname identifies the entry being resolved
  useEffect(() => {
    const resolved = resolveListingOrigin(previousUrl);
    setOrigin(resolved);
    setBackable(!!resolved && canReturnWithBack(resolved, previousUrl));
  }, [pageContext.urlPathname, previousUrl]);

  const onClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (!backable || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      window.history.back();
    },
    [backable],
  );

  return {
    origin,
    linkProps: (href: string) =>
      backable ? { href, onClick, "data-vike": "false" as const } : { href },
  };
}
