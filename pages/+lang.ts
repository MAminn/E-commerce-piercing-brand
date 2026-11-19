import type { PageContext } from "vike/types";
import { isArabicDocument } from "./document-locale";

/** `<html lang>`: "ar" for an Arabic Percé render (see document-locale.ts), else vike-react's "en". */
export default function lang(pageContext: PageContext): string {
  return isArabicDocument(pageContext) ? "ar" : "en";
}
