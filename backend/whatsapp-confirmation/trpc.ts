import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { t, adminProcedure, publicProcedure } from "#root/shared/trpc/server";
import { effectiveWhatsAppConfirmMode, readWhatsAppConfirmConfig } from "#root/shared/config/whatsapp-confirmation";
import { waOrderConfirmation } from "#root/shared/database/drizzle/schema";
import { buttonPayload } from "./payload";
import { checkoutOptInVisible } from "./eligibility";
import { processInboundEvent, recordInboundEvents } from "./store";
import {
  CONFIRMATION_FILTERS,
  getOrderTimeline,
  getOverview,
  listConfirmations,
  listReviewItems,
  resolveReviewItem,
  setDailyCap,
  setPaused,
} from "./queries";

/**
 * WhatsApp Confirmations admin API. Every procedure is admin-only; all but
 * `overview` refuse while the effective mode is `off`. Mutations write wa_*
 * tables only — staff change orders through the existing Orders screen.
 */
export const WA_OFF_MESSAGE = "WhatsApp confirmation is off";

function assertOn(): void {
  if (effectiveWhatsAppConfirmMode() === "off") throw new TRPCError({ code: "PRECONDITION_FAILED", message: WA_OFF_MESSAGE });
}

const actorOf = (ctx: { clientSession: { email: string } }) => ctx.clientSession.email;

/**
 * Superadmin-only, chained AFTER `.input()` on an adminProcedure: the shared
 * admin gate runs first (the tRPC authorization contract requires it on every
 * non-public procedure), then input validation, then this check. An admin who
 * is not superadmin still gets FORBIDDEN before the resolver runs.
 */
const requireSuperadmin = t.middleware(({ ctx, next }) => {
  const role = (ctx as { clientSession?: { role?: string } }).clientSession?.role;
  if (role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN", message: "Superadmin access required" });
  return next();
});

export const whatsappConfirmationRouter = t.router({
  /**
   * Public: should checkout show the WhatsApp opt-in for the phone typed so
   * far, and must it be ticked? Returns only { enabled, required } and never
   * touches the database. enabled: off / shadow → false; live → true; pilot →
   * true only for an allow-listed mobile number (see eligibility.ts).
   * required: enabled AND WHATSAPP_CHECKOUT_CONSENT_REQUIRED=true (a global
   * switch, so it reveals nothing more about the number than enabled does).
   * Showing the box is not consent — only the shopper's tick is.
   */
  checkoutOptIn: publicProcedure
    .input(z.object({ phone: z.string().max(40).optional() }).optional())
    .query(({ input }) => {
      const cfg = readWhatsAppConfirmConfig();
      const enabled = checkoutOptInVisible(effectiveWhatsAppConfirmMode(), cfg, input?.phone);
      return { enabled, required: enabled && cfg.checkoutConsent === "required" };
    }),

  overview: adminProcedure.query(async ({ ctx }) => {
    return await getOverview(effectiveWhatsAppConfirmMode() === "off" ? null : ctx.db);
  }),

  confirmations: adminProcedure
    .input(z.object({ filter: z.enum(CONFIRMATION_FILTERS).default("awaiting"), limit: z.number().int().min(1).max(300).optional() }))
    .query(async ({ ctx, input }) => {
      assertOn();
      return await listConfirmations(ctx.db, input.filter, input.limit);
    }),

  reviewItems: adminProcedure.input(z.object({ includeClosed: z.boolean().default(false) }).optional()).query(async ({ ctx, input }) => {
    assertOn();
    return await listReviewItems(ctx.db, input?.includeClosed ?? false);
  }),

  resolveReview: adminProcedure
    .input(z.object({ id: z.string().uuid(), status: z.enum(["in_progress", "done", "dismissed"]), note: z.string().trim().max(500).optional().nullable() }))
    .mutation(async ({ ctx, input }) => {
      assertOn();
      return await resolveReviewItem(ctx.db, { id: input.id, status: input.status, note: input.note ?? null, actor: actorOf(ctx) });
    }),

  timeline: adminProcedure.input(z.object({ orderId: z.string().uuid() })).query(async ({ ctx, input }) => {
    assertOn();
    return await getOrderTimeline(ctx.db, input.orderId);
  }),

  setPaused: adminProcedure.input(z.object({ paused: z.boolean() })).mutation(async ({ ctx, input }) => {
    assertOn();
    return await setPaused(ctx.db, input.paused, actorOf(ctx));
  }),

  setDailyCap: adminProcedure
    .input(z.object({ cap: z.number().int().min(1).max(10_000) }))
    .use(requireSuperadmin)
    .mutation(async ({ ctx, input }) => {
      assertOn();
      return await setDailyCap(ctx.db, input.cap, actorOf(ctx));
    }),

  /**
   * SHADOW ONLY — simulates the customer pressing a button, through the exact
   * webhook processing path. Shadow can never change an order, so this
   * exercises the decision, the review queue and the audit rows safely.
   */
  simulateReply: adminProcedure
    .input(z.object({ orderId: z.string().uuid(), action: z.enum(["confirm", "modify", "cancel"]) }))
    .use(requireSuperadmin)
    .mutation(async ({ ctx, input }) => {
      if (effectiveWhatsAppConfirmMode() !== "shadow") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Simulation is only available in shadow mode" });
      }
      const [conf] = await ctx.db.select().from(waOrderConfirmation).where(eq(waOrderConfirmation.orderId, input.orderId));
      if (!conf) throw new TRPCError({ code: "NOT_FOUND", message: "No WhatsApp confirmation for this order" });
      const wamid = `sim.${Date.now()}.${Math.random().toString(36).slice(2, 10)}`;
      const config = readWhatsAppConfirmConfig();
      const [ev] = await recordInboundEvents(ctx.db, [
        {
          kind: "button",
          eventKey: wamid,
          wamid,
          phoneNumberId: config.phoneNumberId,
          from: conf.phoneE164,
          userId: null,
          contextId: conf.outboundWamid,
          payload: buttonPayload(input.action, conf.token),
          text: `[simulated ${input.action}]`,
          raw: { simulated: true, by: actorOf(ctx) },
        },
      ]);
      if (!ev) return { result: "duplicate" };
      return { result: await processInboundEvent(ctx.db, ev, { mode: "shadow", config }) };
    }),
});
