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
      const contactEmail = layoutSettings.header.contactEmail;

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

      try {
        await Effect.runPromise(
          Effect.gen(function* ($) {
            const emailService = yield* $(EmailService);
            yield* $(
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
