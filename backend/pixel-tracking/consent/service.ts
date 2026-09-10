import { query } from "#root/shared/database/drizzle/db";
import { trackingConsent } from "#root/shared/database/drizzle/schema";
import { eq, desc, and } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { v7 } from "uuid";
import { ServerError } from "#root/shared/error/server";
import type {
  ConsentCategories,
  ConsentMethodType,
  ConsentState,
} from "#root/shared/types/pixel-tracking";

// ─── Schemas ────────────────────────────────────────────────────────────────

const consentCategorySchema = z.object({
  functional: z.boolean().default(true),
  analytics: z.boolean().default(false),
  marketing: z.boolean().default(false),
});

const consentMethodSchema = z.enum([
  "banner_accept",
  "banner_reject",
  "settings_page",
  "implied",
]);

export const recordConsentSchema = z.object({
  sessionId: z.string().min(1),
  userId: z.string().uuid().optional(),
  consentGiven: z.boolean(),
  consentCategories: consentCategorySchema,
  consentMethod: consentMethodSchema,
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
});

export const updateConsentSchema = z.object({
  sessionId: z.string().min(1),
  userId: z.string().uuid().optional(),
  consentCategories: consentCategorySchema,
  consentMethod: consentMethodSchema,
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
});

export type RecordConsentInput = z.infer<typeof recordConsentSchema>;
export type UpdateConsentInput = z.infer<typeof updateConsentSchema>;

// ─── Constants ──────────────────────────────────────────────────────────────

/** Consent is valid for 12 months from the date it was given. */
const CONSENT_VALIDITY_MS = 365 * 24 * 60 * 60 * 1000;

// ─── Default Consent State ──────────────────────────────────────────────────

/**
 * Default consent state — only functional tracking is allowed.
 * This is the state before the user interacts with the consent banner.
 */
export function getDefaultConsentState(): ConsentState {
  return {
    given: false,
    categories: {
      functional: true,
      analytics: false,
      marketing: false,
    },
    method: "implied",
    expiresAt: null,
  };
}

/**
 * Build a ConsentState where all categories are accepted.
 */
export function buildAcceptAllConsent(method: ConsentMethodType): ConsentState {
  return {
    given: true,
    categories: {
      functional: true,
      analytics: true,
      marketing: true,
    },
    method,
    expiresAt: new Date(Date.now() + CONSENT_VALIDITY_MS),
  };
}

/**
 * Build a ConsentState where only functional is allowed (reject marketing & analytics).
 */
export function buildRejectAllConsent(method: ConsentMethodType): ConsentState {
  return {
    given: true, // User has made a choice, even if it's to reject
    categories: {
      functional: true,
      analytics: false,
      marketing: false,
    },
    method,
    expiresAt: new Date(Date.now() + CONSENT_VALIDITY_MS),
  };
}

/**
 * Check whether a consent state has expired.
 */
export function isConsentExpired(state: ConsentState): boolean {
  if (!state.expiresAt) return false; // No expiry = not expired
  return new Date() > new Date(state.expiresAt);
}

/**
 * Determines which pixel platforms should fire based on consent categories.
 */
export function getAllowedPlatforms(
  categories: ConsentCategories,
): { analytics: boolean; marketing: boolean } {
  return {
    analytics: categories.analytics,
    marketing: categories.marketing,
  };
}

// ─── Cookie Name Constants ──────────────────────────────────────────────────

export const CONSENT_COOKIE_NAME = "_tracking_consent";

/**
 * Serialize consent state for cookie storage.
 */
export function serializeConsentCookie(state: ConsentState): string {
  return JSON.stringify({
    g: state.given ? 1 : 0,
    a: state.categories.analytics ? 1 : 0,
    m: state.categories.marketing ? 1 : 0,
    mt: state.method,
    ex: state.expiresAt ? new Date(state.expiresAt).getTime() : null,
  });
}

/**
 * Deserialize consent state from cookie.
 */
export function deserializeConsentCookie(
  cookieValue: string,
): ConsentState | null {
  try {
    const data = JSON.parse(cookieValue);
    return {
      given: data.g === 1,
      categories: {
        functional: true, // Always true
        analytics: data.a === 1,
        marketing: data.m === 1,
      },
      method: data.mt || "implied",
      expiresAt: data.ex ? new Date(data.ex) : null,
    };
  } catch {
    return null;
  }
}

// ─── DB Service Functions ───────────────────────────────────────────────────

/**
 * Record a consent decision to the audit log (append-only).
 */
export function recordConsent(input: RecordConsentInput) {
  return Effect.gen(function* () {
    const id = v7();
    const expiresAt = input.consentGiven
      ? new Date(Date.now() + CONSENT_VALIDITY_MS)
      : null;

    const rows = yield* query((db) =>
      db
        .insert(trackingConsent)
        .values({
          id,
          sessionId: input.sessionId,
          userId: input.userId ?? null,
          consentGiven: input.consentGiven,
          consentCategories: input.consentCategories,
          consentMethodType: input.consentMethod,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
          expiresAt,
        })
        .returning(),
    );

    if (!rows[0]) {
      return yield* Effect.fail(
        new ServerError({ tag: "ConsentRecordError", message: "Failed to record consent" }),
      );
    }

    return rows[0];
  });
}

/**
 * Update consent via a new entry (consent is an append-only log).
 * Creates a new consent record — previous records are preserved for audit.
 */
export function updateConsent(input: UpdateConsentInput) {
  const consentGiven =
    input.consentCategories.analytics || input.consentCategories.marketing;

  return recordConsent({
    sessionId: input.sessionId,
    userId: input.userId,
    consentGiven,
    consentCategories: input.consentCategories,
    consentMethod: input.consentMethod,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });
}

/**
 * Get the latest consent record for a given session.
 */
export function getConsentBySession(sessionId: string) {
  return Effect.gen(function* () {
    const rows = yield* query((db) =>
      db
        .select()
        .from(trackingConsent)
        .where(eq(trackingConsent.sessionId, sessionId))
        .orderBy(desc(trackingConsent.createdAt))
        .limit(1),
    );

    return rows[0] ?? null;
  });
}

/**
 * Get the latest consent record for a given user.
 */
export function getConsentByUser(userId: string) {
  return Effect.gen(function* () {
    const rows = yield* query((db) =>
      db
        .select()
        .from(trackingConsent)
        .where(eq(trackingConsent.userId, userId))
        .orderBy(desc(trackingConsent.createdAt))
        .limit(1),
    );

    return rows[0] ?? null;
  });
}

/**
 * Get the full consent audit log for a user (all decisions, newest first).
 */
export function getConsentAuditLog(userId: string) {
  return Effect.gen(function* () {
    return yield* query((db) =>
      db
        .select()
        .from(trackingConsent)
        .where(eq(trackingConsent.userId, userId))
        .orderBy(desc(trackingConsent.createdAt)),
    );
  });
}

/**
 * Get the full consent audit log for a session.
 */
export function getConsentAuditLogBySession(sessionId: string) {
  return Effect.gen(function* () {
    return yield* query((db) =>
      db
        .select()
        .from(trackingConsent)
        .where(eq(trackingConsent.sessionId, sessionId))
        .orderBy(desc(trackingConsent.createdAt)),
    );
  });
}
