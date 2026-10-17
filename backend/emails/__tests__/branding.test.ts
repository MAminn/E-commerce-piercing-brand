import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@react-email/components";

/**
 * Customer emails must always carry the current brand.
 *
 * Branding used to decide the template from the storefront's navbar style:
 * only "minimal" got the Percé templates, every other style fell through to
 * older templates. And whatever site title / contact address a layout
 * settings row held was emailed verbatim — rows can predate the rebrand, so a
 * previous brand's name or inbox could reach real customers.
 */

// ─── Settings sources ───────────────────────────────────────────────────────

const env = vi.hoisted(() => ({
  storeName: "Percé",
  supportEmail: undefined as string | undefined,
}));

let layout: {
  siteTitle?: string;
  header: { navbarStyle: string; logoUrl: string; contactEmail?: string };
  footer: { socialLinks: Array<{ platform: string; url: string }> };
};
let layoutFails = false;

vi.mock("#root/backend/layout/get-layout-settings/index", () => ({
  getLayoutSettings: async () => {
    if (layoutFails) throw new Error("db down");
    return layout;
  },
}));
vi.mock("#root/backend/settings/get-template-selection-raw", () => ({
  getTemplateSelectionRaw: async () => null,
}));
vi.mock("#root/backend/email-automations/settings-service", () => ({
  getEmailAutomationSettingsRaw: async () => ({ emailLogoUrl: "" }),
}));
vi.mock("#root/shared/database/drizzle/db", () => ({ db: () => ({}) }));
vi.mock("#root/shared/config/branding", async (importOriginal) => {
  const actual = await importOriginal<object>();
  return {
    ...actual,
    get STORE_NAME() {
      return env.storeName;
    },
    get SUPPORT_EMAIL() {
      return env.supportEmail;
    },
  };
});

const { getEmailBranding } = await import("#root/backend/emails/branding");
const { OrderConfirmationEmail } = await import(
  "#root/backend/emails/minimal/order-confirmation"
);
const { buildOrderEmailModel } = await import("#root/backend/orders/order-emails/model");
const { MinimalPasswordResetTemplate } = await import(
  "#root/backend/emails/minimal/password-reset"
);
const { MinimalEmailVerificationTemplate } = await import(
  "#root/backend/emails/minimal/email-verification"
);

// perce-eg.com is the CURRENT production domain — not a previous brand.
const PREVIOUS_BRANDS = /lebsy|lebsey|synt|zeli/i;

beforeEach(() => {
  env.storeName = "Percé";
  env.supportEmail = undefined;
  layoutFails = false;
  layout = {
    siteTitle: "",
    header: { navbarStyle: "minimal", logoUrl: "", contactEmail: "" },
    footer: { socialLinks: [] },
  };
});

describe("getEmailBranding", () => {
  it("resolves the same branding whatever the navbar style", async () => {
    layout.siteTitle = "Percé";
    layout.header.contactEmail = "hello@example.com";
    const minimal = await getEmailBranding();

    for (const navbarStyle of ["classic", "centered", "transparent"]) {
      layout.header.navbarStyle = navbarStyle;
      expect(await getEmailBranding()).toEqual(minimal);
    }
    expect(minimal).not.toHaveProperty("isMinimal");
  });

  it("uses the configured site title and contact email", async () => {
    layout.siteTitle = "  percé studio  ";
    layout.header.contactEmail = " care@example.com ";
    const branding = await getEmailBranding();
    expect(branding.storeName).toBe("percé studio");
    expect(branding.contactEmail).toBe("care@example.com");
  });

  it.each([
    "Lebsy",
    "Lebsey Shop",
    "ZELI",
    "SYNT Perfumes",
  ])("ignores a stored previous-brand site title (%s)", async (title) => {
    layout.siteTitle = title;
    expect((await getEmailBranding()).storeName).toBe("Percé");
  });

  it.each([
    "support@lebsy.com",
    "cs@Lebsey.com",
    "syntperfumes@gmail.com",
    "orders@syntperfumes.com",
    "info@mail.lebsy.com",
  ])("never emails a previous brand's inbox (%s)", async (address) => {
    layout.header.contactEmail = address;
    expect((await getEmailBranding()).contactEmail).toBeUndefined();

    env.supportEmail = address;
    expect((await getEmailBranding()).contactEmail).toBeUndefined();
  });

  it.each([
    "zeli@perce.com",
    "synt@perce.eg",
    "hello@perce-egypt.com",
    "lebsy.archive@perce.com",
  ])("keeps a current-brand address whose local part holds an old word (%s)", async (address) => {
    layout.header.contactEmail = address;
    expect((await getEmailBranding()).contactEmail).toBe(address);
  });

  it("treats perce-eg.com as the current production domain", async () => {
    layout.header.contactEmail = "hello@perce-eg.com";
    expect((await getEmailBranding()).contactEmail).toBe("hello@perce-eg.com");

    layout.header.contactEmail = "";
    env.supportEmail = "orders@perce-eg.com";
    expect((await getEmailBranding()).contactEmail).toBe("orders@perce-eg.com");

    layout.siteTitle = "Percé · perce-eg.com";
    expect((await getEmailBranding()).storeName).toBe("Percé · perce-eg.com");
  });

  it("carries the website and WhatsApp contact for every email", async () => {
    const branding = await getEmailBranding();
    expect(branding.whatsappDisplay).toBe("+20 103 579 0911");
    expect(branding.whatsappUrl).toBe("https://wa.me/201035790911");
    expect(branding.websiteUrl).toMatch(/^https?:\/\//);
    expect(branding.websiteLabel).not.toMatch(/^https?:/);
  });

  it("falls back to SUPPORT_EMAIL, and to no contact line without one", async () => {
    layout.header.contactEmail = "support@lebsy.com";
    env.supportEmail = "help@example.com";
    expect((await getEmailBranding()).contactEmail).toBe("help@example.com");

    env.supportEmail = undefined;
    layout.header.contactEmail = "not an address";
    expect((await getEmailBranding()).contactEmail).toBeUndefined();
  });

  it("falls back to the brand's own name when STORE_NAME is a previous brand", async () => {
    env.storeName = "Lebsy";
    expect((await getEmailBranding()).storeName).toBe("Percé");
  });

  it("stays on the current brand when settings cannot be loaded", async () => {
    layoutFails = true;
    env.supportEmail = "support@lebsy.com";
    const branding = await getEmailBranding();
    expect(branding.storeName).toBe("Percé");
    expect(branding.contactEmail).toBeUndefined();
  });
});

describe("customer emails rendered from a pre-rebrand settings row", () => {
  beforeEach(() => {
    layout.siteTitle = "Lebsy";
    layout.header.navbarStyle = "classic";
    layout.header.contactEmail = "support@lebsy.com";
  });

  it("order confirmation", async () => {
    const b = await getEmailBranding();
    const order = buildOrderEmailModel({
      orderId: "00000000-0000-7000-8000-000000000001",
      orderNumber: 10001,
      createdAt: new Date("2026-10-17T10:00:00Z"),
      customerName: "Nour",
      customerEmail: "nour@example.com",
      customerPhone: "01000000000",
      shippingAddress: "12 Street",
      shippingCity: "Nasr City",
      shippingState: "Cairo",
      shippingGovernorateCode: "CAI",
      shippingCountry: "Egypt",
      subtotal: "450.00",
      shipping: "60.00",
      discount: null,
      total: "510.00",
      paymentMethod: "cod",
      paymentStatus: "not_required",
      promoCode: null,
      notes: null,
      items: [
        {
          id: "i1",
          name: "Star labret",
          quantity: 1,
          price: "450.00",
          discountPrice: null,
          selectedOptions: null,
          orderBundleId: null,
        },
      ],
      bundles: [],
    });
    const html = await render(
      OrderConfirmationEmail({
        order,
        storeName: b.storeName,
        logoUrl: b.logoUrl,
        supportEmail: b.contactEmail,
        whatsappDisplay: b.whatsappDisplay,
        whatsappUrl: b.whatsappUrl,
        websiteUrl: b.websiteUrl,
        websiteLabel: b.websiteLabel,
        returns: { lines: [] },
      }),
    );
    expect(html).toContain("Percé");
    expect(html).not.toMatch(PREVIOUS_BRANDS);
  });

  it("password reset", async () => {
    const b = await getEmailBranding();
    const html = await render(
      MinimalPasswordResetTemplate({
        storeName: b.storeName,
        logoUrl: b.logoUrl,
        userName: "Nour",
        resetUrl: "https://example.com/reset-password?token=t",
      }),
    );
    expect(html).toContain("Percé");
    expect(html).not.toMatch(PREVIOUS_BRANDS);
  });

  it("account verification", async () => {
    const b = await getEmailBranding();
    const html = await render(
      MinimalEmailVerificationTemplate({
        storeName: b.storeName,
        logoUrl: b.logoUrl,
        userName: "Nour",
        verificationUrl: "https://example.com/verify-email?token=t",
      }),
    );
    expect(html).toContain("Percé");
    expect(html).not.toMatch(PREVIOUS_BRANDS);
  });
});
