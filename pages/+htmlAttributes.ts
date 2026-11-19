import type { PageContextServer } from "vike/types";
import { isArabicDocument } from "./document-locale";

/**
 * `<html dir="rtl">` in the server-rendered HTML for an Arabic Percé render,
 * so RTL layout does not wait for hydration. English renders no `dir`, as
 * before. Client-side changes stay with MinimalI18nProvider.
 */
export default function htmlAttributes(pageContext: PageContextServer) {
  return isArabicDocument(pageContext) ? { dir: "rtl" } : undefined;
}
