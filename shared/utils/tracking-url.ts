/**
 * Query parameters that can carry customer PII. They are removed from every
 * URL before it reaches a pixel, the /api/track beacon, the `tracking_event`
 * table or a server-side Conversions API payload (`event_source_url`).
 *
 * The checkout used to put the customer's email on the order-confirmation URL
 * (`/order-confirmation?…&email=…`); every event fired on that page then sent
 * it to Meta, GA4 and Clarity. The URL no longer carries it, and this list is
 * the defence in depth for old links and anything added later.
 * Names are compared case-insensitively.
 */
export const PII_QUERY_PARAMS: readonly string[] = [
  "email",
  "e",
  "em",
  "customer_email",
  "customeremail",
  "phone",
  "ph",
  "tel",
  "mobile",
  "customer_phone",
  "customerphone",
  "name",
  "fn",
  "ln",
  "first_name",
  "last_name",
  "customer_name",
  "customername",
  "address",
];

const PII_SET = new Set(PII_QUERY_PARAMS);

/**
 * The URL with every PII query parameter removed; everything else (path,
 * other params such as utm_* / fbclid / id / total, the fragment) unchanged.
 * Relative URLs stay relative. Input that cannot be parsed is returned as is
 * when it has no query string, and stripped of its query string otherwise.
 */
export function sanitizeTrackingUrl(url: string): string;
export function sanitizeTrackingUrl(url: string | undefined): string | undefined;
export function sanitizeTrackingUrl(url: string | undefined): string | undefined {
  if (!url || !url.includes("?")) return url;

  const isAbsolute = /^[a-z][a-z0-9+.-]*:/i.test(url);
  let parsed: URL;
  try {
    parsed = new URL(url, "http://relative.invalid");
  } catch {
    const cut = url.indexOf("?");
    return url.slice(0, cut);
  }

  let removed = false;
  for (const key of [...parsed.searchParams.keys()]) {
    if (PII_SET.has(key.toLowerCase())) {
      parsed.searchParams.delete(key);
      removed = true;
    }
  }
  if (!removed) return url;

  if (isAbsolute) return parsed.toString();
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
