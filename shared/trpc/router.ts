import { updateProfileProcedure } from "#root/backend/auth/update-profile/trpc.js";
import { changePasswordProcedure } from "#root/backend/auth/change-password/trpc.js";
import { meProcedure } from "#root/backend/auth/me/trpc.js";
import { categoriesRouter } from "#root/backend/categories/trpc";
import { fileRouter } from "#root/backend/file/trpc";
import { orderRouter } from "#root/backend/orders/trpc";
import { productRouter } from "#root/backend/products/trpc";
import { promoCodesRouter } from "#root/backend/promo-codes/trpc";
import { homepageRouter } from "#root/backend/homepage/trpc";
import { layoutRouter } from "#root/backend/layout/trpc";
import { pixelTrackingRouter } from "#root/backend/pixel-tracking/trpc";
import { paymentRouter } from "#root/backend/payments/trpc";
import { settingsRouter } from "#root/backend/settings/trpc";
import { analyticsRouter } from "#root/backend/analytics/trpc";
import { contactRouter } from "#root/backend/contact/trpc";
import { usersRouter } from "#root/backend/users/trpc";
import { offersRouter } from "#root/backend/offers/trpc";
import { emailSubscriptionRouter } from "#root/backend/email-subscription/trpc";
import { emailTemplatesRouter } from "#root/backend/email-automations/templates/trpc";
import { popupRouter } from "#root/backend/popup/trpc";
import { cartCaptureRouter } from "#root/backend/cart-capture/trpc";
import { broadcastRouter } from "#root/backend/email-automations/broadcast/trpc";
import { emailAutomationSettingsRouter } from "#root/backend/email-automations/settings-trpc";
import { emailQueueRouter } from "#root/backend/email-automations/queue/trpc";
import { typographyRouter } from "#root/backend/typography/trpc";
import { publicProcedure, router, t } from "./server";

const authRouter = t.router({
  me: meProcedure,
  updateProfile: updateProfileProcedure,
  changePassword: changePasswordProcedure,
});

export const appRouter = router({
  demo: publicProcedure.query(async () => {
    return { demo: true };
  }),
  auth: authRouter,
  category: categoriesRouter,
  product: productRouter,
  order: orderRouter,
  file: fileRouter,
  promoCode: promoCodesRouter,
  homepage: homepageRouter,
  layout: layoutRouter,
  pixelTracking: pixelTrackingRouter,
  payment: paymentRouter,
  settings: settingsRouter,
  analytics: analyticsRouter,
  contact: contactRouter,
  users: usersRouter,
  offer: offersRouter,
  emailSubscription: emailSubscriptionRouter,
  emailTemplates: emailTemplatesRouter,
  popup: popupRouter,
  cartCapture: cartCaptureRouter,
  broadcast: broadcastRouter,
  emailAutomationSettings: emailAutomationSettingsRouter,
  emailQueue: emailQueueRouter,
  typography: typographyRouter,
});

export type AppRouter = typeof appRouter;
