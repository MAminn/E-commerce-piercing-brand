import { describe, expect, it, vi } from "vitest";
import { createHash, webcrypto } from "node:crypto";
import {
  hashMetaIdentityWeb,
  isSha256Hex,
  normalizeCountry,
  normalizeEgyptPhone,
  normalizeEmail,
  normalizeExternalId,
  normalizeMetaIdentity,
  normalizeZip,
  splitName,
} from "#root/shared/tracking/meta-user-data";
import {
  hashMetaIdentity,
  hashSessionIdentity,
  sha256Hex,
} from "#root/backend/pixel-tracking/meta-user-data";
import { matchFromOrderRow, PURCHASE_MATCH_MAX_AGE_MS } from "#root/backend/pixel-tracking/purchase-match";
import { attachMetaUserData, processTrackingBeacon } from "#root/backend/pixel-tracking/delivery-pipeline";
import { buildMetaEvent, buildUserData } from "#root/backend/pixel-tracking/server-adapters/meta-capi-adapter";
import { enrichEvents, type EnrichedTrackingEvent } from "#root/backend/pixel-tracking/event-logger";
import { purchaseEventId } from "#root/frontend/tracking/purchase-event";
import { TrackingEventName, type TrackingEvent } from "#root/shared/types/pixel-tracking";
import type { ServerContext } from "#root/server/routes/track";
import { makePipelineFakeDb, metaServerConfig } from "./pipeline-fake-db";

const sha = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");

describe("normalisation (Meta customer-information rules)", () => {
  it("email: trimmed + lowercased; invalid → omitted", () => {
    expect(normalizeEmail("  Mona.Hassan+bf@Gmail.COM ")).toBe("mona.hassan+bf@gmail.com");
    for (const bad of ["", "   ", "no-at-sign", "a@b", "a b@c.com", null, undefined]) expect(normalizeEmail(bad)).toBeNull();
  });

  it("phone: Egyptian numbers → E.164 digits without '+'", () => {
    for (const [raw, want] of [
      ["01012345678", "201012345678"],
      ["010 1234 5678", "201012345678"],
      ["+20 10 1234 5678", "201012345678"],
      ["0020-10-1234-5678", "201012345678"],
      ["201012345678", "201012345678"],
      ["1012345678", "201012345678"],
      ["٠١٠١٢٣٤٥٦٧٨", "201012345678"], // Arabic-Indic digits
      ["0223456789", "20223456789"], // Cairo landline
    ] as const) {
      expect(normalizeEgyptPhone(raw), raw).toBe(want);
    }
    for (const bad of ["", "abc", "123", "0101234", "999999999999999", null]) expect(normalizeEgyptPhone(bad)).toBeNull();
  });

  it("name: first token → fn, rest → ln; lowercase, no punctuation/spaces; Arabic kept", () => {
    expect(splitName("  Mona   El-Sayed Hassan ")).toEqual({ fn: "mona", ln: "elsayedhassan" });
    expect(splitName("Mona")).toEqual({ fn: "mona", ln: null });
    expect(splitName("منى حسن")).toEqual({ fn: "منى", ln: "حسن" });
    expect(splitName("")).toEqual({ fn: null, ln: null });
  });

  it("country → ISO alpha-2 lowercase; zip → compact; external id → trimmed lowercase", () => {
    expect(normalizeCountry("Egypt")).toBe("eg");
    expect(normalizeCountry("EG")).toBe("eg");
    expect(normalizeCountry("مصر")).toBe("eg");
    expect(normalizeCountry("Atlantis")).toBeNull();
    expect(normalizeZip(" 115 11 ")).toBe("11511");
    expect(normalizeZip("")).toBeNull();
    expect(normalizeExternalId(" 0193F000-AAAA ")).toBe("0193f000-aaaa");
    expect(normalizeExternalId("   ")).toBeNull();
  });

  it("absent identifiers produce no keys at all (never an empty or hashed-empty value)", () => {
    expect(normalizeMetaIdentity({})).toEqual({});
    expect(hashMetaIdentity({ email: "", phone: "  ", name: "", country: "" })).toEqual({});
    expect(hashSessionIdentity(undefined)).toBeNull();
    expect(hashSessionIdentity({ email: "", phone: "", name: "" })).toBeNull();
  });
});

describe("hashing", () => {
  it("SHA-256 lowercase hex of the normalised value (known vector)", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hashMetaIdentity({ email: " A@B.co " })).toEqual({ em: sha("a@b.co") });
    for (const v of Object.values(hashMetaIdentity({ email: "a@b.co", phone: "01012345678", name: "A B", externalId: "x" }))) {
      expect(isSha256Hex(v)).toBe(true);
    }
  });

  it("browser (Web Crypto) and server (node:crypto) produce byte-identical digests", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const input = { email: " Shopper@Example.com", phone: "010 1234 5678", name: "Mona Hassan", externalId: "0193F000-AAAA" };
    expect(await hashMetaIdentityWeb(input)).toEqual(hashMetaIdentity(input));
    vi.unstubAllGlobals();
  });

  it("browser without SubtleCrypto (insecure context) → nothing, never the raw value", async () => {
    vi.stubGlobal("crypto", {});
    expect(await hashMetaIdentityWeb({ email: "a@b.co", externalId: "x" })).toEqual({});
    vi.unstubAllGlobals();
  });
});

const ctx: ServerContext = {
  ip: "203.0.113.7",
  ipHash: "h",
  userAgent: "UA",
  fbp: "fb.1.1.2",
  fbc: "fb.1.3.Click",
};
const ev = (over: Partial<TrackingEvent> = {}): TrackingEvent => ({
  eventId: "e1",
  eventName: TrackingEventName.PAGE_VIEWED,
  timestamp: 1_731_500_000_000,
  pageUrl: "https://perce.test/shop",
  sessionId: "Sess-1",
  ...over,
});

describe("CAPI user_data builder", () => {
  it("anonymous: IP / UA / fbp / fbc unhashed, nothing else", () => {
    const [e] = enrichEvents([ev()], ctx);
    expect(buildUserData(e as EnrichedTrackingEvent)).toEqual({ client_ip_address: "203.0.113.7", client_user_agent: "UA", fbp: "fb.1.1.2", fbc: "fb.1.3.Click" });
  });

  it("fbp / fbc preserved exactly as the cookies hold them; absent cookies → absent keys", () => {
    const [e] = enrichEvents([ev()], { ...ctx, fbp: undefined, fbc: undefined });
    expect(buildUserData(e as EnrichedTrackingEvent)).toEqual({ client_ip_address: "203.0.113.7", client_user_agent: "UA" });
  });

  it("copies only SHA-256 digests from metaUserData — a raw value can never pass", () => {
    const [base] = enrichEvents([ev()], ctx);
    const e: EnrichedTrackingEvent = {
      ...(base as EnrichedTrackingEvent),
      metaUserData: { em: "raw@example.com", ph: sha("201012345678"), external_id: sha("sess-1") },
    };
    const ud = buildUserData(e);
    expect(ud.em).toBeUndefined();
    expect(ud.ph).toBe(sha("201012345678"));
    expect(ud.external_id).toBe(sha("sess-1"));
    expect(JSON.stringify(ud)).not.toContain("raw@example.com");
  });

  it("full event shape: name, time (s), id, source url, action_source, user_data, custom_data", () => {
    const [e] = enrichEvents(
      [
        ev({
          eventName: TrackingEventName.PRODUCT_ADDED_TO_CART,
          ecommerce: { currency: "EGP", value: 220, items: [{ itemId: "p1", itemName: "Ring", quantity: 2, category: "Rings" }] },
        }),
      ],
      ctx,
    );
    expect(buildMetaEvent(e as EnrichedTrackingEvent)).toEqual({
      event_name: "AddToCart",
      event_time: 1_731_500_000,
      event_id: "e1",
      event_source_url: "https://perce.test/shop",
      action_source: "website",
      user_data: { client_ip_address: "203.0.113.7", client_user_agent: "UA", fbp: "fb.1.1.2", fbc: "fb.1.3.Click" },
      custom_data: {
        value: 220,
        currency: "EGP",
        content_ids: ["p1"],
        contents: [{ id: "p1", quantity: 2 }],
        content_type: "product",
        content_name: "Ring",
        content_category: "Rings",
        num_items: 2,
      },
    });
  });
});

const ORDER = "0193a6c1-0000-7000-8000-00000000abcd";
const row = (over: Record<string, unknown> = {}) => ({
  id: ORDER,
  createdAt: new Date("2026-11-28T10:00:00Z"),
  paymentStatus: "not_required",
  status: "pending",
  customerEmail: "Mona@Example.com",
  customerPhone: "01012345678",
  customerName: "Mona Hassan",
  shippingCity: "Giza",
  shippingState: "Giza",
  shippingPostalCode: "12511",
  shippingCountry: "Egypt",
  ...over,
});
const NOW = new Date("2026-11-28T10:05:00Z");

describe("Purchase ↔ order match (enrichment rules)", () => {
  it("placed COD order / paid online order → hashed em, ph, fn, ln, ct, st, zp, country", () => {
    const want = {
      em: sha("mona@example.com"),
      ph: sha("201012345678"),
      fn: sha("mona"),
      ln: sha("hassan"),
      ct: sha("giza"),
      st: sha("giza"),
      zp: sha("12511"),
      country: sha("eg"),
    };
    expect(matchFromOrderRow(row(), NOW)).toEqual({ orderId: ORDER, hashedUserData: want });
    expect(matchFromOrderRow(row({ paymentStatus: "paid" }), NOW)?.hashedUserData).toEqual(want);
  });

  it.each([
    ["missing", undefined],
    ["pending payment", row({ paymentStatus: "pending" })],
    ["processing payment", row({ paymentStatus: "processing" })],
    ["failed payment", row({ paymentStatus: "failed" })],
    ["cancelled", row({ status: "cancelled" })],
    ["older than 24 h", row({ createdAt: new Date(NOW.getTime() - PURCHASE_MATCH_MAX_AGE_MS - 1) })],
  ])("%s → no match", (_label, r) => {
    expect(matchFromOrderRow(r as never, NOW)).toBeNull();
  });
});

describe("attachMetaUserData (pipeline step, relay copies only)", () => {
  const purchase = (over: Partial<TrackingEvent> = {}) =>
    ev({
      eventId: purchaseEventId(ORDER),
      eventName: TrackingEventName.CHECKOUT_COMPLETED,
      ecommerce: { currency: "EGP", value: 270, transactionId: ORDER },
      ...over,
    });
  const match = { orderId: ORDER, hashedUserData: { em: sha("mona@example.com") } };

  it("Purchase stored first by this beacon → order hashes + external_id; inputs untouched", async () => {
    const enriched = enrichEvents([purchase()], ctx);
    const getPurchaseMatch = vi.fn(async () => match);
    const [out] = await attachMetaUserData(enriched, { insertedEventIds: new Set([purchaseEventId(ORDER)]), getPurchaseMatch });
    expect(out?.metaUserData).toEqual({ em: sha("mona@example.com"), external_id: sha("sess-1") });
    expect(getPurchaseMatch).toHaveBeenCalledWith(ORDER);
    expect(enriched[0]?.metaUserData).toBeUndefined();
    // value / currency / ids unchanged
    expect(out?.ecommerce).toEqual(enriched[0]?.ecommerce);
    expect(out?.eventId).toBe(enriched[0]?.eventId);
  });

  it.each([
    ["already stored (replay)", purchase(), new Set<string>()],
    ["event id is not purchase-<order id>", purchase({ eventId: "forged" }), new Set(["forged"])],
    ["no order id", purchase({ ecommerce: { currency: "EGP", value: 1 } }), new Set([purchaseEventId(ORDER)])],
  ])("Purchase %s → no order lookup, no customer data", async (_l, e, inserted) => {
    const getPurchaseMatch = vi.fn(async () => match);
    const [out] = await attachMetaUserData(enrichEvents([e], ctx), { insertedEventIds: inserted, getPurchaseMatch });
    expect(getPurchaseMatch).not.toHaveBeenCalled();
    expect(out?.metaUserData).toEqual({ external_id: sha("sess-1") });
  });

  it("signed-in shopper's hashed account fields go on non-Purchase events (and a Purchase without an order match)", async () => {
    const sessionIdentity = { em: sha("acct@example.com") };
    const out = await attachMetaUserData(enrichEvents([ev(), purchase()], ctx), {
      insertedEventIds: new Set(["e1", purchaseEventId(ORDER)]),
      sessionIdentity,
      getPurchaseMatch: async () => null,
    });
    expect(out.map((e) => e.metaUserData)).toEqual([
      { em: sha("acct@example.com"), external_id: sha("sess-1") },
      { em: sha("acct@example.com"), external_id: sha("sess-1") },
    ]);
  });

  it("processTrackingBeacon: enrichment failure never blocks the relay (plain events are sent)", async () => {
    const fake = makePipelineFakeDb({ configs: [metaServerConfig] });
    const sent: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: unknown, init?: { body?: unknown }) => {
        sent.push(JSON.parse(String(init?.body)));
        return new Response("{}", { status: 200 });
      }),
    );
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await processTrackingBeacon([purchase()], ctx, fake.db, {
      metaAdvancedMatching: true,
      loadPurchaseMatch: async () => {
        throw new Error("boom with Mona@Example.com");
      },
    });
    expect(sent).toHaveLength(1);
    const data = (sent[0] as { data: Array<{ event_id: string; user_data: Record<string, unknown> }> }).data;
    expect(data[0]?.event_id).toBe(purchaseEventId(ORDER));
    expect(data[0]?.user_data.em).toBeUndefined();
    expect(JSON.stringify(err.mock.calls)).not.toContain("Mona@Example.com");
    expect(fake.deliveries).toHaveLength(1);
    vi.unstubAllGlobals();
    err.mockRestore();
  });
});
