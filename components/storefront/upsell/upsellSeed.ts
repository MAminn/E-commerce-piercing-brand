/**
 * A random seed that lives for the browser session. Ported from Mach.
 *
 * Sent with every upsell request so the server's random order for a product
 * is the same each time this shopper opens it during the session — the
 * recommendations do not reshuffle on a reload or a back-navigation. A new
 * session gets a new order.
 *
 * Storage can be unavailable (private mode, blocked site data); the seed then
 * lives in memory for the page's lifetime, which is still stable for the
 * interaction that matters.
 */
const KEY = "perce-upsell-seed";
let memorySeed: string | null = null;

function freshSeed(): string {
  return Math.random().toString(36).slice(2, 12);
}

export function getUpsellSessionSeed(): string {
  try {
    const stored = window.sessionStorage.getItem(KEY);
    if (stored) return stored;
    const seed = freshSeed();
    window.sessionStorage.setItem(KEY, seed);
    return seed;
  } catch {
    memorySeed ??= freshSeed();
    return memorySeed;
  }
}
