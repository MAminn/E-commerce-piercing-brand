import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Bearer-token check for the ERP export API.
 *
 * The ERP pulls from this store with one shared secret (`ERP_SYNC_TOKEN`).
 * There is no user, no session and no role behind it: the token grants
 * read-only access to the export endpoints and nothing else.
 *
 * Both sides are hashed before the constant-time compare so the comparison
 * does not leak the token's length either.
 */
export const MIN_ERP_TOKEN_LENGTH = 32;

/** The configured token, or null when the export API must stay disabled. */
export function configuredErpToken(env: NodeJS.ProcessEnv = process.env): string | null {
  const token = env.ERP_SYNC_TOKEN?.trim();
  if (!token) return null;
  // A short token is treated as "not configured": a guessable secret on a
  // public endpoint that returns order data is worse than no endpoint at all.
  if (token.length < MIN_ERP_TOKEN_LENGTH) return null;
  return token;
}

export function bearerTokenOf(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match?.[1]?.trim() || null;
}

export function erpTokenMatches(supplied: string | null, expected: string): boolean {
  if (!supplied) return false;
  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
