/**
 * Flattens a Cloud API webhook body into the events this feature acts on.
 * Pure and defensive: unknown shapes become `other` events (stored, never
 * acted on). Phone numbers may be ABSENT (usernames / business-scoped user
 * ids are rolling out), so every consumer must work with `from === null`.
 */

export type ParsedEvent =
  | {
      kind: "button";
      eventKey: string;
      wamid: string;
      phoneNumberId: string | null;
      from: string | null;
      userId: string | null;
      contextId: string | null;
      payload: string;
      text: string | null;
      raw: unknown;
    }
  | {
      kind: "message";
      eventKey: string;
      wamid: string;
      phoneNumberId: string | null;
      from: string | null;
      userId: string | null;
      contextId: string | null;
      messageType: string;
      text: string | null;
      raw: unknown;
    }
  | {
      kind: "status";
      eventKey: string;
      wamid: string;
      phoneNumberId: string | null;
      status: string;
      recipient: string | null;
      callbackData: string | null;
      errorCode: string | null;
      errorTitle: string | null;
      raw: unknown;
    }
  | { kind: "other"; eventKey: string; field: string; phoneNumberId: string | null; raw: unknown };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const s = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

export function parseWebhookBody(body: unknown, fallbackKey: string): ParsedEvent[] {
  const out: ParsedEvent[] = [];
  const root = obj(body);
  if (!root) return out;
  let otherIndex = 0;
  for (const entry of arr(root.entry)) {
    for (const change of arr(obj(entry)?.changes)) {
      const c = obj(change);
      const field = s(c?.field) ?? "unknown";
      const value = obj(c?.value);
      const phoneNumberId = s(obj(value?.metadata)?.phone_number_id);
      if (field !== "messages" || !value) {
        out.push({ kind: "other", eventKey: `${fallbackKey}:${field}:${otherIndex++}`, field, phoneNumberId, raw: change });
        continue;
      }
      const contacts = arr(value.contacts).map(obj);
      for (const m of arr(value.messages)) {
        const msg = obj(m);
        const wamid = s(msg?.id);
        if (!msg || !wamid) continue;
        const from = s(msg.from);
        const contact = contacts.find((ct) => ct && (s(ct.wa_id) === from || from === null)) ?? null;
        const userId = s(msg.from_user_id) ?? s(contact?.user_id);
        const contextId = s(obj(msg.context)?.id);
        const type = s(msg.type) ?? "unknown";
        if (type === "button") {
          const b = obj(msg.button);
          const payload = s(b?.payload);
          if (payload) {
            out.push({ kind: "button", eventKey: wamid, wamid, phoneNumberId, from, userId, contextId, payload, text: s(b?.text), raw: msg });
            continue;
          }
        }
        if (type === "interactive") {
          const reply = obj(obj(msg.interactive)?.button_reply);
          const id = s(reply?.id);
          if (id) {
            out.push({ kind: "button", eventKey: wamid, wamid, phoneNumberId, from, userId, contextId, payload: id, text: s(reply?.title), raw: msg });
            continue;
          }
        }
        out.push({
          kind: "message",
          eventKey: wamid,
          wamid,
          phoneNumberId,
          from,
          userId,
          contextId,
          messageType: type,
          text: s(obj(msg.text)?.body),
          raw: msg,
        });
      }
      for (const st of arr(value.statuses)) {
        const status = obj(st);
        const wamid = s(status?.id);
        const state = s(status?.status);
        if (!status || !wamid || !state) continue;
        const err = obj(arr(status.errors)[0]);
        out.push({
          kind: "status",
          eventKey: `${wamid}:${state}`,
          wamid,
          phoneNumberId,
          status: state,
          recipient: s(status.recipient_id),
          callbackData: s(status.biz_opaque_callback_data),
          errorCode: err?.code !== undefined ? String(err.code) : null,
          errorTitle: s(err?.title) ?? s(err?.message),
          raw: status,
        });
      }
    }
  }
  return out;
}

/**
 * The whole message, after normalisation, must be one of these. Matching the
 * WHOLE message (never a word inside a sentence) keeps "stop sending the
 * wrong size" a question for staff, not an opt-out. Arabic forms are stored
 * normalised (hamza-free alef), see normaliseOptOutText.
 */
const OPT_OUT_PHRASES = new Set([
  "stop",
  "unsubscribe",
  // إيقاف — the word shown at checkout — and its common spellings.
  "ايقاف",
  "ايقاف الرسائل",
  "توقف",
  "الغاء الاشتراك",
]);

/**
 * Case, surrounding whitespace / punctuation / quotation marks / emoji,
 * invisible direction marks, tatweel, diacritics and alef-hamza variants do
 * not matter: «إيقاف», "STOP.", ' Stop! ' and ايـقاف all count.
 */
export function normaliseOptOutText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .replace(/[\u0640\u064B-\u065F\u0670]/g, "")
    .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627")
    .toLowerCase()
    .replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu, "")
    .replace(/\s+/g, " ");
}

/** Inbound text that means "stop messaging me" (Arabic / English). */
export function isOptOutText(text: string | null): boolean {
  if (!text) return false;
  return OPT_OUT_PHRASES.has(normaliseOptOutText(text));
}
