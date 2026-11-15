/**
 * Who receives the store's "New order" notification.
 *
 * ORDER_NOTIFICATION_EMAILS is the dedicated recipient list, kept separate
 * from dashboard logins: an admin account's email is a sign-in identity, not
 * necessarily an inbox anyone reads (production's only admin login is on a
 * domain with no mail server, so every notification to it bounced).
 *
 *   • at least one valid address → exactly those addresses (lower-cased,
 *     de-duplicated); admin users are NOT looked up or added
 *   • unset / empty              → every `role = admin` user (the previous
 *     behaviour)
 *   • set, but no valid address  → every `role = admin` user, with a warning
 *
 * Everything here is pure (no I/O, no env reads) so it is unit-tested
 * directly; service.ts reads the env per order and does the lookup.
 */

export const ORDER_NOTIFICATION_EMAILS_ENV = "ORDER_NOTIFICATION_EMAILS" as const;

/** Commas, semicolons and any whitespace (spaces, tabs, newlines) separate entries. */
const SEPARATORS = /[\s,;]+/;

/**
 * A plain address only: dot-separated local-part atoms (no quotes, brackets,
 * colons or spaces) and a domain of at least two DNS labels with an
 * alphabetic TLD. Deliberately stricter than RFC 5322 — anything unusual is
 * rejected rather than handed to the mailer.
 */
const PLAIN_EMAIL_RE =
  /^[a-z0-9!#$%&*+/=?^_{|}~-]+(?:\.[a-z0-9!#$%&*+/=?^_{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * Peels the wrappers people (and Coolify) put around a value, repeatedly, so
 * `='"<mailto:Owner@Gmail.com>"'` → `Owner@Gmail.com`:
 *   • any number of leading "=" (Coolify sometimes stores one — see
 *     server/env-preload.cjs)
 *   • a matching pair of '…' or "…"
 *   • a matching pair of <…>
 *   • a leading `mailto:`
 */
function unwrap(value: string): string {
  let current = value.trim();
  for (;;) {
    let next = current.replace(/^=+/, "").trim();
    if (next.length >= 2) {
      const first = next.charAt(0);
      const last = next.charAt(next.length - 1);
      const inner = next.slice(1, -1);
      // Only a genuine pair: `'a@x.com';'b@y.com'` is two quoted entries, not one.
      if ((first === '"' || first === "'") && last === first && !inner.includes(first)) {
        next = inner.trim();
      } else if (first === "<" && last === ">" && !/[<>]/.test(inner)) {
        next = inner.trim();
      }
    }
    next = next.replace(/^mailto:/i, "").trim();
    if (next === current) return current;
    current = next;
  }
}

export interface ParsedNotificationEmails {
  /** Valid addresses, lower-cased, de-duplicated, in first-seen order. */
  emails: string[];
  /** How many non-empty entries were not a plain address. Never the values themselves. */
  invalidCount: number;
  /** Whether the raw value had any entry at all. */
  hasEntries: boolean;
}

export function parseNotificationEmails(raw: string | undefined | null): ParsedNotificationEmails {
  const emails: string[] = [];
  let invalidCount = 0;
  let hasEntries = false;
  // Unwrap the whole value first so a quoted list ("a@x.com, b@y.com") splits
  // cleanly; each entry is then unwrapped on its own.
  for (const part of unwrap(raw ?? "").split(SEPARATORS)) {
    const value = unwrap(part).toLowerCase();
    if (!value) continue;
    hasEntries = true;
    if (!PLAIN_EMAIL_RE.test(value)) {
      invalidCount += 1;
      continue;
    }
    if (!emails.includes(value)) emails.push(value);
  }
  return { emails, invalidCount, hasEntries };
}

export type NotificationRecipientSource =
  | { source: "env"; emails: string[]; invalidCount: number }
  | { source: "admin_users"; reason: "unset" | "no_valid_address"; invalidCount: number };

/** Decides where the recipient list comes from, before any database lookup. */
export function resolveNotificationRecipientSource(
  raw: string | undefined | null,
): NotificationRecipientSource {
  const { emails, invalidCount, hasEntries } = parseNotificationEmails(raw);
  if (emails.length > 0) return { source: "env", emails, invalidCount };
  return { source: "admin_users", reason: hasEntries ? "no_valid_address" : "unset", invalidCount };
}

/** "mu***@gmail.com" — for logs, so output never carries a full address. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  const local = at === -1 ? email : email.slice(0, at);
  const domain = at === -1 ? "" : email.slice(at + 1);
  const keep = local.length > 3 ? 2 : 1;
  return `${local.slice(0, keep)}***@${domain}`;
}

export function pluralEntries(count: number): string {
  return `${count} invalid entr${count === 1 ? "y" : "ies"}`;
}

/** The start-up line saying where new-order notifications will go. Addresses masked, invalid entries counted only. */
export function describeNotificationRecipients(raw: string | undefined | null): {
  level: "info" | "warn";
  message: string;
} {
  const resolved = resolveNotificationRecipientSource(raw);
  const prefix = "[OrderEmails] New-order notifications →";
  if (resolved.source === "env") {
    const ignored = resolved.invalidCount > 0 ? ` (${pluralEntries(resolved.invalidCount)} ignored)` : "";
    return {
      level: resolved.invalidCount > 0 ? "warn" : "info",
      message: `${prefix} ${ORDER_NOTIFICATION_EMAILS_ENV}: ${resolved.emails.map(maskEmail).join(", ")}${ignored}`,
    };
  }
  if (resolved.reason === "unset") {
    return {
      level: "info",
      message: `${prefix} every admin user (${ORDER_NOTIFICATION_EMAILS_ENV} not set)`,
    };
  }
  return {
    level: "warn",
    message: `${prefix} every admin user (${ORDER_NOTIFICATION_EMAILS_ENV} is set but has no valid address; ${pluralEntries(resolved.invalidCount)} ignored)`,
  };
}
