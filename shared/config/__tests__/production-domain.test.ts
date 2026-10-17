import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * perce-eg.com is Percé's CURRENT production domain (owner-confirmed,
 * October 2026). It used to be listed as a retired domain; nothing may treat
 * it that way again.
 */

const URL_KEYS = ["VITE_STORE_URL", "STORE_URL", "PUBLIC_ORIGIN", "BASE_URL"] as const;

async function freshBranding(env: Partial<Record<(typeof URL_KEYS)[number], string>>) {
  vi.resetModules();
  for (const key of URL_KEYS) {
    vi.stubEnv(key, env[key] ?? "");
  }
  return import("#root/shared/config/branding");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("production domain", () => {
  it("is perce-eg.com", async () => {
    const branding = await freshBranding({});
    expect(branding.PRODUCTION_STORE_URL).toBe("https://perce-eg.com");
  });

  it("is the store URL whenever no environment sets one", async () => {
    const branding = await freshBranding({});
    expect(branding.STORE_URL).toBe("https://perce-eg.com");
  });

  it("never mistakes Vite's base path for an origin", async () => {
    const branding = await freshBranding({ BASE_URL: "/" });
    expect(branding.STORE_URL).toBe("https://perce-eg.com");
  });

  it("still lets an environment point emails at itself (staging/dev)", async () => {
    const branding = await freshBranding({ PUBLIC_ORIGIN: "https://staging.example.test/" });
    expect(branding.STORE_URL).toBe("https://staging.example.test");
  });

  it("is not on the retired-domain list used for customer emails", async () => {
    vi.resetModules();
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync("backend/emails/branding.ts", "utf8"),
    );
    const retiredBlock = source.slice(source.indexOf("const RETIRED_EMAIL_DOMAINS"));
    expect(retiredBlock.slice(0, retiredBlock.indexOf("];"))).not.toContain("perce-eg.com");
  });
});

describe("support contact", () => {
  it("defaults to the owner-confirmed inbox and WhatsApp number", async () => {
    const branding = await freshBranding({});
    expect(branding.DEFAULT_SUPPORT_EMAIL).toBe("piercingperce@gmail.com");
    expect(branding.SUPPORT_WHATSAPP_DISPLAY).toBe("+20 103 579 0911");
    expect(branding.SUPPORT_WHATSAPP_URL).toBe("https://wa.me/201035790911");
  });

  it("formats Egyptian mobile numbers for display", async () => {
    const { formatWhatsAppNumber } = await freshBranding({});
    expect(formatWhatsAppNumber("+201035790911")).toBe("+20 103 579 0911");
    expect(formatWhatsAppNumber("201112223333")).toBe("+20 111 222 3333");
  });
});
