import { describe, expect, it } from "vitest";
import { parsePilotAllowlist, WA_MODES } from "#root/shared/config/whatsapp-confirmation";
import {
  CURRENT_WHATSAPP_CONSENT_VERSION,
  isWhatsAppConsentRequiredError,
  isWhatsAppConsentVersion,
  WHATSAPP_CONSENT_REQUIRED_MESSAGE,
  WHATSAPP_CONSENT_TEXTS,
  whatsappConsentText,
} from "#root/shared/whatsapp/consent-text";
import { checkoutConsentRequired, checkoutOptInVisible } from "../eligibility";
import { planCheckoutConsent } from "../consent";

/**
 * The REQUIRED WhatsApp acknowledgment (owner decision 2026-11-26): a COD
 * order this mode would really message cannot be placed without the
 * shopper's own tick, and the tick is recorded with the exact text shown.
 * Never required for card payments, off / shadow, a non-allow-listed pilot
 * number or a landline. Never assumed: no tick → no evidence, ever.
 */
const cfg = { pilotAllowlist: parsePilotAllowlist("201009990001") };
const ALLOWED = "01009990001";
const OTHER = "01009990002";
const LANDLINE = "0225551234";

describe("checkoutConsentRequired", () => {
  it("live: required for every COD order to a mobile number, in any written form", () => {
    for (const phone of [ALLOWED, OTHER, "+20 100 999 0002", "201009990002", "0100-999-0002"]) {
      expect(checkoutConsentRequired("live", cfg, phone, "cod"), phone).toBe(true);
    }
  });
  it("pilot: required only for an allow-listed number", () => {
    expect(checkoutConsentRequired("pilot", cfg, ALLOWED, "cod")).toBe(true);
    expect(checkoutConsentRequired("pilot", cfg, "+20 100 999 0001", "cod")).toBe(true);
    expect(checkoutConsentRequired("pilot", cfg, OTHER, "cod")).toBe(false);
  });
  it("never in off / shadow, never for card payments, never for a landline or no number", () => {
    for (const mode of WA_MODES) {
      for (const pm of ["stripe", "paymob"]) expect(checkoutConsentRequired(mode, cfg, ALLOWED, pm), `${mode} ${pm}`).toBe(false);
      for (const phone of [LANDLINE, "", null, undefined]) expect(checkoutConsentRequired(mode, cfg, phone, "cod"), `${mode} ${phone}`).toBe(false);
    }
    for (const mode of ["off", "shadow"] as const) expect(checkoutConsentRequired(mode, cfg, ALLOWED, "cod")).toBe(false);
  });
  it("whenever the tick is required, checkout shows the box (the shopper can always give it)", () => {
    for (const mode of WA_MODES) {
      for (const phone of [ALLOWED, OTHER, LANDLINE]) {
        if (checkoutConsentRequired(mode, cfg, phone, "cod")) expect(checkoutOptInVisible(mode, cfg, phone), `${mode} ${phone}`).toBe(true);
      }
    }
  });
});

describe("planCheckoutConsent", () => {
  const base = { config: cfg, customerPhone: OTHER, paymentMethod: "cod", consentVersion: CURRENT_WHATSAPP_CONSENT_VERSION, consentLocale: "en" };

  it("live COD without the tick is refused; with it, the exact text is recorded", () => {
    expect(planCheckoutConsent({ ...base, mode: "live", whatsappOptIn: false })).toEqual({ kind: "refuse" });
    expect(planCheckoutConsent({ ...base, mode: "live", whatsappOptIn: true })).toEqual({
      kind: "record",
      evidence: {
        phoneRaw: OTHER,
        phoneE164: "201009990002",
        consentTextVersion: "checkout-v2",
        consentLocale: "en",
        consentText: WHATSAPP_CONSENT_TEXTS["checkout-v2"].en,
        required: true,
        mode: "live",
      },
    });
  });

  it("the stored text is the server's, by version and language — never anything the client sends", () => {
    const ar = planCheckoutConsent({ ...base, mode: "live", whatsappOptIn: true, consentLocale: "ar" });
    expect(ar.kind === "record" && ar.evidence.consentText).toBe(WHATSAPP_CONSENT_TEXTS["checkout-v2"].ar);
    // Unknown locale → English; unknown or missing version → the old optional box (what an old build showed).
    const odd = planCheckoutConsent({ ...base, mode: "live", whatsappOptIn: true, consentLocale: "fr", consentVersion: "<script>" });
    expect(odd.kind === "record" && odd.evidence).toMatchObject({ consentTextVersion: "checkout-v1", consentLocale: "en", consentText: WHATSAPP_CONSENT_TEXTS["checkout-v1"].en });
    const legacy = planCheckoutConsent({ ...base, mode: "live", whatsappOptIn: true, consentVersion: undefined });
    expect(legacy.kind === "record" && legacy.evidence.consentTextVersion).toBe("checkout-v1");
  });

  it("off records nothing and refuses nothing", () => {
    expect(planCheckoutConsent({ ...base, mode: "off", whatsappOptIn: false })).toEqual({ kind: "none" });
    expect(planCheckoutConsent({ ...base, mode: "off", whatsappOptIn: true })).toEqual({ kind: "none" });
  });

  it("shadow / non-allow-listed pilot: not required; a tick (if any) is still recorded as given", () => {
    for (const mode of ["shadow", "pilot"] as const) {
      expect(planCheckoutConsent({ ...base, mode, whatsappOptIn: false })).toEqual({ kind: "none" });
      const r = planCheckoutConsent({ ...base, mode, whatsappOptIn: true });
      expect(r.kind === "record" && r.evidence.required, mode).toBe(false);
    }
  });

  it("pilot allow-listed: refused without the tick, the allow-list alone is never consent", () => {
    expect(planCheckoutConsent({ ...base, customerPhone: ALLOWED, mode: "pilot", whatsappOptIn: false })).toEqual({ kind: "refuse" });
    const r = planCheckoutConsent({ ...base, customerPhone: ALLOWED, mode: "pilot", whatsappOptIn: true });
    expect(r.kind === "record" && r.evidence.required).toBe(true);
  });

  it("card payments: never refused, and a tick is not recorded (nothing is ever sent for them)", () => {
    for (const mode of WA_MODES) {
      for (const tick of [true, false]) expect(planCheckoutConsent({ ...base, mode, paymentMethod: "paymob", whatsappOptIn: tick })).toEqual({ kind: "none" });
    }
  });

  it("a landline in live is not refused (staff confirm it by hand)", () => {
    expect(planCheckoutConsent({ ...base, customerPhone: LANDLINE, mode: "live", whatsappOptIn: false })).toEqual({ kind: "none" });
  });
});

describe("consent text", () => {
  it("every version has both languages, names the business and WhatsApp", () => {
    for (const [v, t] of Object.entries(WHATSAPP_CONSENT_TEXTS)) {
      expect(isWhatsAppConsentVersion(v)).toBe(true);
      expect(t.en, v).toMatch(/WhatsApp/);
      expect(t.ar, v).toMatch(/واتساب/);
    }
    const cur = WHATSAPP_CONSENT_TEXTS[CURRENT_WHATSAPP_CONSENT_VERSION];
    expect(cur.en).toMatch(/Percé/);
    expect(cur.ar).toMatch(/Percé/);
    // It says how to stop, in words the webhook's opt-out parser understands.
    expect(cur.en).toMatch(/STOP/);
    expect(cur.ar).toMatch(/إيقاف/);
    expect(whatsappConsentText("checkout-v2", "ar")).toBe(cur.ar);
  });
  it("rejects prototype keys and junk as versions", () => {
    for (const v of ["toString", "__proto__", "", null, 2, "checkout-v3"]) expect(isWhatsAppConsentVersion(v), String(v)).toBe(false);
  });
  it("the refusal message is recognisable by checkout", () => {
    expect(isWhatsAppConsentRequiredError(WHATSAPP_CONSENT_REQUIRED_MESSAGE)).toBe(true);
    expect(isWhatsAppConsentRequiredError("Shipping fee changed")).toBe(false);
    expect(isWhatsAppConsentRequiredError(undefined)).toBe(false);
  });
});
