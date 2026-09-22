import { describe, expect, it } from "vitest";
import {
  buildShippingSnapshot,
  describeUnavailableQuote,
  quoteShippingFromRules,
  selectQuoteProvider,
} from "../service";
import { flatFeeShippingProvider } from "../providers/flat-fee";
import { manualZoneShippingProvider } from "../providers/manual-zone";
import type { StoredShippingRules } from "../rules-store";
import { DEFAULT_SHIPPING_RULES, type ShippingRulesConfig } from "#root/shared/shipping/rules";

const cart = { subtotal: 300, itemCount: 2 };
const updatedAt = new Date("2026-09-20T10:00:00.000Z");

const flatStore = (flatFee: number): StoredShippingRules => ({
  rules: DEFAULT_SHIPPING_RULES,
  flatFee,
  updatedAt,
});

const zoneStore = (
  rules: Partial<ShippingRulesConfig> = {},
  flatFee = 999, // deliberately absurd: must never leak into a zones quote
): StoredShippingRules => ({
  rules: {
    version: 1,
    mode: "zones",
    currency: "EGP",
    rates: { CAI: 60, ALX: 75, SSI: null },
    fallbackFee: 90,
    ...rules,
  },
  flatFee,
  updatedAt,
});

describe("selectQuoteProvider", () => {
  it("flat → FlatFee, zones → ManualZone", () => {
    expect(selectQuoteProvider("flat")).toBe(flatFeeShippingProvider);
    expect(selectQuoteProvider("zones")).toBe(manualZoneShippingProvider);
  });
});

describe("flat mode (shipping_rules NULL) — backward compatibility", () => {
  it("quotes the store fee with no destination, exactly as the old cart did", () => {
    const { mode, quote } = quoteShippingFromRules(flatStore(45), null, cart);
    expect(mode).toBe("flat");
    expect(quote).toMatchObject({ available: true, provider: "flat", amount: 45, rateSource: "flat", governorateCode: null });
  });

  it("ignores the governorate: same fee for Cairo and Aswan, but records the pick", () => {
    const cairo = quoteShippingFromRules(flatStore(45), "CAI", cart).quote;
    const aswan = quoteShippingFromRules(flatStore(45), "ASW", cart).quote;
    expect(cairo).toMatchObject({ available: true, amount: 45, governorateCode: "CAI", governorateName: "Cairo" });
    expect(aswan).toMatchObject({ available: true, amount: 45, governorateCode: "ASW", governorateName: "Aswan" });
  });

  it("a 0 flat fee is still an available quote (free), not 'pending'", () => {
    expect(quoteShippingFromRules(flatStore(0), null, cart).quote).toMatchObject({ available: true, amount: 0 });
  });
});

describe("zones mode — ManualZoneShippingProvider", () => {
  it("needs a destination: no governorate → destination_required", () => {
    const { mode, quote } = quoteShippingFromRules(zoneStore(), null, cart);
    expect(mode).toBe("zones");
    expect(quote).toEqual({
      available: false,
      provider: "manual_zone",
      reason: "destination_required",
      governorateCode: null,
      governorateName: null,
    });
  });

  it("prices a listed governorate from its own rate", () => {
    expect(quoteShippingFromRules(zoneStore(), "CAI", cart).quote).toMatchObject({
      available: true,
      provider: "manual_zone",
      method: "standard",
      amount: 60,
      currency: "EGP",
      rateSource: "governorate_rate",
      governorateCode: "CAI",
      governorateName: "Cairo",
    });
    expect(quoteShippingFromRules(zoneStore(), "ALX", cart).quote).toMatchObject({ amount: 75 });
  });

  it("prices an unlisted governorate from the explicit fallback", () => {
    expect(quoteShippingFromRules(zoneStore(), "ASW", cart).quote).toMatchObject({
      available: true,
      amount: 90,
      rateSource: "fallback",
      governorateCode: "ASW",
      governorateName: "Aswan",
    });
  });

  it("an explicitly unavailable governorate cannot be quoted", () => {
    expect(quoteShippingFromRules(zoneStore(), "SSI", cart).quote).toEqual({
      available: false,
      provider: "manual_zone",
      reason: "destination_unavailable",
      governorateCode: "SSI",
      governorateName: "South Sinai",
    });
  });

  it("an unlisted governorate with a null fallback is unavailable", () => {
    expect(quoteShippingFromRules(zoneStore({ fallbackFee: null }), "ASW", cart).quote).toMatchObject({
      available: false,
      reason: "destination_unavailable",
    });
  });

  it("never reads the flat fee column as a hidden fallback", () => {
    const store = zoneStore({ rates: { CAI: 60 }, fallbackFee: null }, 5);
    expect(quoteShippingFromRules(store, "ASW", cart).quote.available).toBe(false);
    expect(quoteShippingFromRules(store, "CAI", cart).quote).toMatchObject({ amount: 60 });
  });
});

describe("describeUnavailableQuote — the create-order rejection wording", () => {
  it("asks for a governorate when none was chosen", () => {
    const quote = quoteShippingFromRules(zoneStore(), null, cart).quote;
    if (quote.available) throw new Error("expected unavailable");
    expect(describeUnavailableQuote(quote)).toMatch(/select your governorate/i);
  });

  it("names the destination we cannot serve", () => {
    const quote = quoteShippingFromRules(zoneStore(), "SSI", cart).quote;
    if (quote.available) throw new Error("expected unavailable");
    expect(describeUnavailableQuote(quote)).toBe(
      "We don't deliver to South Sinai yet. Please choose another destination.",
    );
  });
});

describe("buildShippingSnapshot — what gets frozen on the order", () => {
  it("records the rule fee, the charged fee and whether an offer waived it", () => {
    const quote = quoteShippingFromRules(zoneStore(), "CAI", cart).quote;
    if (!quote.available) throw new Error("expected available");
    const now = new Date("2026-09-22T12:00:00.000Z");
    expect(
      buildShippingSnapshot({ quote, mode: "zones", freeShippingApplied: true, chargedFee: 0, rulesUpdatedAt: updatedAt, now }),
    ).toEqual({
      version: 1,
      provider: "manual_zone",
      method: "standard",
      mode: "zones",
      governorateCode: "CAI",
      governorateName: "Cairo",
      rateSource: "governorate_rate",
      ruleFee: 60,
      freeShippingApplied: true,
      chargedFee: 0,
      currency: "EGP",
      quotedAt: "2026-09-22T12:00:00.000Z",
      rulesUpdatedAt: "2026-09-20T10:00:00.000Z",
    });
  });

  it("flat-mode snapshot has no governorate and a null rules revision when the row never existed", () => {
    const quote = quoteShippingFromRules({ ...flatStore(45), updatedAt: null }, null, cart).quote;
    if (!quote.available) throw new Error("expected available");
    expect(buildShippingSnapshot({ quote, mode: "flat", freeShippingApplied: false, chargedFee: 45, rulesUpdatedAt: null })).toMatchObject({
      provider: "flat",
      mode: "flat",
      governorateCode: null,
      rateSource: "flat",
      ruleFee: 45,
      chargedFee: 45,
      freeShippingApplied: false,
      rulesUpdatedAt: null,
    });
  });
});
