import type { FooterSettings } from "#root/shared/types/layout-settings";

/**
 * The store's public contact details, read from the active template's
 * Dashboard > Layout Settings > Footer Contact Info. The footer and /contact
 * both render from this, so they can never disagree about what is shown.
 *
 * Every field is optional: a blank value is absent, never a placeholder. In
 * particular no address is seeded or guessed — it renders only once an admin
 * types one.
 */
export interface StoreContact {
  phone?: { display: string; href: string };
  email?: { display: string; href: string };
  /** In the requested locale; Arabic falls back to the English text. */
  address?: string;
}

/**
 * `tel:` target for a phone number as typed by an admin ("010 3579 0911",
 * "+20 (10) 3579-0911"): keep a leading "+" and the digits, drop the rest.
 * Null when nothing dialable is left.
 */
export function telHref(phone: string): string | null {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits === "") return null;
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}

/** `mailto:` target, or null when the value is not shaped like an address. */
export function mailtoHref(email: string): string | null {
  const trimmed = email.trim();
  return /^[^\s@]+@[^\s@]+$/.test(trimmed) ? `mailto:${trimmed}` : null;
}

export function resolveStoreContact(
  footer: Pick<
    FooterSettings,
    "contactPhone" | "contactEmail" | "contactAddress" | "contactAddressAr"
  >,
  locale: "en" | "ar",
): StoreContact {
  const contact: StoreContact = {};

  const phone = footer.contactPhone?.trim() ?? "";
  const phoneTarget = phone ? telHref(phone) : null;
  if (phoneTarget) contact.phone = { display: phone, href: phoneTarget };

  const email = footer.contactEmail?.trim() ?? "";
  const emailTarget = email ? mailtoHref(email) : null;
  if (emailTarget) contact.email = { display: email, href: emailTarget };

  const en = footer.contactAddress?.trim() ?? "";
  const ar = footer.contactAddressAr?.trim() ?? "";
  const address = (locale === "ar" && ar) || en || ar;
  if (address) contact.address = address;

  return contact;
}

export function hasStoreContact(contact: StoreContact): boolean {
  return !!(contact.phone || contact.email || contact.address);
}
