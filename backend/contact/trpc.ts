import { z } from "zod";
import { publicProcedure, router } from "#root/shared/trpc/server";
import { Effect } from "effect";
import { EmailService } from "#root/shared/email/service";
import { getLayoutSettings } from "#root/backend/layout/get-layout-settings/index";
import { getStoreOwnerId } from "#root/shared/config/store";

const contactFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  email: z.string().email("Invalid email address").max(200),
  message: z.string().min(1, "Message is required").max(5000),
});

export const contactRouter = router({
  submit: publicProcedure
    .input(contactFormSchema)
    .mutation(async ({ ctx, input }) => {
      const { name, email, message } = input;

      // Get the contact email from layout settings
      const merchantId = getStoreOwnerId();
      const layoutSettings = await getLayoutSettings(merchantId, "landing-minimal");
      // The destination is admin-supplied and defaults to blank; a
      // whitespace-only value is just as unconfigured as an empty one, and
      // nodemailer would accept it and silently drop the message.
      const contactEmail = layoutSettings.header.contactEmail?.trim();

      if (!contactEmail) {
        return {
          success: false as const,
          error: "Contact email not configured. Please try again later.",
        };
      }

      // Build the email HTML
      const emailHtml = `
        <div style="font-family: 'Poppins', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <h2 style="font-size: 18px; font-weight: 600; margin-bottom: 24px; text-transform: uppercase; letter-spacing: 0.05em;">
            New Contact Form Submission
          </h2>
          <div style="border-top: 1px solid #e5e5e5; padding-top: 20px;">
            <p style="margin: 0 0 12px;"><strong>Name:</strong> ${name.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] || c))}</p>
            <p style="margin: 0 0 12px;"><strong>Email:</strong> ${email.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] || c))}</p>
            <p style="margin: 0 0 12px;"><strong>Message:</strong></p>
            <div style="background: #f5f5f5; padding: 16px; border-radius: 4px; white-space: pre-wrap;">${message.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] || c))}</div>
          </div>
          <p style="margin-top: 24px; font-size: 12px; color: #999;">
            You can reply directly to this email to respond to the customer.
          </p>
        </div>
      `;

      const storeName = process.env.VITE_STORE_NAME || "Store";

      /**
       * FAIL CLOSED.
       *
       * `sendEmail` reports failure on its SUCCESS channel — it resolves with
       * `{ success: false, error }` rather than rejecting, deliberately, so a
       * transactional send can never roll back the order that triggered it
       * (see the note on `SendEmailResult`). The dummy service installed when
       * SMTP is unconfigured does exactly that on every call: it logs
       * `[DUMMY EMAIL] Not sending…` and resolves `{ success: false }`.
       *
       * This handler used to ignore the returned value entirely and return
       * `{ success: true }` whenever the Effect did not fail. On an
       * unconfigured store — which is every store before SMTP is set up —
       * the contact form therefore told every customer "Your message has been
       * sent successfully!" while nothing left the building and no one was
       * notified. Nothing retried, and there is no other record of the
       * submission.
       *
       * The result is now inspected, so the storefront claims delivery only
       * when the real transport accepted the message.
       */
      try {
        const sendResult = await Effect.runPromise(
          Effect.gen(function* ($) {
            const emailService = yield* $(EmailService);
            return yield* $(
              emailService.sendEmail(
                contactEmail,
                `[${storeName}] New message from ${name}`,
                emailHtml,
              ),
            );
          }).pipe(
            Effect.provideService(EmailService, ctx.emailService),
          ),
        );

        if (!sendResult?.success) {
          // The reason is for the operator's log, not for the customer: it can
          // carry SMTP hostnames and credentials-related detail.
          console.error(
            "[Contact] Message not delivered:",
            sendResult?.error ?? "email service returned no result",
          );
          return {
            success: false as const,
            error: "Failed to send message. Please try again later.",
          };
        }

        return { success: true as const };
      } catch (error) {
        console.error("Failed to send contact form email:", error);
        return {
          success: false as const,
          error: "Failed to send message. Please try again later.",
        };
      }
    }),
});
