import { describe, expect, it } from "vitest";
import { LayoutSettingsSchema } from "../trpc";
import { getStorefrontLayoutSettingsRaw } from "../get-layout-settings-raw";
import { DEFAULT_LAYOUT_SETTINGS, type LayoutSettings } from "#root/shared/types/layout-settings";

/** The optional footer/contact address survives save and load. */

const withAddress = (contactAddress?: string, contactAddressAr?: string): LayoutSettings => ({
  ...DEFAULT_LAYOUT_SETTINGS,
  footer: { ...DEFAULT_LAYOUT_SETTINGS.footer, contactAddress, contactAddressAr },
});

const { contactAddress: _a, contactAddressAr: _b, ...footerWithoutAddress } =
  DEFAULT_LAYOUT_SETTINGS.footer;

function dbReturning(content: unknown) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [{ content }] }),
      }),
    }),
  } as never;
}

describe("layout settings: contact address", () => {
  it("the save schema keeps the address rather than stripping it", () => {
    const parsed = LayoutSettingsSchema.parse(withAddress("12 Example St", "١٢ شارع المثال"));
    expect(parsed.footer.contactAddress).toBe("12 Example St");
    expect(parsed.footer.contactAddressAr).toBe("١٢ شارع المثال");
  });

  it("the save schema accepts a row with no address at all", () => {
    const parsed = LayoutSettingsSchema.parse({ ...DEFAULT_LAYOUT_SETTINGS, footer: footerWithoutAddress });
    expect(parsed.footer.contactAddress).toBeUndefined();
  });

  it("rejects an address over 500 characters", () => {
    expect(() => LayoutSettingsSchema.parse(withAddress("x".repeat(501)))).toThrow();
  });

  it("the storefront loader returns a stored address", async () => {
    const loaded = await getStorefrontLayoutSettingsRaw(dbReturning(withAddress("12 Example St")), "m", undefined);
    expect(loaded.footer.contactAddress).toBe("12 Example St");
  });

  it("a row saved before the field existed loads with an empty address", async () => {
    const loaded = await getStorefrontLayoutSettingsRaw(
      dbReturning({ ...DEFAULT_LAYOUT_SETTINGS, footer: footerWithoutAddress }),
      "m",
      undefined,
    );
    expect(loaded.footer.contactAddress).toBe("");
  });
});
