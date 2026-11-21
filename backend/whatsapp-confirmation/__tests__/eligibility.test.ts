import { describe, expect, it } from "vitest";
import { parsePilotAllowlist, WA_MODES, type WhatsAppConfirmMode } from "#root/shared/config/whatsapp-confirmation";
import { checkoutOptInVisible, hasCheckoutConsent, maySendTo } from "../eligibility";
import { decideResponse } from "../decide";

/**
 * The checkout opt-in rule per mode, and the consent rule a real send needs.
 * Owner decision (2026-11-21): off / shadow hidden; pilot only for an
 * allow-listed number; live for everyone. The allow-list never replaces the
 * shopper's tick.
 */
const cfg = { pilotAllowlist: parsePilotAllowlist("201009990001") };
const ALLOWED_FORMS = ["01009990001", "+20 100 999 0001", "201009990001", "0100-999-0001"];
const OTHER = "01009990002";
const LANDLINE = "0225551234";

describe("checkoutOptInVisible — all four modes", () => {
  it("off and shadow: hidden for every number, including allow-listed ones", () => {
    for (const mode of ["off", "shadow"] as const) {
      for (const phone of [...ALLOWED_FORMS, OTHER, LANDLINE, "", undefined, null]) {
        expect(checkoutOptInVisible(mode, cfg, phone), `${mode} ${phone}`).toBe(false);
      }
    }
  });

  it("pilot: shown only for an allow-listed mobile number, in any common format", () => {
    for (const phone of ALLOWED_FORMS) expect(checkoutOptInVisible("pilot", cfg, phone), phone).toBe(true);
    for (const phone of [OTHER, LANDLINE, "", "0100999000", "not a number", undefined, null]) {
      expect(checkoutOptInVisible("pilot", cfg, phone), String(phone)).toBe(false);
    }
  });

  it("pilot with an empty allow-list: hidden for everyone", () => {
    for (const phone of ALLOWED_FORMS) expect(checkoutOptInVisible("pilot", { pilotAllowlist: new Set() }, phone)).toBe(false);
  });

  it("live: shown for everyone (even before a number is typed)", () => {
    for (const phone of [...ALLOWED_FORMS, OTHER, LANDLINE, "", undefined, null]) {
      expect(checkoutOptInVisible("live", cfg, phone), String(phone)).toBe(true);
    }
  });

  it("covers every mode the config knows", () => {
    expect([...WA_MODES].sort()).toEqual(["live", "off", "pilot", "shadow"]);
  });
});

describe("maySendTo — who could be messaged (NOT consent)", () => {
  it("off/shadow never; pilot allow-list only; live anyone with a mobile", () => {
    const table: Array<[WhatsAppConfirmMode, string | null, boolean]> = [
      ["off", "201009990001", false],
      ["shadow", "201009990001", false],
      ["pilot", "201009990001", true],
      ["pilot", "201009990002", false],
      ["live", "201009990002", true],
      ["live", null, false],
    ];
    for (const [mode, phone, expected] of table) expect(maySendTo(mode, cfg, phone), `${mode} ${phone}`).toBe(expected);
  });
});

describe("hasCheckoutConsent — only an explicit checkout tick counts", () => {
  it("checkout + timestamp → consented; shadow_not_asked, null or a missing timestamp → not", () => {
    expect(hasCheckoutConsent({ consentSource: "checkout", consentAt: new Date() })).toBe(true);
    expect(hasCheckoutConsent({ consentSource: "shadow_not_asked", consentAt: null })).toBe(false);
    expect(hasCheckoutConsent({ consentSource: "pilot_allowlist", consentAt: new Date() })).toBe(false);
    expect(hasCheckoutConsent({ consentSource: null, consentAt: null })).toBe(false);
    expect(hasCheckoutConsent({ consentSource: "checkout", consentAt: null })).toBe(false);
  });
});

describe("decideResponse — a confirm without consent never changes the order", () => {
  const facts = { action: "confirm" as const, orderStatus: "pending" as const, archived: false, absLinked: false, current: { state: "sent" as const, response: null, statusApplied: false } };
  it("real recipient + consent → applied; real recipient without consent → skipped no_consent", () => {
    expect(decideResponse({ ...facts, canAct: true, consented: true }).applyProcessing).toBe(true);
    const d = decideResponse({ ...facts, canAct: true, consented: false });
    expect(d).toMatchObject({ applyProcessing: false, skipReason: "no_consent", newState: "confirmed" });
  });
  it("not a real recipient (shadow) → never applied, whatever the consent", () => {
    for (const consented of [true, false]) {
      expect(decideResponse({ ...facts, canAct: false, consented })).toMatchObject({ applyProcessing: false, skipReason: "shadow" });
    }
  });
});
