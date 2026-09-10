import { usePageContext } from "vike-react/usePageContext";

/**
 * Reactive search params hook powered by Vike's usePageContext.
 * Unlike the old popstate-based implementation, this correctly updates
 * on Vike's client-side pushState navigations (e.g. clicking navbar category links).
 */
export function useSearchParams() {
  const pageContext = usePageContext();
  // pageContext.urlParsed.search is a plain Record<string, string> kept in sync
  // by Vike on every client-side navigation.
  const search = (pageContext.urlParsed as { search?: Record<string, string> })?.search ?? {};
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (typeof value === "string") params.set(key, value);
  }
  return params;
}
