import { redirect } from "vike/abort";
import { isAdminRole } from "#root/shared/auth/roles";

/**
 * Every /dashboard page inherits this guard. Only admins and superadmins get
 * in, whatever SINGLE_SHOP_MODE says: the multi-vendor branch that used to
 * let any non-"user" role through (e.g. a "vendor") failed open if the env
 * flag was ever missing. This store has no vendor dashboard.
 *
 * This is the page-level gate only — every admin tRPC procedure and REST
 * route enforces the role again server-side.
 */
export async function guard(pageContext: Vike.PageContext) {
  if (!pageContext.clientSession) {
    throw redirect("/login");
  }

  if (!isAdminRole(pageContext.clientSession.role)) {
    throw redirect("/");
  }
}
