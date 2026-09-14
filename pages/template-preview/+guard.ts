import { redirect } from "vike/abort";

/**
 * `/template-preview` renders raw template components with mock data. It is an
 * internal design tool — the dashboard's Templates page opens it in a new tab
 * (components/template/TemplatePreview.tsx) so an admin can see a template
 * full-screen before selecting it.
 *
 * It had no guard, so anyone could enumerate every template and its mock
 * content by visiting `/template-preview?category=…&templateId=…`. That is
 * also how a previous brand's copy stayed reachable on the live site after it
 * had been removed from the storefront itself.
 *
 * Same guard as pages/dashboard/settings/links/+guard.ts — no new auth
 * mechanism, and admins following the dashboard link are already signed in,
 * so the preview workflow is unchanged.
 */
export async function guard(pageContext: Vike.PageContext) {
  if (!pageContext.clientSession) {
    throw redirect("/login");
  }

  if (
    pageContext.clientSession.role !== "admin" &&
    pageContext.clientSession.role !== "superadmin"
  ) {
    throw redirect("/");
  }
}
