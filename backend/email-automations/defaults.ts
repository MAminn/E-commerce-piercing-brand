import type { EmailAutomationSettings } from "#root/shared/database/drizzle/schema";

/**
 * workerEnabled defaults off and testModeEnabled defaults on, so a fresh
 * deploy (or a row that's never been saved) never sends real mail to a real
 * customer by accident — the admin has to opt in twice.
 */
export const DEFAULT_EMAIL_AUTOMATION_SETTINGS: EmailAutomationSettings = {
  workerEnabled: false,
  testModeEnabled: true,
  testModeEmail: "",
  emailLogoUrl: "",
};
