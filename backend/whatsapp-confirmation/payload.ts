import { randomBytes } from "node:crypto";
import type { WaButtonAction, WaOutboxKind } from "./types";

/**
 * Builders for the Cloud API template messages and the quick-reply button
 * payload format. Pure — no I/O — so the exact bytes the worker would send
 * are unit-testable and are what shadow mode stores.
 *
 * Templates (created in WhatsApp Manager, category UTILITY, language `ar`):
 *   confirm  — body {{1}} first name, {{2}} order number, {{3}} total;
 *              buttons (quick reply, in this order): تأكيد الطلب / تعديل بيانات الطلب / إلغاء الطلب
 *   reminder — body {{1}} first name, {{2}} order number; same three buttons.
 * The button ORDER is part of the contract: index 0 = confirm, 1 = modify, 2 = cancel.
 */

export const BUTTON_ORDER: readonly WaButtonAction[] = ["confirm", "modify", "cancel"];
const ACTION_CODE: Record<WaButtonAction, string> = { confirm: "c", modify: "m", cancel: "x" };
const CODE_ACTION: Record<string, WaButtonAction> = { c: "confirm", m: "modify", x: "cancel" };

/** 128 random bits, base64url (22 chars). */
export function newConfirmationToken(): string {
  return randomBytes(16).toString("base64url");
}

export function buttonPayload(action: WaButtonAction, token: string): string {
  return `wa1:${ACTION_CODE[action]}:${token}`;
}

/** `wa1:c:<token>` → { action, token }; anything else → null. */
export function parseButtonPayload(raw: unknown): { action: WaButtonAction; token: string } | null {
  if (typeof raw !== "string") return null;
  const m = /^wa1:([cmx]):([A-Za-z0-9_-]{16,64})$/.exec(raw.trim());
  if (!m) return null;
  const action = CODE_ACTION[m[1] as string];
  return action ? { action, token: m[2] as string } : null;
}

/** First word of the customer's name, trimmed to something a template accepts. */
export function firstName(fullName: string | null | undefined): string {
  const first = (fullName ?? "").trim().split(/\s+/)[0] ?? "";
  // Template parameters may not contain newlines/tabs or 4+ consecutive spaces.
  const clean = first.replace(/[\n\r\t]/g, " ").slice(0, 40);
  return clean || "عميلنا";
}

/** "1250.50" → "1,250.5"; never NaN in a customer message. */
export function formatTotal(total: string | number): string {
  const n = typeof total === "number" ? total : Number(total);
  if (!Number.isFinite(n)) return String(total);
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export interface TemplateInput {
  kind: WaOutboxKind;
  to: string;
  templateName: string;
  language: string;
  customerName: string;
  orderNumber: number | null;
  total: string;
  token: string;
  /** Echoed by Meta in status webhooks — lets us recover the wamid of an ambiguous send. */
  callbackData: string;
}

export function buildTemplateMessage(input: TemplateInput): Record<string, unknown> {
  const orderRef = input.orderNumber ? `#${input.orderNumber}` : "";
  const bodyParams =
    input.kind === "confirm"
      ? [firstName(input.customerName), orderRef, formatTotal(input.total)]
      : [firstName(input.customerName), orderRef];
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.to,
    type: "template",
    biz_opaque_callback_data: input.callbackData,
    template: {
      name: input.templateName,
      language: { code: input.language },
      components: [
        { type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) },
        ...BUTTON_ORDER.map((action, index) => ({
          type: "button",
          sub_type: "quick_reply",
          index: String(index),
          parameters: [{ type: "payload", payload: buttonPayload(action, input.token) }],
        })),
      ],
    },
  };
}
