import { db as createDb } from "#root/shared/database/drizzle/db";
import { effectiveWhatsAppConfirmMode, readWhatsAppConfirmConfig } from "#root/shared/config/whatsapp-confirmation";
import { enqueueConfirmation } from "./store";

let kick: () => void = () => {};

export function setWhatsAppWorkerKick(fn: () => void): void {
  kick = fn;
}

/**
 * Called by order creation AFTER the order committed (COD only).
 * Never throws and never blocks on Meta: it only writes wa_* rows; the
 * worker sends. In `off` mode it returns immediately without a query.
 */
export async function queueWhatsAppConfirmation(params: { orderId: string; whatsappOptIn: boolean }): Promise<void> {
  const mode = effectiveWhatsAppConfirmMode();
  if (mode === "off") return;
  try {
    const result = await enqueueConfirmation(createDb(), {
      orderId: params.orderId,
      whatsappOptIn: params.whatsappOptIn,
      mode,
      config: readWhatsAppConfirmConfig(),
    });
    if (result.outcome === "queued") kick();
  } catch (err) {
    console.error(`[WhatsApp confirm] enqueue failed for order ${params.orderId}: ${String((err as Error)?.message ?? err).slice(0, 200)}`);
  }
}
