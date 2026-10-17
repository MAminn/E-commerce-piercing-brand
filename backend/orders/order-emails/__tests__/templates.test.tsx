// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@react-email/components";
import {
  OrderConfirmationEmail,
  orderConfirmationSubject,
  type OrderConfirmationEmailProps,
} from "#root/backend/emails/minimal/order-confirmation";
import {
  OrderAdminNotificationEmail,
  orderAdminNotificationSubject,
} from "#root/backend/emails/minimal/order-admin-notification";
import { buildOrderEmailModel, type OrderEmailInput } from "../model";
import { returnsPolicyEmailLines } from "#root/shared/legal/return-policy-content";
import { RETURNS_POLICY_POINTS } from "#root/shared/legal/returns-policy";
import { DEFAULT_HOMEPAGE_CONTENT } from "#root/shared/types/homepage-content";

const ORDER_ID = "0192f000-0000-7000-8000-00000000abcd";

/** COD: 2 × Star Labret (Gold, 8mm) @250 + Pear Arc Cuff 350→300 sale; PERCE10 −100; shipping 60. */
const baseInput = (over: Partial<OrderEmailInput> = {}): OrderEmailInput => ({
  orderId: ORDER_ID,
  orderNumber: 10001,
  createdAt: new Date("2026-10-17T10:00:00Z"),
  customerName: "Nour Hassan",
  customerEmail: "nour@example.com",
  customerPhone: "01012345678",
  shippingAddress: "12 Makram Ebeid St (Bldg 4, Apt 2)",
  shippingCity: "Nasr City",
  shippingState: "Cairo",
  shippingGovernorateCode: "CAI",
  shippingCountry: "Egypt",
  subtotal: "800.00",
  shipping: "60.00",
  discount: "100.00",
  total: "760.00",
  paymentMethod: "cod",
  paymentStatus: "not_required",
  promoCode: "PERCE10",
  notes: "Ring the bell twice",
  items: [
    {
      id: "a",
      name: "Star Labret (Color: Gold, Size: 8mm)",
      quantity: 2,
      price: "250.00",
      discountPrice: null,
      selectedOptions: { Color: "Gold", Size: "8mm" },
      orderBundleId: null,
      imageUrl: "https://perce-eg.com/uploads/star.webp?cb=x",
    },
    {
      id: "b",
      name: "Pear Arc Cuff",
      quantity: 1,
      price: "350.00",
      discountPrice: "300.00",
      selectedOptions: null,
      orderBundleId: null,
    },
  ],
  bundles: [],
  ...over,
});

const props = (over: Partial<OrderEmailInput> = {}): OrderConfirmationEmailProps => {
  const returns = returnsPolicyEmailLines(DEFAULT_HOMEPAGE_CONTENT.returnPolicy);
  return {
    order: buildOrderEmailModel(baseInput(over)),
    storeName: "Percé",
    supportEmail: "piercingperce@gmail.com",
    whatsappDisplay: "+20 103 579 0911",
    whatsappUrl: "https://wa.me/201035790911",
    websiteUrl: "https://perce-eg.com",
    websiteLabel: "perce-eg.com",
    returns: { lines: returns.lines, policyUrl: "https://perce-eg.com/return-policy" },
  };
};

async function renderCustomer(over: Partial<OrderEmailInput> = {}) {
  const html = await render(OrderConfirmationEmail(props(over)));
  const doc = new DOMParser().parseFromString(html, "text/html");
  const en = doc.querySelector('[data-lang="en"]') as HTMLElement;
  const ar = doc.querySelector('[data-lang="ar"]') as HTMLElement;
  return { html, doc, en, ar };
}

/** The numeric value printed in a totals row, read back from the HTML. */
function printedAmount(section: HTMLElement, kind: string): number {
  const row = section.querySelector(`[data-total="${kind}"]`);
  if (!row) return 0;
  const cells = row.querySelectorAll("td");
  const text = cells[cells.length - 1]!.textContent ?? "";
  const match = text.replace(/,/g, "").match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

const text = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ");

describe("customer order confirmation email", () => {
  it("has a clearly separated English section and a right-to-left Arabic section", async () => {
    const { en, ar, html } = await renderCustomer();
    expect(en.getAttribute("dir")).toBe("ltr");
    expect(en.getAttribute("lang")).toBe("en");
    expect(ar.getAttribute("dir")).toBe("rtl");
    expect(ar.getAttribute("lang")).toBe("ar");
    expect((ar.getAttribute("style") ?? "").replace(/\s/g, "")).toContain("direction:rtl");
    expect((ar.getAttribute("style") ?? "").replace(/\s/g, "")).toContain("text-align:right");
    // English first, Arabic after the divider.
    expect(html.indexOf('data-lang="en"')).toBeLessThan(html.indexOf("العربية"));
    expect(html.indexOf("العربية")).toBeLessThan(html.indexOf('data-lang="ar"'));
    // Each section's rows are laid out in its own direction.
    for (const row of ar.querySelectorAll("table")) {
      if (row.hasAttribute("dir")) expect(row.getAttribute("dir")).toBe("rtl");
    }
  });

  it("says 'Order confirmed' and shows the order number and date in both languages", async () => {
    const { en, ar } = await renderCustomer();
    expect(text(en)).toContain("Order confirmed");
    expect(text(ar)).toContain("تم تأكيد طلبك");
    expect(text(en)).toContain("Hi Nour Hassan");
    expect(text(ar)).toContain("مرحبًا Nour Hassan");
    for (const section of [en, ar]) expect(text(section)).toContain("#10001");
    expect(text(en)).toContain("17 October 2026");
    expect(text(ar)).toContain("17 أكتوبر 2026");
  });

  it("prints subtotal − discount + shipping = total, from the printed numbers, in both languages", async () => {
    const { en, ar } = await renderCustomer();
    for (const section of [en, ar]) {
      const subtotal = printedAmount(section, "subtotal");
      const discount = printedAmount(section, "discount");
      const shipping = printedAmount(section, "shipping");
      const total = printedAmount(section, "total");
      expect([subtotal, discount, shipping, total]).toEqual([800, 100, 60, 760]);
      expect(subtotal - discount + shipping).toBe(total);
    }
    expect(text(en)).toContain("EGP 760");
    expect(text(ar)).toContain("760 ج.م.");
  });

  it("shows the promo code on the discount line", async () => {
    const { en, ar } = await renderCustomer();
    expect(text(en.querySelector('[data-total="discount"]')!)).toContain("Discount (code PERCE10)");
    expect(text(ar.querySelector('[data-total="discount"]')!)).toContain("الخصم (كود PERCE10)");
  });

  it("shows product, variant, quantity, unit price and line total", async () => {
    const { en, ar } = await renderCustomer();
    expect(text(en)).toContain("Star Labret");
    expect(text(en)).toContain("Color: Gold · Size: 8mm");
    expect(text(en)).toContain("Qty: 2 × EGP 250");
    expect(text(en)).toContain("EGP 500"); // line total 2 × 250
    // Sale line: regular price struck through, sale price charged.
    expect(text(en)).toContain("EGP 350 EGP 300");
    // Product data is identical in Arabic — never translated.
    expect(text(ar)).toContain("Star Labret");
    expect(text(ar)).toContain("Color: Gold · Size: 8mm");
    expect(text(ar)).toContain("الكمية: 2 ×");
  });

  it("includes product thumbnails when the product has an image", async () => {
    const { en } = await renderCustomer();
    const imgs = [...en.querySelectorAll("img")].map((i) => i.getAttribute("src"));
    expect(imgs).toContain("https://perce-eg.com/uploads/star.webp?cb=x");
  });

  it("uses Cash on Delivery wording for a COD order", async () => {
    const { en, ar } = await renderCustomer();
    expect(text(en)).toContain("Cash on delivery");
    expect(text(en)).toContain("please have EGP 760 ready to pay when your order arrives");
    expect(text(ar)).toContain("الدفع عند الاستلام");
    expect(text(ar)).toContain("يُرجى تجهيز مبلغ");
  });

  it("says paid online — and nothing about cash — for a paid online order", async () => {
    const { en, ar } = await renderCustomer({ paymentMethod: "paymob", paymentStatus: "paid" });
    expect(text(en)).toContain("Paid online");
    expect(text(en)).not.toContain("Cash on delivery");
    expect(text(ar)).toContain("تم الدفع أونلاين");
    expect(text(ar)).not.toContain("الدفع عند الاستلام");
  });

  it("shows the delivery address, city, governorate and phone", async () => {
    const { en, ar } = await renderCustomer();
    expect(text(en)).toContain("12 Makram Ebeid St (Bldg 4, Apt 2)");
    expect(text(en)).toContain("Nasr City, Cairo");
    expect(text(ar)).toContain("Nasr City، القاهرة");
    expect(text(en)).toContain("01012345678");
  });

  it("renders the approved returns policy in both languages, with a link to the policy page", async () => {
    const { en, ar } = await renderCustomer();
    expect(text(en)).toContain("Eligible orders can be returned within 14 days.");
    expect(text(en)).toContain(
      "If a jewellery piece changes colour, contact Percé for a return even outside the standard 14-day window.",
    );
    expect(text(ar)).toContain("يمكن إرجاع الطلبات المؤهلة خلال 14 يومًا.");
    expect(text(ar)).toContain(
      "إذا تغيّر لون قطعة المجوهرات، تواصل مع Percé لطلب الإرجاع حتى بعد انتهاء فترة الـ14 يومًا المعتادة.",
    );
    const links = [...en.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(links).toContain("https://perce-eg.com/return-policy");
  });

  it("never turns the colour-change remedy into a product claim", async () => {
    const { html } = await renderCustomer();
    for (const claim of [/tarnish/i, /never change/i, /waterproof/i, /lifetime/i, /guarantee/i, /warranty/i]) {
      expect(html).not.toMatch(claim);
    }
  });

  it("links perce-eg.com, WhatsApp and the support email, in both languages", async () => {
    const { en, ar } = await renderCustomer();
    for (const section of [en, ar]) {
      const links = [...section.querySelectorAll("a")].map((a) => a.getAttribute("href"));
      expect(links).toContain("https://wa.me/201035790911");
      expect(links).toContain("mailto:piercingperce@gmail.com");
      expect(links).toContain("https://perce-eg.com");
      expect(text(section)).toContain("+20 103 579 0911");
      expect(text(section)).toContain("perce-eg.com");
    }
  });

  it("is Percé-branded", async () => {
    const { doc } = await renderCustomer();
    expect(text(doc.body)).toContain("percé");
    expect(text(doc.body)).toContain("Percé");
  });

  it("exposes no internal ids, merchant data or notes", async () => {
    const { html } = await renderCustomer();
    expect(html).not.toContain(ORDER_ID);
    expect(html).not.toMatch(/internal|cost price|costPrice/i);
    expect(html).not.toContain("Ring the bell twice"); // notes are for the store only
    expect(html).not.toMatch(/token|secret|password/i);
  });

  it("puts the order number in a bilingual subject", () => {
    const subject = orderConfirmationSubject(buildOrderEmailModel(baseInput()), "Percé");
    expect(subject).toBe("Percé order #10001 confirmed | تم تأكيد طلبك");
  });
});

describe("store (admin) new-order notification", () => {
  const model = buildOrderEmailModel(baseInput());

  it("is a separate operational email, not the customer one", async () => {
    const html = await render(
      OrderAdminNotificationEmail({ order: model, storeName: "Percé", dashboardUrl: "https://perce-eg.com/dashboard/orders" }),
    );
    const body = text(new DOMParser().parseFromString(html, "text/html").body);
    expect(body).not.toMatch(/thank you|dear|Order confirmed|تم تأكيد|مرحبًا/i);
    expect(body).not.toContain("Eligible orders can be returned");
    expect(body).toContain("Order #10001");
    expect(body).toContain("Cash on delivery — collect EGP 760");
    expect(body).toContain("2 × Star Labret");
    expect(body).toContain("Color: Gold · Size: 8mm");
    expect(body).toContain("01012345678");
    expect(body).toContain("12 Makram Ebeid St (Bldg 4, Apt 2)");
    expect(body).toContain("Ring the bell twice");
    expect(html).toContain("https://perce-eg.com/dashboard/orders");
  });

  it("has a subject the team can scan", () => {
    expect(orderAdminNotificationSubject(model)).toBe("New order #10001 — EGP 760 (COD)");
  });
});

describe("returns lines come from the published CMS policy", () => {
  it("uses the published steps when the page is on", () => {
    const { lines, published } = returnsPolicyEmailLines({
      ...DEFAULT_HOMEPAGE_CONTENT.returnPolicy!,
      steps: [
        { ...DEFAULT_HOMEPAGE_CONTENT.returnPolicy!.steps[0]!, description: "Edited by admin.", descriptionAr: "" },
      ],
    });
    expect(published).toBe(true);
    // Arabic falls back to the English text when left blank, like the page.
    expect(lines).toEqual([{ en: "Edited by admin.", ar: "Edited by admin." }]);
  });

  it("falls back to the approved points when the page is switched off", () => {
    const { lines, published } = returnsPolicyEmailLines({
      ...DEFAULT_HOMEPAGE_CONTENT.returnPolicy!,
      enabled: false,
      intro: "An admin-written intro",
    });
    expect(published).toBe(false);
    expect(lines.map((l) => l.en)).toEqual(RETURNS_POLICY_POINTS.map((p) => p.text));
  });
});
