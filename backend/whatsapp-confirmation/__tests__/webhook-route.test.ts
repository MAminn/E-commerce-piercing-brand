import Fastify from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The webhook ROUTE (not just the pure helpers): mode gate, GET handshake,
 * HMAC over the exact raw bytes, and the raw-body JSON parser staying inside
 * the WhatsApp plugin. The store and the database are mocked, so nothing is
 * written and Meta is never called. The mode is set through the in-process
 * boot status, never through WHATSAPP_CONFIRM_MODE.
 */

const store = vi.hoisted(() => ({
  recordInboundEvents: vi.fn(async (_db: unknown, events: unknown[]) => events),
  processInboundEvent: vi.fn(async () => "ok"),
}));
vi.mock("../store", () => store);
vi.mock("#root/shared/database/drizzle/db", () => ({ db: () => ({ fake: true }) }));

const SECRET = "route-test-secret";
const VERIFY = "route-test-verify";
const ENV_KEYS = ["WHATSAPP_APP_SECRET", "WHATSAPP_WEBHOOK_VERIFY_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"] as const;

/** Pretty-printed on purpose: re-serialising it would change the bytes, and so the signature. */
const RAW = `{
  "object": "whatsapp_business_account",
  "entry": [ { "id": "1", "changes": [ { "field": "messages", "value": {
    "metadata": { "phone_number_id": "100000000000001" },
    "messages": [ { "id": "wamid.ROUTE1", "from": "201009990001", "type": "text", "text": { "body": "hi" } } ]
  } } ] } ]
}`;

const flush = () => new Promise((r) => setImmediate(r));

describe("POST/GET /api/webhooks/whatsapp", () => {
  let cfg: typeof import("#root/shared/config/whatsapp-confirmation");
  let sign: (raw: string, secret: string) => string;
  const saved: Record<string, string | undefined> = {};

  async function app() {
    const { whatsappWebhookPlugin } = await import("../webhook");
    const instance = Fastify();
    await instance.register(whatsappWebhookPlugin, { prefix: "/api/webhooks/whatsapp" });
    // A sibling route on the parent: must keep Fastify's normal JSON parsing.
    instance.post("/api/other", async (req) => ({ isBuffer: Buffer.isBuffer(req.body), body: req.body }));
    await instance.ready();
    return instance;
  }

  const setMode = (mode: "off" | "shadow") =>
    cfg.setWhatsAppConfirmBootStatus({ requestedMode: mode, effectiveMode: mode, tablesReady: true, problems: [], checkedAt: new Date().toISOString() });

  beforeAll(async () => {
    cfg = await import("#root/shared/config/whatsapp-confirmation");
    sign = (await import("../signature")).signForTest;
    for (const k of ENV_KEYS) saved[k] = process.env[k];
  });

  beforeEach(() => {
    process.env.WHATSAPP_APP_SECRET = SECRET;
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = VERIFY;
    process.env.WHATSAPP_PHONE_NUMBER_ID = "100000000000001";
    store.recordInboundEvents.mockClear();
    store.processInboundEvent.mockClear();
  });

  afterEach(() => cfg.setWhatsAppConfirmBootStatus(null));

  afterAll(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) Reflect.deleteProperty(process.env, k);
      else process.env[k] = saved[k];
    }
  });

  it("off: both routes answer 404 and nothing is stored", async () => {
    setMode("off");
    const a = await app();
    const get = await a.inject({ method: "GET", url: `/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=42` });
    const post = await a.inject({
      method: "POST",
      url: "/api/webhooks/whatsapp",
      headers: { "content-type": "application/json", "x-hub-signature-256": sign(RAW, SECRET) },
      payload: RAW,
    });
    expect(get.statusCode).toBe(404);
    expect(post.statusCode).toBe(404);
    expect(store.recordInboundEvents).not.toHaveBeenCalled();
  });

  it("GET handshake: echoes the challenge only for the right verify token", async () => {
    setMode("shadow");
    const a = await app();
    const ok = await a.inject({ method: "GET", url: `/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=4242` });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toBe("4242");
    const bad = await a.inject({ method: "GET", url: "/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=4242" });
    expect(bad.statusCode).toBe(403);
  });

  it("POST: missing, malformed, wrong-secret or re-serialised signatures are 401 and store nothing", async () => {
    setMode("shadow");
    const a = await app();
    const post = (sig?: string) =>
      a.inject({
        method: "POST",
        url: "/api/webhooks/whatsapp",
        headers: { "content-type": "application/json", ...(sig ? { "x-hub-signature-256": sig } : {}) },
        payload: RAW,
      });
    expect((await post()).statusCode).toBe(401);
    expect((await post("sha256=zz")).statusCode).toBe(401);
    expect((await post(sign(RAW, "other-secret"))).statusCode).toBe(401);
    // Signed over the parsed-then-stringified body instead of the raw bytes.
    expect((await post(sign(JSON.stringify(JSON.parse(RAW)), SECRET))).statusCode).toBe(401);
    expect(store.recordInboundEvents).not.toHaveBeenCalled();
  });

  it("POST: no app secret configured → 401 even with a 'valid' signature", async () => {
    setMode("shadow");
    Reflect.deleteProperty(process.env, "WHATSAPP_APP_SECRET");
    const a = await app();
    const res = await a.inject({
      method: "POST",
      url: "/api/webhooks/whatsapp",
      headers: { "content-type": "application/json", "x-hub-signature-256": sign(RAW, "") },
      payload: RAW,
    });
    expect(res.statusCode).toBe(401);
    expect(store.recordInboundEvents).not.toHaveBeenCalled();
  });

  it("POST: a signature over the exact raw bytes is accepted, stored, then processed", async () => {
    setMode("shadow");
    const a = await app();
    const res = await a.inject({
      method: "POST",
      url: "/api/webhooks/whatsapp",
      headers: { "content-type": "application/json", "x-hub-signature-256": sign(RAW, SECRET) },
      payload: RAW,
    });
    expect(res.statusCode).toBe(200);
    expect(store.recordInboundEvents).toHaveBeenCalledTimes(1);
    const events = store.recordInboundEvents.mock.calls[0]?.[1] as Array<{ kind: string; wamid: string }>;
    expect(events.map((e) => [e.kind, e.wamid])).toEqual([["message", "wamid.ROUTE1"]]);
    await flush();
    await flush();
    expect(store.processInboundEvent).toHaveBeenCalledTimes(1);
    expect((store.processInboundEvent.mock.calls[0] as unknown[])[2]).toMatchObject({ mode: "shadow" });
  });

  it("POST: a correctly signed body that is not JSON is 400 and stores nothing", async () => {
    setMode("shadow");
    const a = await app();
    const raw = "{not json";
    const res = await a.inject({
      method: "POST",
      url: "/api/webhooks/whatsapp",
      headers: { "content-type": "application/json", "x-hub-signature-256": sign(raw, SECRET) },
      payload: raw,
    });
    expect(res.statusCode).toBe(400);
    expect(store.recordInboundEvents).not.toHaveBeenCalled();
  });

  it("the raw-body parser is scoped to the plugin: sibling routes still get parsed JSON", async () => {
    setMode("shadow");
    const a = await app();
    const res = await a.inject({ method: "POST", url: "/api/other", headers: { "content-type": "application/json" }, payload: RAW });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { isBuffer: boolean; body: { object?: string } };
    expect(body.isBuffer).toBe(false);
    expect(body.body.object).toBe("whatsapp_business_account");
  });
});
