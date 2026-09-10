/**
 * Store branding configuration.
 * All values are configurable via environment variables.
 * VITE_-prefixed vars are available on both server and client.
 */

export const STORE_NAME =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_STORE_NAME) ||
  process.env.VITE_STORE_NAME ||
  "SYNT";

export const STORE_CURRENCY =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_CURRENCY) ||
  process.env.VITE_CURRENCY ||
  "EGP";

export const STORE_DESCRIPTION =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_STORE_DESCRIPTION) ||
  process.env.VITE_STORE_DESCRIPTION ||
  "Premium fragrances inspired by the world's finest perfumes. Long-lasting, elegant, and made for every day.";
