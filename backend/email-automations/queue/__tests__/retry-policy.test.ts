import { describe, expect, it } from "vitest";
import {
  MAX_ATTEMPTS,
  TRANSACTIONAL_MAX_ATTEMPTS,
  TRANSACTIONAL_RETRY_POLICY,
  transactionalRetryDelayMs,
} from "#root/backend/email-automations/queue/service";

/**
 * Regression: order emails used the marketing policy — 5 attempts, one per
 * minute — so any SMTP outage longer than ~5 minutes (rate limit, quota,
 * a changed password) permanently lost every confirmation in that window.
 */
describe("transactional retry policy", () => {
  it("backs off from 1 minute to 12 hours", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(transactionalRetryDelayMs)).toEqual([
      60_000,
      5 * 60_000,
      15 * 60_000,
      60 * 60_000,
      3 * 60 * 60_000,
      6 * 60 * 60_000,
      12 * 60 * 60_000,
    ]);
    expect(transactionalRetryDelayMs(0)).toBe(60_000);
    expect(transactionalRetryDelayMs(99)).toBe(12 * 60 * 60_000);
  });

  it("rides out an outage of most of a day before giving up", () => {
    const totalWaitMs = Array.from({ length: TRANSACTIONAL_MAX_ATTEMPTS - 1 }, (_, i) =>
      transactionalRetryDelayMs(i + 1),
    ).reduce((a, b) => a + b, 0);
    expect(TRANSACTIONAL_MAX_ATTEMPTS).toBeGreaterThan(MAX_ATTEMPTS);
    expect(totalWaitMs).toBeGreaterThan(20 * 60 * 60_000);
    expect(TRANSACTIONAL_RETRY_POLICY.maxAttempts).toBe(TRANSACTIONAL_MAX_ATTEMPTS);
  });
});
