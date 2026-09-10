import { isEmailUnsubscribed as checkUnsubscribed } from "#root/backend/email-subscription/service";

/**
 * Send-time (not enqueue-time) unsubscribe check for marketing automations.
 * A 90-day win-back queued today must respect an unsubscribe that happens
 * next week — checking only at enqueue time would miss that.
 *
 * Transactional emails (order confirmation, password reset, etc) never call
 * this — they go out through the plain EmailService.sendEmail path, not the
 * queue, so they're unaffected by marketing unsubscribes by construction.
 */
export async function isEmailUnsubscribed(email: string): Promise<boolean> {
  return checkUnsubscribed(email);
}
