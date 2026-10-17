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
 * Brand: Percé (see docs/CURRENT_PROJECT.md and the Percé Brand Source of
 * Truth). Two spellings, deliberately:
 *   - "Percé"  — customer-facing (headings, metadata, emails, About copy)
 *   - "percé"  — the lowercase typographic wordmark
 *   - "perce"  — operational / ASCII-safe (slugs, keys, URLs, handles, files)
 * The misspelling with a trailing "e" is never correct anywhere.
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

/** The brand's own name — what STORE_NAME is when nothing overrides it. */
export const DEFAULT_STORE_NAME = "Percé";

/** Customer-facing brand name, with the accent. Override with VITE_STORE_NAME. */
export const STORE_NAME =
  readEnv("VITE_STORE_NAME", "STORE_NAME") ?? DEFAULT_STORE_NAME;

/**
 * The typographic wordmark — lowercase, no icon, no monogram. Used wherever
 * the brand is *drawn* rather than *named* (header, footer, coming-soon,
 * email masthead when no logo image is uploaded).
 */
export const BRAND_WORDMARK =
  readEnv("VITE_BRAND_WORDMARK", "BRAND_WORDMARK") ?? "percé";

/**
 * ASCII-safe operational form for identifiers, config keys, filenames,
 * URLs, handles and code symbols. Never shown to customers as the brand.
 */
export const BRAND_SLUG = "perce";

/** Brand line. Not a slogan to repeat everywhere — one line, used sparingly. */
export const BRAND_LINE =
  readEnv("VITE_BRAND_LINE", "BRAND_LINE") ?? "Made to mix.";

/** Market. The store sells in and delivers across Egypt only. */
export const STORE_COUNTRY_CODE = "EG";
export const STORE_COUNTRY_NAME = "Egypt";

/**
 * BCP-47 locale used for number/currency formatting. Prices are formatted
 * through shared/pricing/format-money.ts — never by hand.
 */
export const STORE_LOCALE = "en-EG";

/**
 * Default meta description / social preview copy.
 *
 * This is the Brand Source of Truth's *safer* subheading. The preferred one
 * ("Piercing jewellery, photographed properly, delivered across Egypt.")
 * claims photography coverage that has not been verified against the live
 * catalogue — switch to it via VITE_STORE_DESCRIPTION once it is. It makes
 * no claim about materials, returns, or hypoallergenic properties.
 */
export const STORE_DESCRIPTION =
  readEnv("VITE_STORE_DESCRIPTION", "STORE_DESCRIPTION") ??
  "Piercing jewellery, delivered across Egypt.";

/**
 * ISO 4217 currency code. Egyptian pound. Catalogue prices are stored and
 * charged as EGP amounts — this is the label, never an FX conversion.
 * Override with VITE_CURRENCY only for a store that genuinely trades in
 * another currency.
 */
export const STORE_CURRENCY = readEnv("VITE_CURRENCY", "CURRENCY") ?? "EGP";

/**
 * Customer-facing support address — the owner-confirmed Percé inbox.
 * Override per environment with VITE_SUPPORT_EMAIL. Also the Reply-To of
 * every outgoing email (see shared/email/from-env.ts).
 */
export const DEFAULT_SUPPORT_EMAIL = "piercingperce@gmail.com";
export const SUPPORT_EMAIL =
  readEnv("VITE_SUPPORT_EMAIL", "SUPPORT_EMAIL") ?? DEFAULT_SUPPORT_EMAIL;

/**
 * Customer-service WhatsApp number (owner-confirmed), in E.164 form.
 * Override with VITE_SUPPORT_WHATSAPP. The display form and the wa.me link
 * are both derived from it, so there is one number, never two that drift.
 */
export const SUPPORT_WHATSAPP_E164 =
  readEnv("VITE_SUPPORT_WHATSAPP", "SUPPORT_WHATSAPP") ?? "+201035790911";

/** "+201035790911" → "+20 103 579 0911" (Egyptian mobile grouping). */
export function formatWhatsAppNumber(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  const match = /^20(\d{3})(\d{3})(\d{4})$/.exec(digits);
  return match ? `+20 ${match[1]} ${match[2]} ${match[3]}` : `+${digits}`;
}

export const SUPPORT_WHATSAPP_DISPLAY = formatWhatsAppNumber(SUPPORT_WHATSAPP_E164);
export const SUPPORT_WHATSAPP_URL = `https://wa.me/${SUPPORT_WHATSAPP_E164.replace(/\D/g, "")}`;

/**
 * The live production storefront (owner-confirmed). Used whenever no
 * environment says otherwise, so customer emails always link to the real
 * shop. Staging/dev environments set PUBLIC_ORIGIN and link to themselves.
 */
export const PRODUCTION_STORE_URL = "https://perce-eg.com";

/**
 * Canonical public URL of the storefront. Falls back to PUBLIC_ORIGIN/BASE_URL
 * (the same values `shared/config/site-url.ts` uses) so there is one origin,
 * not two that can drift, and finally to the production domain.
 *
 * Only absolute http(s) values count: under Vite `import.meta.env.BASE_URL`
 * is the bundle's base PATH ("/"), which must never be taken for an origin.
 */
function readAbsoluteUrl(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = readEnv(key);
    if (value && /^https?:\/\//i.test(value)) return value.replace(/\/+$/, "");
  }
  return undefined;
}

export const STORE_URL =
  readAbsoluteUrl("VITE_STORE_URL", "STORE_URL", "PUBLIC_ORIGIN", "BASE_URL") ??
  PRODUCTION_STORE_URL;

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
