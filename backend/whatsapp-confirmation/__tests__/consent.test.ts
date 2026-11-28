import { describe, expect, it } from "vitest";
import {
  parseCheckoutConsentPolicy,
  parseConsentRequestDetails,
  parseConsentRetentionDays,
  parsePilotAllowlist,
  readWhatsAppConfirmConfig,
  WA_MODES,
} from "#root/shared/config/whatsapp-confirmation";
import {
  CONFIRMATION_CHOICE_TEXT,
  CURRENT_WHATSAPP_CONSENT_VERSION,
  isWhatsAppConsentRequiredError,
  MANDATORY_CHOICE_CONSENT_VERSION,
  isWhatsAppConsentVersion,
  WHATSAPP_CONSENT_REQUIRED_MESSAGE,
  WHATSAPP_CONSENT_TEXTS,
  whatsappConsentText,
} from "#root/shared/whatsapp/consent-text";
import { checkoutConsentRequired, checkoutOptInVisible } from "../eligibility";
import { anonymizeIp, consentRequestDetails, planCheckoutConsent } from "../consent";

/**
 * The WhatsApp acknowledgment at checkout. With the rollout switch
 * WHATSAPP_CHECKOUT_CONSENT_REQUIRED=true, a COD order this mode would really
 * message cannot be placed without the shopper's own tick; with it off (the
 * default) the box is optional, as before. Either way the tick is recorded
 * with the exact text shown, and it is never assumed: no tick → no evidence.
 * Never required for card payments, off / shadow, a non-allow-listed pilot
 * number or a landline.
 */
const cfg = { pilotAllowlist: parsePilotAllowlist("201009990001"), checkoutConsent: "required" as const };
const optionalCfg = { ...cfg, checkoutConsent: "optional" as const };
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

describe("rollout switch WHATSAPP_CHECKOUT_CONSENT_REQUIRED", () => {
  const base = { customerPhone: OTHER, paymentMethod: "cod", consentVersion: CURRENT_WHATSAPP_CONSENT_VERSION, consentLocale: "en" };
  it("parses only an explicit true as required; unset, false and typos keep the box optional", () => {
    expect(parseCheckoutConsentPolicy("true")).toBe("required");
    expect(parseCheckoutConsentPolicy(" TRUE ")).toBe("required");
    for (const v of [undefined, "", "false", "0", "yes", "1", "required", "ture"]) expect(parseCheckoutConsentPolicy(v), String(v)).toBe("optional");
    expect(readWhatsAppConfirmConfig({}).checkoutConsent).toBe("optional");
    expect(readWhatsAppConfirmConfig({ WHATSAPP_CHECKOUT_CONSENT_REQUIRED: "true" }).checkoutConsent).toBe("required");
  });
  it("switch off: nothing is ever refused, in any mode; a tick is still recorded, as not required", () => {
    for (const mode of WA_MODES) {
      for (const phone of [ALLOWED, OTHER, LANDLINE]) {
        expect(planCheckoutConsent({ ...base, config: optionalCfg, mode, customerPhone: phone, whatsappOptIn: false }), `${mode} ${phone}`).toEqual({ kind: "none" });
      }
    }
    const r = planCheckoutConsent({ ...base, config: optionalCfg, mode: "live", whatsappOptIn: true });
    expect(r.kind === "record" && r.evidence).toMatchObject({ required: false, consentTextVersion: "checkout-v2" });
  });
  it("switch off does not turn the confirmation system off (the mode alone decides that)", () => {
    const env = { WHATSAPP_CONFIRM_MODE: "live" };
    expect(readWhatsAppConfirmConfig(env)).toMatchObject({ requestedMode: "live", checkoutConsent: "optional" });
    expect(checkoutOptInVisible("live", optionalCfg, OTHER)).toBe(true);
  });
});

describe("consent request details (C5: data minimisation)", () => {
  it("parses the policy; default is anonymized", () => {
    expect(parseConsentRequestDetails(undefined)).toBe("anonymized");
    expect(parseConsentRequestDetails("FULL")).toBe("full");
    expect(parseConsentRequestDetails("none")).toBe("none");
    expect(parseConsentRequestDetails("everything")).toBe("anonymized");
    expect(readWhatsAppConfirmConfig({}).consentRequestDetails).toBe("anonymized");
  });
  it("anonymized: IPv4 host octet zeroed, IPv6 cut to /48, user agent never kept", () => {
    const req = { ipAddress: "203.0.113.77", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)" };
    expect(consentRequestDetails("anonymized", req)).toEqual({ ipAddress: "203.0.113.0", userAgent: null });
    expect(consentRequestDetails("none", req)).toEqual({ ipAddress: null, userAgent: null });
    expect(consentRequestDetails("full", req)).toEqual(req);
    expect(consentRequestDetails("full", { ipAddress: "1.2.3.4", userAgent: "x".repeat(900) }).userAgent).toHaveLength(400);
    expect(consentRequestDetails("anonymized", undefined)).toEqual({ ipAddress: null, userAgent: null });
  });
  it("anonymizeIp", () => {
    expect(anonymizeIp("10.20.30.40")).toBe("10.20.30.0");
    expect(anonymizeIp("::ffff:10.20.30.40")).toBe("10.20.30.0");
    expect(anonymizeIp("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe("2001:db8:85a3::");
    expect(anonymizeIp("2001:db8::1")).toBe("2001:db8:0::");
    expect(anonymizeIp("::1")).toBe("0:0:0::");
    for (const bad of [null, undefined, "", "unknown", "999.1.1.1", "1.2.3", "<script>", "10.0.0.1, 10.0.0.2"]) expect(anonymizeIp(bad), String(bad)).toBeNull();
  });
});

describe("consent retention (C5)", () => {
  it("unset → keep forever; under 30 days or not a whole number → refused (kept) and reported", () => {
    expect(parseConsentRetentionDays(undefined)).toBeNull();
    expect(parseConsentRetentionDays("365")).toBe(365);
    expect(parseConsentRetentionDays("30")).toBe(30);
    for (const v of ["29", "1", "0", "-400", "36.5", "1e3", "a year", ""]) expect(parseConsentRetentionDays(v), v).toBeNull();
    expect(readWhatsAppConfirmConfig({})).toMatchObject({ consentRetentionDays: null, consentRetentionRejected: null });
    expect(readWhatsAppConfirmConfig({ WHATSAPP_CONSENT_RETENTION_DAYS: "7" })).toMatchObject({ consentRetentionDays: null, consentRetentionRejected: "7" });
    expect(readWhatsAppConfirmConfig({ WHATSAPP_CONSENT_RETENTION_DAYS: "730" })).toMatchObject({ consentRetentionDays: 730, consentRetentionRejected: null });
  });
});

describe("checkout-v3: required confirmation-channel choice (switch on)", () => {
  const base = { config: cfg, customerPhone: OTHER, paymentMethod: "cod", consentLocale: "en", mode: "live" as const };
  it("phone call chosen → no WhatsApp, no consent, never refused", () => {
    expect(planCheckoutConsent({ ...base, whatsappOptIn: false, confirmationChannel: "phone" })).toEqual({ kind: "phone" });
    // Contradictory request (phone + tick) is read the conservative way.
    expect(planCheckoutConsent({ ...base, whatsappOptIn: true, confirmationChannel: "phone", consentVersion: "checkout-v3" })).toEqual({ kind: "phone" });
  });
  it("WhatsApp chosen → v3 evidence with the exact option text; the opt-in was NOT a condition (phone offered)", () => {
    const r = planCheckoutConsent({ ...base, whatsappOptIn: true, confirmationChannel: "whatsapp", consentVersion: "checkout-v3", consentLocale: "ar" });
    expect(r.kind === "record" && r.evidence).toMatchObject({
      consentTextVersion: "checkout-v3",
      consentText: WHATSAPP_CONSENT_TEXTS["checkout-v3"].ar,
      required: false,
    });
  });
  it("no choice → refused; an older page's plain tick under the switch is still accepted and marked as required", () => {
    expect(planCheckoutConsent({ ...base, whatsappOptIn: false })).toEqual({ kind: "refuse" });
    const legacy = planCheckoutConsent({ ...base, whatsappOptIn: true, consentVersion: "checkout-v2" });
    expect(legacy.kind === "record" && legacy.evidence).toMatchObject({ consentTextVersion: "checkout-v2", required: true });
  });
  it("switch off: a channel, if sent, is ignored (optional box rules)", () => {
    expect(planCheckoutConsent({ ...base, config: optionalCfg, whatsappOptIn: false, confirmationChannel: "phone" })).toEqual({ kind: "none" });
  });
  it("not required for this order (card, landline, shadow): phone channel ignored, nothing refused", () => {
    expect(planCheckoutConsent({ ...base, paymentMethod: "paymob", whatsappOptIn: false, confirmationChannel: "phone" })).toEqual({ kind: "none" });
    expect(planCheckoutConsent({ ...base, customerPhone: LANDLINE, whatsappOptIn: false })).toEqual({ kind: "none" });
    expect(planCheckoutConsent({ ...base, mode: "shadow", whatsappOptIn: false })).toEqual({ kind: "none" });
  });
  it("the wording: the WhatsApp option is the v3 consent text; it names Percé, WhatsApp, the number, STOP; the phone option names no WhatsApp opt-in", () => {
    for (const loc of ["en", "ar"] as const) {
      const c = CONFIRMATION_CHOICE_TEXT[loc];
      expect(c.whatsapp).toBe(WHATSAPP_CONSENT_TEXTS["checkout-v3"][loc]);
      expect(c.whatsapp).toMatch(/Percé/);
      expect(c.notice).toMatch(/Percé/);
      expect(c.phone).toMatch(/Percé/);
    }
    expect(CONFIRMATION_CHOICE_TEXT.en.whatsapp).toMatch(/WhatsApp.*phone number above.*STOP/);
    expect(CONFIRMATION_CHOICE_TEXT.ar.whatsapp).toMatch(/واتساب.*رقم الهاتف أعلاه.*إيقاف/);
    // The notice is information, not consent: it never says "I agree".
    expect(CONFIRMATION_CHOICE_TEXT.en.notice).not.toMatch(/agree|understand/i);
    expect(CONFIRMATION_CHOICE_TEXT.en.phone).toMatch(/No WhatsApp/);
    expect(MANDATORY_CHOICE_CONSENT_VERSION).toBe("checkout-v3");
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
    for (const v of ["toString", "__proto__", "", null, 2, "checkout-v4"]) expect(isWhatsAppConsentVersion(v), String(v)).toBe(false);
  });
  it("the refusal message is recognisable by checkout, and readable in both languages on an older page", () => {
    expect(isWhatsAppConsentRequiredError(WHATSAPP_CONSENT_REQUIRED_MESSAGE)).toBe(true);
    expect(WHATSAPP_CONSENT_REQUIRED_MESSAGE).toMatch(/WhatsApp/);
    expect(WHATSAPP_CONSENT_REQUIRED_MESSAGE).toMatch(/واتساب/);
    expect(isWhatsAppConsentRequiredError("Shipping fee changed")).toBe(false);
    expect(isWhatsAppConsentRequiredError(undefined)).toBe(false);
  });
});
