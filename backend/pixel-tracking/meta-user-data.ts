import { createHash } from "node:crypto";
import {
  normalizeMetaIdentity,
  type HashedMetaUserData,
  type MetaHashedKey,
  type MetaIdentityInput,
} from "#root/shared/tracking/meta-user-data";

/** Lowercase hex SHA-256 of an already-normalised value. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Normalise (shared/tracking/meta-user-data.ts) and SHA-256 every field Meta
 * expects hashed. Raw values exist only inside this call; the result holds
 * digests only and is safe to attach to a CAPI relay copy.
 */
export function hashMetaIdentity(input: MetaIdentityInput): HashedMetaUserData {
  const out: HashedMetaUserData = {};
  for (const [key, value] of Object.entries(normalizeMetaIdentity(input)) as Array<[MetaHashedKey, string]>) {
    out[key] = sha256Hex(value);
  }
  return out;
}

/** The signed-in shopper as the auth middleware exposes it (request.clientSession). */
export interface SessionIdentitySource {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
}

/**
 * Hashed em / ph / fn / ln from a signed-in account — data the customer
 * supplied when registering. Null when nobody is signed in or nothing
 * normalises.
 */
export function hashSessionIdentity(session: SessionIdentitySource | null | undefined): HashedMetaUserData | null {
  if (!session) return null;
  const hashed = hashMetaIdentity({ email: session.email, phone: session.phone, name: session.name });
  return Object.keys(hashed).length > 0 ? hashed : null;
}
