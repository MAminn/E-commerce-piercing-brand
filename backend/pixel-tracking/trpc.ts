import { t } from "#root/shared/trpc/server";
import { trackEventProcedure } from "./track-event/trpc";
import { pixelConfigRouter } from "./pixel-config/trpc";
import { eventDeliveryRouter } from "./event-delivery/trpc";
import { customEventsRouter } from "./custom-events/trpc";
import { attributionRouter } from "./attribution/trpc";
import { consentRouter } from "./consent/trpc";

export const pixelTrackingRouter = t.router({
  trackEvent: trackEventProcedure,
  config: pixelConfigRouter,
  events: eventDeliveryRouter,
  customEvents: customEventsRouter,
  attribution: attributionRouter,
  consent: consentRouter,
});
