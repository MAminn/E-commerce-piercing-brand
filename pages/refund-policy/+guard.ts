import { redirect } from "vike/abort";
import { LEGAL_PAGE_HREFS } from "#root/shared/legal/legal-pages";

/**
 * /refund-policy is the same Returns & Refunds policy as /return-policy — one
 * CMS record (Dashboard > Homepage > Returns & Refunds), so no copy can drift.
 * A redirect rather than a second rendering. Deliberately TEMPORARY (302):
 * browsers do not cache it, so a standalone refund page can replace it later
 * without visitors being stuck on a cached redirect.
 * Runs on the server for a direct hit and on the client for a footer click.
 */
export function guard(): never {
  throw redirect(LEGAL_PAGE_HREFS.returnPolicy, 302);
}
