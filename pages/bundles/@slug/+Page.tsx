import { usePageContext } from "vike-react/usePageContext";
import { BundleDetail } from "#root/components/bundles/BundleDetail";

/**
 * /bundles/@slug — one campaign page for both types. `BundleDetail` loads
 * the live campaign via the public `bundle.getLiveBySlug` procedure and
 * renders the Build Your Stack builder or the curated stack page; anything
 * not live (draft, scheduled, expired, unknown) shows the not-found state.
 */
export default function BundlePage() {
  const pageContext = usePageContext();
  const slug = String(pageContext.routeParams?.slug ?? "");
  return <BundleDetail slug={slug} />;
}
