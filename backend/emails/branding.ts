import { getLayoutSettings } from "#root/backend/layout/get-layout-settings/index";
import { getTemplateSelectionRaw } from "#root/backend/settings/get-template-selection-raw";
import { getEmailAutomationSettingsRaw } from "#root/backend/email-automations/settings-service";
import { db } from "#root/shared/database/drizzle/db";
import { getStoreOwnerId } from "#root/shared/config/store";
import {
  DEFAULT_STORE_NAME,
  STORE_NAME,
  STORE_CURRENCY,
  SUPPORT_EMAIL,
  STORE_SOCIAL_LINKS,
  STORE_URL,
  SUPPORT_WHATSAPP_DISPLAY,
  SUPPORT_WHATSAPP_URL,
  isUsableUrl,
} from "#root/shared/config/branding";
import { toAbsoluteUrl } from "#root/shared/config/site-url";
import { resolveLandingTemplateId } from "#root/shared/config/storefront";

export interface EmailBranding {
  storeName: string;
  logoUrl: string | undefined;
  contactEmail: string | undefined;
  currency: string;
  socialLinks: Array<{ platform: string; url: string }>;
  /** Absolute storefront URL, e.g. "https://perce-eg.com". */
  websiteUrl: string;
  /** The host shown as link text, e.g. "perce-eg.com". */
  websiteLabel: string;
  /** Customer-service WhatsApp: "+20 103 579 0911" and its wa.me link. */
  whatsappDisplay: string;
  whatsappUrl: string;
}

/** Fields that never depend on the CMS row. */
function staticBranding() {
  return {
    websiteUrl: STORE_URL,
    websiteLabel: websiteLabelFor(STORE_URL),
    whatsappDisplay: SUPPORT_WHATSAPP_DISPLAY,
    whatsappUrl: SUPPORT_WHATSAPP_URL,
  };
}

function websiteLabelFor(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Resolves branding values for email templates from layout settings.
 * Returns store name (from siteTitle or STORE_NAME env), logo URL, contact
 * email and currency. Every customer email uses the same brand templates
 * whatever navbar style the storefront has — nothing here depends on it.
 */
export async function getEmailBranding(): Promise<EmailBranding> {
  try {
    // Must match whatever the storefront is actually rendering (server/server.ts
    // and server/vike-handler.ts both resolve this the same way) — hardcoding
    // "landing-minimal" here pulled a different, possibly blank/stale row
    // whenever the admin had a different landing template active, which is
    // why the email logo could differ from (or 404 against) the real site header.
    const templateSelection = await getTemplateSelectionRaw(db());
    const activeLandingTemplate = resolveLandingTemplateId(templateSelection);
    const settings = await getLayoutSettings(getStoreOwnerId(), activeLandingTemplate);
    const storeName = resolveStoreName(settings.siteTitle);

    // Gmail, Outlook.com, and Yahoo all strip `data:` URI images out of HTML
    // emails (a known anti-phishing measure — they refuse to render an image
    // that can't be scanned/cached), leaving a broken-image icon where the
    // logo should be. So this must always resolve to a real fetchable URL —
    // relative uploads become absolute against PUBLIC_ORIGIN/BASE_URL, never
    // base64-embedded.
    // Admin can set a dedicated email logo (Marketing Emails > Automation
    // Settings) that takes priority over the site header logo — falls back
    // to the header logo below when unset, so nothing breaks for stores
    // that never touch this field.
    const automationSettings = await getEmailAutomationSettingsRaw();
    const rawLogoUrl = automationSettings.emailLogoUrl || settings.header.logoUrl;

    let logoUrl: string | undefined;
    if (rawLogoUrl && !rawLogoUrl.startsWith("data:")) {
      // Cache-bust: Gmail's image proxy fetched this exact URL (unchanged
      // since it's the same uploaded file) while it was still blocked by the
      // old same-origin CORP header, and caches that failure by URL. Adding
      // a query param forces every mail client to treat it as a URL it's
      // never seen, guaranteeing a fresh fetch against the now-fixed header.
      logoUrl = `${toAbsoluteUrl(rawLogoUrl)}?cb=corp-fix-20260811`;
    }

    return {
      storeName,
      logoUrl,
      // CMS value first, then the configured support inbox. Stays undefined
      // when neither exists so templates omit the contact line entirely
      // rather than printing a previous brand's address.
      contactEmail: resolveContactEmail(settings.header.contactEmail),
      currency: STORE_CURRENCY,
      // CMS links win; anything the admin hasn't filled in (empty or the
      // seeded "#" placeholder) is dropped rather than rendered as a dead
      // link. Falls back to the env-configured profiles, which are empty
      // until the new brand's accounts exist.
      socialLinks: resolveSocialLinks(settings.footer.socialLinks),
      ...staticBranding(),
    };
  } catch {
    return {
      storeName: resolveStoreName(undefined),
      logoUrl: undefined,
      contactEmail: resolveContactEmail(undefined),
      currency: STORE_CURRENCY,
      socialLinks: resolveSocialLinks(undefined),
      ...staticBranding(),
    };
  }
}

/*
 * Identity of the projects this codebase was copied from
 * (docs/CURRENT_PROJECT.md, "Relationship to previous brands"). Layout
 * settings rows can predate the rebrand, so a stored site title or contact
 * address may still carry one of them; nothing matching is ever emailed to a
 * customer. Kept server-side only so it never reaches the client bundle.
 *
 * perce-eg.com is NOT on these lists: it is Percé's current production
 * domain (owner-confirmed), so its addresses and name are valid.
 */

/** Previous brand names, matched as whole words in a store name. */
const PREVIOUS_BRAND_NAME_PATTERN =
  /\b(lebsy|lebsey|synt|zeli)\b|syntperfumes/i;

/**
 * Retired inboxes and domains. Addresses are matched exactly and domains by
 * the part after "@" (subdomains included) — never by the local part, so a
 * current-brand address that happens to contain an old word still works.
 */
const RETIRED_EMAIL_ADDRESSES = [
  "support@lebsy.com",
  "cs@lebsey.com",
  "syntperfumes@gmail.com",
];
const RETIRED_EMAIL_DOMAINS = [
  "syntperfumes.com",
  "lebsy.com",
  "lebsey.com",
];

function isRetiredEmail(email: string): boolean {
  const address = email.toLowerCase();
  const domain = address.slice(address.lastIndexOf("@") + 1);
  return (
    RETIRED_EMAIL_ADDRESSES.includes(address) ||
    RETIRED_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))
  );
}

/** CMS site title → STORE_NAME → the brand's own name, skipping blanks and previous brands. */
function resolveStoreName(cmsTitle: string | undefined): string {
  for (const candidate of [cmsTitle, STORE_NAME]) {
    const name = candidate?.trim();
    if (name && !PREVIOUS_BRAND_NAME_PATTERN.test(name)) return name;
  }
  return DEFAULT_STORE_NAME;
}

/**
 * CMS contact email → SUPPORT_EMAIL. Undefined when neither is a usable
 * current-brand address; there is deliberately no default inbox.
 */
function resolveContactEmail(cmsEmail: string | undefined): string | undefined {
  for (const candidate of [cmsEmail, SUPPORT_EMAIL]) {
    const email = candidate?.trim();
    if (email?.includes("@") && !isRetiredEmail(email)) return email;
  }
  return undefined;
}

/**
 * Normalises the two possible sources of social profiles into one list,
 * discarding placeholders. Returns an empty array when nothing is configured
 * — callers render no social row at all in that case.
 */
function resolveSocialLinks(
  cmsLinks: Array<{ platform: string; url: string }> | undefined,
): Array<{ platform: string; url: string }> {
  const fromCms = (cmsLinks ?? []).filter((s) => isUsableUrl(s.url));
  if (fromCms.length > 0) return fromCms.map((s) => ({ platform: s.platform, url: s.url }));
  return STORE_SOCIAL_LINKS.map((s) => ({ platform: s.platform, url: s.url }));
}
