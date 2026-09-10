import { redirect } from "vike/abort";
import { isSingleShopMode } from "#root/shared/config/app";

export async function guard(pageContext: Vike.PageContext) {
  if (pageContext.clientSession) {
    // In single-shop mode, only admins (and superadmins) go to dashboard
    if (isSingleShopMode()) {
      if (
        pageContext.clientSession.role === "admin" ||
        pageContext.clientSession.role === "superadmin"
      ) {
        throw redirect("/dashboard");
      }
      // All other roles (user, vendor) go to homepage
      throw redirect("/");
    }

    // Multi-vendor mode: redirect users to homepage, admin/vendor to dashboard
    if (pageContext.clientSession.role === "user") {
      throw redirect("/");
    }
    throw redirect("/dashboard");
  }
}
