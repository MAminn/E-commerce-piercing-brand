import type { ScheduledEmailRow } from "#root/shared/database/drizzle/schema";
import type { EmailAutomationType } from "./queue/service";

export interface RenderedScheduledEmail {
  subject: string;
  html: string;
  /**
   * Extra headers merged into the outgoing message (e.g. a campaign id).
   * The RFC 8058 List-Unsubscribe / List-Unsubscribe-Post headers are added
   * by the worker unconditionally on top of these — a renderer cannot
   * accidentally omit them.
   */
  headers?: Record<string, string>;
}

export type ScheduledEmailRenderer = (
  row: ScheduledEmailRow,
  /** Absolute /unsubscribe?token=... link — renderers must place this visibly in the footer, not just rely on the header-level one-click support. */
  unsubscribeUrl: string,
) => Promise<RenderedScheduledEmail>;

// ─── Renderer registry ──────────────────────────────────────────────────────
// The worker (worker.ts) doesn't know how to build each automation's HTML —
// that's the email-template system's job (built in a later workstream). This
// registry is the seam between them: each automation type registers its own
// renderer here, and the worker just calls whatever's registered for the row
// it claimed. Missing/unregistered types fail loudly with a clear error
// instead of silently no-oping forever.

const renderers = new Map<EmailAutomationType, ScheduledEmailRenderer>();

export function registerEmailRenderer(
  type: EmailAutomationType,
  renderer: ScheduledEmailRenderer,
): void {
  renderers.set(type, renderer);
}

export async function renderScheduledEmail(
  row: ScheduledEmailRow,
  unsubscribeUrl: string,
): Promise<RenderedScheduledEmail> {
  const renderer = renderers.get(row.automationType);
  if (!renderer) {
    throw new Error(
      `No email renderer registered for automation type "${row.automationType}"`,
    );
  }
  return renderer(row, unsubscribeUrl);
}
