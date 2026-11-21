import { describe, expect, it, vi } from "vitest";
import {
  parsePilotAllowlist,
  parseWhatsAppConfirmMode,
  readWhatsAppConfirmConfig,
  resolveEffectiveMode,
  sendingConfigProblems,
  SUPPORT_PHONE_NUMBER_ID,
  SUPPORT_WABA_ID,
} from "#root/shared/config/whatsapp-confirmation";
import { redactPhone, toWhatsAppRecipient } from "#root/shared/whatsapp/phone";
import { BUTTON_ORDER, buildTemplateMessage, buttonPayload, firstName, formatTotal, newConfirmationToken, parseButtonPayload } from "../payload";
import { signForTest, verifyMetaSignature, verifyTokenMatches } from "../signature";
import { isOptOutText, parseWebhookBody } from "../webhook-parse";
import { classifyGraphError, sendGraphMessage, type FetchLike } from "../graph-client";
import { decideResponse, type DecisionFacts } from "../decide";
import { backoffMs } from "../worker";
import { maySendTo } from "../store";

const FULL_ENV = {
  WHATSAPP_CONFIRM_MODE: "pilot",
  WHATSAPP_GRAPH_API_VERSION: "v27.0",
  WHATSAPP_PHONE_NUMBER_ID: "111222333444555",
  WHATSAPP_WABA_ID: "999888777666555",
  WHATSAPP_ACCESS_TOKEN: "EAA-test-not-real",
  WHATSAPP_APP_SECRET: "app-secret-test",
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: "verify-test",
  WHATSAPP_TEMPLATE_CONFIRM_NAME: "order_confirmation_ar",
  WHATSAPP_PILOT_ALLOWLIST: "01001234567, +201112223334, 0223456789, junk",
};

describe("config", () => {
  it("unknown / empty mode is off", () => {
    expect(parseWhatsAppConfirmMode(undefined)).toBe("off");
    expect(parseWhatsAppConfirmMode("LIVE")).toBe("live");
    expect(parseWhatsAppConfirmMode("on")).toBe("off");
  });

  it("allow-list keeps only Egyptian mobiles, normalised", () => {
    expect([...parsePilotAllowlist("201001234567,+201112223334 0223456789 junk")].sort()).toEqual(["201001234567", "201112223334"]);
  });

  it("a complete config has no sending problems", () => {
    expect(sendingConfigProblems(readWhatsAppConfirmConfig(FULL_ENV))).toEqual([]);
  });

  it("refuses the customer-support number and WABA as the sender", () => {
    const cfg = readWhatsAppConfirmConfig({ ...FULL_ENV, WHATSAPP_PHONE_NUMBER_ID: SUPPORT_PHONE_NUMBER_ID, WHATSAPP_WABA_ID: SUPPORT_WABA_ID });
    const p = sendingConfigProblems(cfg);
    expect(p).toContain("WHATSAPP_PHONE_NUMBER_ID is the support number");
    expect(p).toContain("WHATSAPP_WABA_ID is the support WABA");
  });

  it("effective mode: tables missing → off; pilot/live without config → shadow", () => {
    expect(resolveEffectiveMode("live", { tablesReady: false, sendingProblems: [] })).toBe("off");
    expect(resolveEffectiveMode("shadow", { tablesReady: true, sendingProblems: ["x"] })).toBe("shadow");
    expect(resolveEffectiveMode("pilot", { tablesReady: true, sendingProblems: ["x"] })).toBe("shadow");
    expect(resolveEffectiveMode("pilot", { tablesReady: true, sendingProblems: [] })).toBe("pilot");
    expect(resolveEffectiveMode("off", { tablesReady: true, sendingProblems: [] })).toBe("off");
  });
});

describe("phone", () => {
  it.each([
    ["01001234567", "201001234567"],
    ["+20 100 123 4567", "201001234567"],
    ["00201551234567", "201551234567"],
    ["٠١٢٢٣٤٥٦٧٨٩", "201223456789"],
    ["1112223334", "201112223334"],
  ])("%s → %s", (raw, out) => expect(toWhatsAppRecipient(raw)).toBe(out));

  it.each(["0223456789", "033456789", "0100123456", "010012345678", "", "abc", "+971501234567"])("rejects %s", (raw) => {
    expect(toWhatsAppRecipient(raw)).toBeNull();
  });

  it("redacts to the last 4 digits", () => {
    expect(redactPhone("201001234567")).toBe("…4567");
    expect(redactPhone(null)).toBe("…");
  });
});

describe("payload", () => {
  it("token is 22 url-safe chars and unique", () => {
    const a = newConfirmationToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(newConfirmationToken()).not.toBe(a);
  });

  it("button payload round-trips and rejects anything else", () => {
    const token = newConfirmationToken();
    for (const action of BUTTON_ORDER) expect(parseButtonPayload(buttonPayload(action, token))).toEqual({ action, token });
    expect(parseButtonPayload("wa1:z:" + token)).toBeNull();
    expect(parseButtonPayload("تأكيد الطلب")).toBeNull();
    expect(parseButtonPayload(`wa1:c:${token}; drop table`)).toBeNull();
    expect(parseButtonPayload(42)).toBeNull();
  });

  it("builds the confirm template: 3 body params, buttons in confirm/modify/cancel order, callback data", () => {
    const msg = buildTemplateMessage({
      kind: "confirm",
      to: "201001234567",
      templateName: "order_confirmation_ar",
      language: "ar",
      customerName: "  منى أحمد ",
      orderNumber: 10045,
      total: "1250.50",
      token: "TOKEN1234567890abcdef",
      callbackData: "outbox-id",
    }) as { template: { components: Array<{ type: string; index?: string; parameters: Array<{ text?: string; payload?: string }> }> }; biz_opaque_callback_data: string; to: string };
    expect(msg.to).toBe("201001234567");
    expect(msg.biz_opaque_callback_data).toBe("outbox-id");
    const [body, ...buttons] = msg.template.components;
    expect(body?.parameters.map((p) => p.text)).toEqual(["منى", "#10045", "1,250.5"]);
    expect(buttons.map((b) => [b.index, b.parameters[0]?.payload])).toEqual([
      ["0", "wa1:c:TOKEN1234567890abcdef"],
      ["1", "wa1:m:TOKEN1234567890abcdef"],
      ["2", "wa1:x:TOKEN1234567890abcdef"],
    ]);
  });

  it("reminder template has 2 body params", () => {
    const msg = buildTemplateMessage({ kind: "reminder", to: "201001234567", templateName: "r", language: "ar", customerName: "Ali", orderNumber: 1, total: "1", token: "TOKEN1234567890abcdef", callbackData: "x" }) as {
      template: { components: Array<{ parameters: unknown[] }> };
    };
    expect(msg.template.components[0]?.parameters).toHaveLength(2);
  });

  it("first name / total fall back safely", () => {
    expect(firstName("")).toBe("عميلنا");
    expect(firstName("Ali\tHassan")).toBe("Ali");
    expect(formatTotal("abc")).toBe("abc");
  });
});

describe("signature", () => {
  const body = Buffer.from(JSON.stringify({ entry: [] }));
  it("accepts the right HMAC and rejects everything else", () => {
    const sig = signForTest(body, "s3cret");
    expect(verifyMetaSignature(body, sig, "s3cret")).toBe(true);
    expect(verifyMetaSignature(body, sig, "other")).toBe(false);
    expect(verifyMetaSignature(Buffer.from("tampered"), sig, "s3cret")).toBe(false);
    expect(verifyMetaSignature(body, undefined, "s3cret")).toBe(false);
    expect(verifyMetaSignature(body, "sha256=zz", "s3cret")).toBe(false);
    expect(verifyMetaSignature(body, sig, "")).toBe(false);
  });
  it("verify token compare", () => {
    expect(verifyTokenMatches("abc", "abc")).toBe(true);
    expect(verifyTokenMatches("abd", "abc")).toBe(false);
    expect(verifyTokenMatches(undefined, "abc")).toBe(false);
    expect(verifyTokenMatches("abc", null)).toBe(false);
  });
});

const wrap = (value: Record<string, unknown>, field = "messages") => ({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA", changes: [{ field, value: { messaging_product: "whatsapp", metadata: { display_phone_number: "201503113922", phone_number_id: "PNID" }, ...value } }] }],
});

describe("webhook parse", () => {
  it("quick-reply button", () => {
    const [ev] = parseWebhookBody(
      wrap({
        contacts: [{ wa_id: "201001234567", user_id: "EG.123" }],
        messages: [{ from: "201001234567", id: "wamid.B1", type: "button", context: { id: "wamid.OUT" }, button: { payload: "wa1:c:TOKEN1234567890abcdef", text: "تأكيد الطلب" } }],
      }),
      "k",
    );
    expect(ev).toMatchObject({ kind: "button", wamid: "wamid.B1", from: "201001234567", userId: "EG.123", contextId: "wamid.OUT", phoneNumberId: "PNID", payload: "wa1:c:TOKEN1234567890abcdef" });
  });

  it("button without a phone number (BSUID only)", () => {
    const [ev] = parseWebhookBody(wrap({ contacts: [{ user_id: "EG.9" }], messages: [{ from_user_id: "EG.9", id: "wamid.B2", type: "button", button: { payload: "p", text: "t" } }] }), "k");
    expect(ev).toMatchObject({ kind: "button", from: null, userId: "EG.9" });
  });

  it("interactive button_reply is treated as a button", () => {
    const [ev] = parseWebhookBody(wrap({ messages: [{ from: "2010", id: "wamid.I", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "wa1:x:TOKEN1234567890abcdef", title: "إلغاء" } } }] }), "k");
    expect(ev).toMatchObject({ kind: "button", payload: "wa1:x:TOKEN1234567890abcdef" });
  });

  it("text message and status with error and callback data", () => {
    const evs = parseWebhookBody(
      wrap({
        messages: [{ from: "2010", id: "wamid.T", type: "text", text: { body: "عايز أغير العنوان" } }],
        statuses: [{ id: "wamid.OUT", status: "failed", recipient_id: "2010", biz_opaque_callback_data: "obx", errors: [{ code: 131026, title: "Message undeliverable" }] }],
      }),
      "k",
    );
    expect(evs[0]).toMatchObject({ kind: "message", text: "عايز أغير العنوان", eventKey: "wamid.T" });
    expect(evs[1]).toMatchObject({ kind: "status", status: "failed", eventKey: "wamid.OUT:failed", errorCode: "131026", callbackData: "obx" });
  });

  it("non-messages fields become `other` events; garbage yields nothing", () => {
    const evs = parseWebhookBody(wrap({ message_echoes: [] }, "smb_message_echoes"), "k");
    expect(evs[0]).toMatchObject({ kind: "other", field: "smb_message_echoes" });
    expect(parseWebhookBody("nope", "k")).toEqual([]);
    expect(parseWebhookBody({ entry: [{ changes: [{ field: "messages", value: { messages: [{ type: "text" }] } }] }] }, "k")).toEqual([]);
  });

  it("opt-out words", () => {
    expect(isOptOutText(" STOP ")).toBe(true);
    expect(isOptOutText("إيقاف")).toBe(true);
    expect(isOptOutText("stop sending me the wrong size")).toBe(false);
  });
});

describe("graph client", () => {
  const cfg = { apiVersion: "v27.0", phoneNumberId: "PNID", accessToken: "tok" };
  const reply = (status: number, body: unknown): FetchLike => async () => ({ status, text: async () => JSON.stringify(body) });

  it("sent", async () => {
    const fetchImpl = vi.fn(reply(200, { messages: [{ id: "wamid.X" }] }));
    expect(await sendGraphMessage(cfg, { a: 1 }, fetchImpl)).toEqual({ kind: "sent", wamid: "wamid.X" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).toBe("https://graph.facebook.com/v27.0/PNID/messages");
    expect(init.headers.Authorization).toBe("Bearer tok");
  });
  it("throttling retries; 5xx / generic errors are ambiguous (may have been accepted); bad number is permanent", async () => {
    expect((await sendGraphMessage(cfg, {}, reply(500, {}))).kind).toBe("ambiguous");
    expect((await sendGraphMessage(cfg, {}, reply(500, { error: { code: 131000 } }))).kind).toBe("ambiguous");
    expect((await sendGraphMessage(cfg, {}, reply(429, {}))).kind).toBe("retry");
    expect((await sendGraphMessage(cfg, {}, reply(400, { error: { code: 131056 } }))).kind).toBe("retry");
    expect((await sendGraphMessage(cfg, {}, reply(400, { error: { code: 130429 } }))).kind).toBe("retry");
    expect((await sendGraphMessage(cfg, {}, reply(400, { error: { code: 131026, message: "undeliverable" } })))).toMatchObject({ kind: "permanent", code: "131026" });
    expect(classifyGraphError(401, "190")).toBe("permanent");
  });
  it("timeout is ambiguous (never auto-retried); DNS failure is retryable", async () => {
    const timeout: FetchLike = async () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    };
    expect((await sendGraphMessage(cfg, {}, timeout)).kind).toBe("ambiguous");
    const dns: FetchLike = async () => {
      throw Object.assign(new Error("fetch failed"), { cause: { code: "ENOTFOUND" } });
    };
    expect((await sendGraphMessage(cfg, {}, dns)).kind).toBe("retry");
    expect((await sendGraphMessage(cfg, {}, reply(200, {}))).kind).toBe("ambiguous");
  });
});

describe("decideResponse", () => {
  const facts = (p: Partial<DecisionFacts> = {}): DecisionFacts => ({
    action: "confirm",
    canAct: true,
    orderStatus: "pending",
    archived: false,
    absLinked: false,
    current: { state: "sent", response: null, statusApplied: false },
    ...p,
  });

  it("confirm on a pending order applies pending → processing, no review", () => {
    expect(decideResponse(facts())).toMatchObject({ applyProcessing: true, newState: "confirmed", review: null, noop: false });
  });

  it("shadow / non-allow-listed: records, never applies", () => {
    expect(decideResponse(facts({ canAct: false }))).toMatchObject({ applyProcessing: false, skipReason: "shadow", wouldApply: "apply" });
  });

  it.each([
    ["processing", "not_pending", null],
    ["shipped", "order_shipped", "late_reply"],
    ["delivered", "order_delivered", "late_reply"],
    ["cancelled", "order_cancelled", "late_reply"],
  ] as const)("confirm on %s → no change (%s)", (status, reason, review) => {
    const d = decideResponse(facts({ orderStatus: status }));
    expect(d.applyProcessing).toBe(false);
    expect(d.skipReason).toBe(reason);
    expect(d.review?.type ?? null).toBe(review);
  });

  it("ABS-linked or archived orders are never changed", () => {
    expect(decideResponse(facts({ absLinked: true }))).toMatchObject({ applyProcessing: false, skipReason: "abs_linked" });
    expect(decideResponse(facts({ archived: true }))).toMatchObject({ applyProcessing: false, skipReason: "archived", review: { type: "late_reply" } });
  });

  it("duplicate press is a no-op", () => {
    expect(decideResponse(facts({ current: { state: "confirmed", response: "confirm", statusApplied: true } })).noop).toBe(true);
  });

  it("modify / cancel never change the order and open the right review", () => {
    for (const status of ["pending", "processing"] as const) {
      expect(decideResponse(facts({ action: "modify", orderStatus: status }))).toMatchObject({ applyProcessing: false, newState: "modify_requested", review: { type: "modify" } });
      expect(decideResponse(facts({ action: "cancel", orderStatus: status }))).toMatchObject({ applyProcessing: false, newState: "cancel_requested", review: { type: "cancel" } });
    }
    expect(decideResponse(facts({ action: "cancel", orderStatus: "shipped" })).review?.type).toBe("late_reply");
  });

  it("cancel after confirm says so; confirm after cancel goes to staff and still applies only if pending", () => {
    expect(decideResponse(facts({ action: "cancel", orderStatus: "processing", current: { state: "confirmed", response: "confirm", statusApplied: true } })).review?.detail).toMatch(/after confirming/);
    const d = decideResponse(facts({ current: { state: "cancel_requested", response: "cancel", statusApplied: false } }));
    expect(d).toMatchObject({ applyProcessing: true, review: { type: "late_reply" } });
  });

  it("missing order → unmatched", () => {
    expect(decideResponse(facts({ orderStatus: null })).review?.type).toBe("unmatched");
  });
});

describe("worker helpers", () => {
  it("backoff grows and caps", () => {
    expect([1, 2, 3, 4, 9].map(backoffMs)).toEqual([60_000, 300_000, 1_800_000, 7_200_000, 7_200_000]);
  });
  it("maySendTo: live everyone, pilot allow-list only, shadow never", () => {
    const cfg = { pilotAllowlist: new Set(["201001234567"]) };
    expect(maySendTo("live", cfg, "201111111111")).toBe(true);
    expect(maySendTo("pilot", cfg, "201001234567")).toBe(true);
    expect(maySendTo("pilot", cfg, "201111111111")).toBe(false);
    expect(maySendTo("shadow", cfg, "201001234567")).toBe(false);
    expect(maySendTo("live", cfg, null)).toBe(false);
  });
});
