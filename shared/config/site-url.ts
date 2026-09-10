/**
 * Public site origin for absolute URLs (OG tags, webhooks, redirects).
 */
export function getPublicOrigin(): string {
  const fromProcess =
    typeof process !== "undefined" ? process.env.PUBLIC_ORIGIN || process.env.BASE_URL : undefined;
  const fromVite =
    typeof import.meta !== "undefined"
      ? (import.meta as { env?: Record<string, string> }).env?.PUBLIC_ORIGIN ||
        (import.meta as { env?: Record<string, string> }).env?.VITE_PUBLIC_ORIGIN
      : undefined;

  const origin = (fromProcess || fromVite || "http://localhost:5173").replace(/\/$/, "");
  return origin;
}

export function toAbsoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getPublicOrigin()}${normalized}`;
}
