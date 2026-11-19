import { describe, expect, it } from "vitest";
import { hasStoreContact, mailtoHref, resolveStoreContact, telHref } from "../store-contact";

describe("telHref", () => {
  it.each([
    ["01035790911", "tel:01035790911"],
    ["010 3579 0911", "tel:01035790911"],
    ["+20 (10) 3579-0911", "tel:+201035790911"],
  ])("%s → %s", (input, href) => {
    expect(telHref(input)).toBe(href);
  });

  it("is null when nothing dialable is left", () => {
    expect(telHref(" - ")).toBeNull();
  });
});

describe("mailtoHref", () => {
  it("links a real-looking address", () => {
    expect(mailtoHref(" hello@example.com ")).toBe("mailto:hello@example.com");
  });
  it("refuses a value that is not an address", () => {
    expect(mailtoHref("not an email")).toBeNull();
  });
});

describe("resolveStoreContact", () => {
  const configured = {
    contactPhone: "01035790911",
    contactEmail: "hello@example.com",
    contactAddress: "12 Example St\nCairo",
    contactAddressAr: "١٢ شارع المثال\nالقاهرة",
  };

  it("returns the configured phone, email and address with their links", () => {
    expect(resolveStoreContact(configured, "en")).toEqual({
      phone: { display: "01035790911", href: "tel:01035790911" },
      email: { display: "hello@example.com", href: "mailto:hello@example.com" },
      address: "12 Example St\nCairo",
    });
  });

  it("uses the Arabic address in Arabic and falls back to English when it is blank", () => {
    expect(resolveStoreContact(configured, "ar").address).toBe("١٢ شارع المثال\nالقاهرة");
    expect(resolveStoreContact({ ...configured, contactAddressAr: " " }, "ar").address).toBe(
      "12 Example St\nCairo",
    );
  });

  it("has no address at all when none is configured — nothing is guessed", () => {
    for (const blank of [{}, { contactAddress: "" }, { contactAddress: "   ", contactAddressAr: "" }]) {
      const contact = resolveStoreContact({ ...configured, contactAddress: undefined, contactAddressAr: undefined, ...blank }, "en");
      expect(contact.address).toBeUndefined();
      expect(contact.phone).toBeDefined();
    }
  });

  it("is empty when nothing is configured", () => {
    const contact = resolveStoreContact({}, "en");
    expect(contact).toEqual({});
    expect(hasStoreContact(contact)).toBe(false);
  });
});
