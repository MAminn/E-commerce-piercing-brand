import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProductPagePremium } from "../ProductPagePremium";

/**
 * The Premium product template used to print a hardcoded
 * "+ EGP 45 standard shipping · Free above EGP 300" under the price. Neither
 * figure was backed by anything: shipping is priced per governorate at
 * checkout and there is no store-wide free-shipping threshold. It must not
 * come back.
 */
describe("ProductPagePremium — shipping copy", () => {
  it("shows no invented flat shipping fee or free-shipping threshold", () => {
    const html = renderToStaticMarkup(createElement(ProductPagePremium, {}));
    expect(html).not.toMatch(/EGP\s*45/);
    expect(html).not.toMatch(/standard shipping/i);
    expect(html).not.toMatch(/free above/i);
    // The product itself still renders and stays purchasable.
    expect(html).toMatch(/EGP\s*\d/);
  });
});
