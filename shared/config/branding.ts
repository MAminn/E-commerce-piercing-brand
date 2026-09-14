/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH FOR BRAND IDENTITY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every piece of runtime code that needs the store's name, description, support
 * address, public URL or social profiles reads it from here — never from a
 * hardcoded string. Changing the brand is therefore a change to this file's
 * defaults (or, preferably, to environment variables) and nothing else.
 *
 * Resolution order for every value:
 *   1. import.meta.env.VITE_*   (client bundle + Vite SSR)
 *   2. process.env.VITE_*       (Node server, unbuilt/compiled)
 *   3. process.env.*            (server-only alias, no VITE_ prefix)
 *   4. the working default below
 *
 * The CMS can still override the *displayed* name per-store via Layout
 * Settings (`siteTitle` / `header.logoText` / `footer.logoText`); these values
 * are the fallback used whenever the CMS field is empty, plus the source for
 * anything the CMS doesn't model (support email, social profiles).
 *
 * Working brand name: ZELI (see docs/CURRENT_PROJECT.md).
 */

function readEnv(...keys: string[]): string | undefined {
  const viteEnv =
    typeof import.meta !== "undefined"
      ? ((import.meta as { env?: Record<string, string | undefined> }).env ??
        undefined)
      : undefined;
  const nodeEnv = typeof process !== "undefined" ? process.env : undefined;

  for (const key of keys) {
    const value = viteEnv?.[key] ?? nodeEnv?.[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return undefined;
}

// ─── Core identity ──────────────────────────────────────────────────────────

/** Display name of the store. Override with VITE_STORE_NAME. */
export const STORE_NAME =
  readEnv("VITE_STORE_NAME", "STORE_NAME") ?? "ZELI";

/**
 * Default meta description / social preview copy. Deliberately generic: it
 * makes no claim about materials, delivery, returns or hypoallergenic
 * properties, none of which are established yet. Override with
 * VITE_STORE_DESCRIPTION once the brand copy is finalised.
 */
export const STORE_DESCRIPTION =
  readEnv("VITE_STORE_DESCRIPTION", "STORE_DESCRIPTION") ??
  "Piercing jewelry, curated in Egypt.";

/** ISO-ish currency label used across pricing UI. Override with VITE_CURRENCY. */
export const STORE_CURRENCY = readEnv("VITE_CURRENCY", "CURRENCY") ?? "EGP";

/**
 * Customer-facing support address.
 *
 * Intentionally has NO default — there is no support inbox for the new brand
 * yet, and inventing one (or inheriting a previous brand's) would send real
 * customers to an address nobody reads. Callers must handle `undefined` by
 * omitting the contact line entirely. Set VITE_SUPPORT_EMAIL to enable it.
 */
export const SUPPORT_EMAIL = readEnv("VITE_SUPPORT_EMAIL", "SUPPORT_EMAIL");

/**
 * Canonical public URL of the storefront. Falls back to PUBLIC_ORIGIN/BASE_URL
 * (the same values `shared/config/site-url.ts` uses) so there is one origin,
 * not two that can drift.
 */
export const STORE_URL =
  readEnv("VITE_STORE_URL", "STORE_URL", "PUBLIC_ORIGIN", "BASE_URL")?.replace(
    /\/$/,
    "",
  ) ?? undefined;

// ─── Social profiles ────────────────────────────────────────────────────────

export type StoreSocialPlatform =
  | "instagram"
  | "facebook"
  | "tiktok"
  | "youtube"
  | "whatsapp";

export interface StoreSocialLink {
  platform: StoreSocialPlatform;
  /** Absolute URL. Only present when actually configured. */
  url: string;
}

/**
 * Social profiles for the CURRENT brand only.
 *
 * There are no defaults on purpose. The new brand's Instagram / Facebook /
 * TikTok accounts do not exist yet, and the previous brand's accounts are
 * historical assets that are NOT being reused — pointing customers at them
 * would send traffic to someone else's storefront. Anything not configured is
 * simply absent from this list, and callers hide the corresponding link.
 */
export const STORE_SOCIAL_LINKS: StoreSocialLink[] = (
  [
    ["instagram", readEnv("VITE_SOCIAL_INSTAGRAM", "SOCIAL_INSTAGRAM")],
    ["facebook", readEnv("VITE_SOCIAL_FACEBOOK", "SOCIAL_FACEBOOK")],
    ["tiktok", readEnv("VITE_SOCIAL_TIKTOK", "SOCIAL_TIKTOK")],
    ["youtube", readEnv("VITE_SOCIAL_YOUTUBE", "SOCIAL_YOUTUBE")],
    ["whatsapp", readEnv("VITE_SOCIAL_WHATSAPP", "SOCIAL_WHATSAPP")],
  ] as const
)
  .filter((entry): entry is [StoreSocialPlatform, string] =>
    isUsableUrl(entry[1]),
  )
  .map(([platform, url]) => ({ platform, url }));

/**
 * A URL is only usable if it's a real absolute link. `"#"` and `""` are the
 * placeholder values the CMS seeds, and rendering them produces a dead link
 * that looks like a broken brand — hide those instead.
 */
export function isUsableUrl(url: string | undefined | null): url is string {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (trimmed === "" || trimmed === "#") return false;
  return /^(https?:|mailto:|tel:)/i.test(trimmed);
}
