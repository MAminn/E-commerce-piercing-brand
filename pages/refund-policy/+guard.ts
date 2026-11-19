import { redirect } from "vike/abort";
import { LEGAL_PAGE_HREFS } from "#root/shared/legal/legal-pages";

/**
 * /refund-policy is the same Returns & Refunds policy as /return-policy — one
 * CMS record (Dashboard > Homepage > Returns & Refunds), one canonical URL.
 * A permanent redirect rather than a second rendering, so search engines and
 * payment-provider reviewers see a single page and no copy can drift.
 * Runs on the server for a direct hit and on the client for a footer click.
 */
export function guard(): never {
  throw redirect(LEGAL_PAGE_HREFS.returnPolicy, 301);
}
