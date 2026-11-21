import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Meta signs every webhook POST with `X-Hub-Signature-256: sha256=<hex>`,
 * the HMAC-SHA256 of the RAW request body keyed with the app secret.
 * Constant-time comparison; any malformed header is a failure.
 */
export function verifyMetaSignature(rawBody: Buffer, header: string | undefined | null, appSecret: string): boolean {
  if (!header || !appSecret) return false;
  const m = /^sha256=([0-9a-f]{64})$/i.exec(header.trim());
  if (!m) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const given = Buffer.from(m[1] as string, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function signForTest(rawBody: Buffer | string, appSecret: string): string {
  return `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
}

/** GET handshake: constant-time compare of hub.verify_token. */
export function verifyTokenMatches(given: unknown, expected: string | null): boolean {
  if (typeof given !== "string" || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
