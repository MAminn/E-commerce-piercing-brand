import { redirect } from "vike/abort";

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
